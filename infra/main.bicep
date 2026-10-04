// Kadai Market on Azure. One deployment per environment (resource group).
//   az group create -n rg-kadai-stg -l centralindia
//   az deployment group create -g rg-kadai-stg -f infra/main.bicep -p env=stg prefix=kadai \
//      mongoUri='mongodb+srv://...' jwtSecret=<random> jwtRefreshSecret=<random> \
//      razorpayKeyId=<id> razorpayKeySecret=<secret> razorpayWebhookSecret=<secret>

@allowed(['stg', 'prod'])
param env string
param prefix string = 'kadai'
param location string = resourceGroup().location

@secure()
@description('MongoDB Atlas connection string, including the database name, e.g. mongodb+srv://user:pass@cluster.mongodb.net/kadai')
param mongoUri string

@secure()
param jwtSecret string
@secure()
param jwtRefreshSecret string
@secure()
param razorpayKeyId string = ''
@secure()
param razorpayKeySecret string = ''
@secure()
param razorpayWebhookSecret string = ''

@description('Leave as the placeholder on the first deploy; CI/CD replaces images afterwards.')
param apiImage string = 'mcr.microsoft.com/k8se/quickstart:latest'
param webImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

var name = '${prefix}-${env}'
var unique = uniqueString(resourceGroup().id)
var isProd = env == 'prod'

// ---------- Observability ----------
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${name}-logs'
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${name}-ai'
  location: location
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id }
}

// ---------- Identity used by every container app ----------
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-id'
  location: location
}

// ---------- Container registry ----------
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${prefix}acr${unique}'
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identity.id, 'acrpull')
  scope: acr
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

// ---------- Database ----------
// MongoDB Atlas, created outside this template on Azure in Central India (Atlas supports the
// $text search and indexes the product filters need). Its connection string arrives as the
// secure `mongoUri` parameter and is stored in Key Vault below.

// ---------- Messaging: Service Bus topic for order and payment events ----------
resource sb 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: '${name}-sb-${unique}'
  location: location
  sku: { name: 'Standard', tier: 'Standard' } // topics need Standard or higher
}

resource ordersTopic 'Microsoft.ServiceBus/namespaces/topics@2022-10-01-preview' = {
  parent: sb
  name: 'orders'
  properties: {
    requiresDuplicateDetection: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    defaultMessageTimeToLive: 'P7D'
  }
}

resource allEvents 'Microsoft.ServiceBus/namespaces/topics/subscriptions@2022-10-01-preview' = {
  parent: ordersTopic
  name: 'all-events'
  properties: {
    maxDeliveryCount: 10
    deadLetteringOnMessageExpiration: true
    lockDuration: 'PT1M'
  }
}

// Example of a filtered subscription: a future notifications service only receives these types
resource notifications 'Microsoft.ServiceBus/namespaces/topics/subscriptions@2022-10-01-preview' = {
  parent: ordersTopic
  name: 'notifications'
  properties: { maxDeliveryCount: 10, deadLetteringOnMessageExpiration: true }
}

resource notificationsRule 'Microsoft.ServiceBus/namespaces/topics/subscriptions/rules@2022-10-01-preview' = {
  parent: notifications
  name: 'customer-facing'
  properties: {
    filterType: 'SqlFilter'
    sqlFilter: { sqlExpression: 'type IN (\'PaymentCaptured\', \'OrderStatusChanged\')' }
  }
}

resource sbAuth 'Microsoft.ServiceBus/namespaces/AuthorizationRules@2022-10-01-preview' = {
  parent: sb
  name: 'app'
  properties: { rights: ['Send', 'Listen'] }
}

// ---------- Product images ----------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: '${prefix}${env}img${take(unique, 8)}'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { allowBlobPublicAccess: true, minimumTlsVersion: 'TLS1_2' }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource imagesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'product-images'
  properties: { publicAccess: 'Blob' }
}

// ---------- Secrets ----------
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${prefix}-${env}-kv-${take(unique, 6)}'
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
  }
}

resource kvReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, identity.id, 'kv-secrets-user')
  scope: kv
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

// Secret names are fixed so loops over them can be planned before deployment starts;
// the values (some only known during deployment) are set one resource at a time.
var secretNames = [
  'mongo-uri'
  'servicebus-connection'
  'jwt-secret'
  'jwt-refresh-secret'
  'razorpay-key-id'
  'razorpay-key-secret'
  'razorpay-webhook-secret'
]

resource secMongo 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'mongo-uri'
  properties: { value: mongoUri }
}

resource secServiceBus 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'servicebus-connection'
  properties: { value: sbAuth.listKeys().primaryConnectionString }
}

resource secJwt 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'jwt-secret'
  properties: { value: jwtSecret }
}

resource secJwtRefresh 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'jwt-refresh-secret'
  properties: { value: jwtRefreshSecret }
}

// Key Vault rejects empty secrets, so unset Razorpay values are stored as 'unset'
resource secRzpId 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'razorpay-key-id'
  properties: { value: empty(razorpayKeyId) ? 'unset' : razorpayKeyId }
}

resource secRzpSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'razorpay-key-secret'
  properties: { value: empty(razorpayKeySecret) ? 'unset' : razorpayKeySecret }
}

resource secRzpWebhook 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'razorpay-webhook-secret'
  properties: { value: empty(razorpayWebhookSecret) ? 'unset' : razorpayWebhookSecret }
}

// Container Apps read secrets straight from Key Vault through the managed identity
var kvRefs = [for s in secretNames: {
  name: s
  keyVaultUrl: 'https://${kv.name}${environment().suffixes.keyvaultDns}/secrets/${s}'
  identity: identity.id
}]

// ---------- Container Apps ----------
resource caEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${name}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: { customerId: logs.properties.customerId, sharedKey: logs.listKeys().primarySharedKey }
    }
  }
}

var apiEnv = [
  { name: 'NODE_ENV', value: 'production' }
  { name: 'PORT', value: '4000' }
  { name: 'MONGO_URI', secretRef: 'mongo-uri' }
  { name: 'SERVICEBUS_CONNECTION', secretRef: 'servicebus-connection' }
  { name: 'SERVICEBUS_TOPIC', value: 'orders' }
  { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
  { name: 'JWT_REFRESH_SECRET', secretRef: 'jwt-refresh-secret' }
  { name: 'RAZORPAY_KEY_ID', secretRef: 'razorpay-key-id' }
  { name: 'RAZORPAY_KEY_SECRET', secretRef: 'razorpay-key-secret' }
  { name: 'RAZORPAY_WEBHOOK_SECRET', secretRef: 'razorpay-webhook-secret' }
  { name: 'ALLOW_MOCK_PAYMENTS', value: isProd ? 'false' : 'true' } // staging works before Razorpay keys exist
  { name: 'CORS_ORIGIN', value: 'https://${name}-web.${caEnv.properties.defaultDomain}' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
]

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${name}-api'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  dependsOn: [acrPull, kvReader, secMongo, secServiceBus, secJwt, secJwtRefresh, secRzpId, secRzpSecret, secRzpWebhook]
  properties: {
    managedEnvironmentId: caEnv.id
    configuration: {
      ingress: { external: true, targetPort: 4000, transport: 'auto' }
      registries: [{ server: acr.properties.loginServer, identity: identity.id }]
      secrets: kvRefs
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [{
        name: 'api'
        image: apiImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: apiEnv
        probes: [{ type: 'Liveness', httpGet: { path: '/health', port: 4000 }, periodSeconds: 30 }]
      }]
      scale: { minReplicas: isProd ? 1 : 0, maxReplicas: isProd ? 5 : 2 }
    }
  }
}

resource worker 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${name}-worker'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  dependsOn: [acrPull, kvReader, secMongo, secServiceBus, secJwt, secJwtRefresh, secRzpId, secRzpSecret, secRzpWebhook]
  properties: {
    managedEnvironmentId: caEnv.id
    configuration: {
      registries: [{ server: acr.properties.loginServer, identity: identity.id }]
      secrets: kvRefs
    }
    template: {
      containers: [{
        name: 'worker'
        image: apiImage
        command: ['node', 'src/workers/index.js']
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        env: concat(apiEnv, [{ name: 'SERVICEBUS_SUBSCRIPTION', value: 'all-events' }])
      }]
      scale: { minReplicas: 1, maxReplicas: 1 } // one sweeper; scale on queue length later with a KEDA rule
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${name}-web'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  dependsOn: [acrPull]
  properties: {
    managedEnvironmentId: caEnv.id
    configuration: {
      ingress: { external: true, targetPort: 3000, transport: 'auto' }
      registries: [{ server: acr.properties.loginServer, identity: identity.id }]
    }
    template: {
      containers: [{
        name: 'web'
        image: webImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [{ name: 'API_URL', value: 'https://${api.properties.configuration.ingress.fqdn}' }]
      }]
      scale: { minReplicas: isProd ? 1 : 0, maxReplicas: isProd ? 5 : 2 }
    }
  }
}

output apiUrl string = 'https://${api.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
output acrName string = acr.name
output imagesBaseUrl string = '${storage.properties.primaryEndpoints.blob}product-images'
