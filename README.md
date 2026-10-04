# Kadai Market

A multi-vendor marketplace for homegrown Kerala food brands, modelled on [HiFav](https://www.hifav.in/) with an Amazon-style shopping flow. Built as a learning project covering frontend, backend, Azure cloud architecture, messaging, payments and CI/CD.

- **Customers** browse, search and filter (in stock, new arrivals, category, brand, price, rating, discount, coming soon), add to cart, pay with UPI/cards via Razorpay, and track orders (logged in or as a guest).
- **Clients (sellers)** register their brand, wait for admin approval, then manage products, stock, the "new arrival" flag and their orders from the seller hub.
- **Admins** approve sellers and see platform sales.

## Stack

| Layer | Choice |
| --- | --- |
| Storefront + seller hub | Next.js 14 (App Router), React 18 |
| API | Node.js 20, Express 4, Mongoose, zod validation, JWT auth with refresh tokens |
| Database | MongoDB 7 locally, MongoDB Atlas (hosted on Azure, Central India) in the cloud |
| Messaging | Azure Service Bus topic `orders` (in-process event bus locally) |
| Payments | Razorpay Orders API + Checkout, signature verification, idempotent webhook |
| Infra | Bicep: Container Apps, ACR, Service Bus, Key Vault, Blob Storage, App Insights |
| CI/CD | GitHub Actions: test → build images → staging → approval → production |

## Repository layout

```
api/                 Express API and background worker (same image, different command)
  src/lib/           Pure logic with unit tests: filter query builder, totals, signatures
  src/models/        User (customer / seller / admin), Product, Cart, Order (+ per-seller sub-orders)
  src/routes/        auth, products, cart, orders (checkout, track), payments, seller, admin
  src/services/      events (Service Bus / local), razorpay, orders (stock reservation, paid/failed)
  src/workers/       event handlers + unpaid-order sweep
  test/              node:test unit tests
web/                 Next.js storefront, cart, checkout, login, orders, tracking, seller hub
infra/main.bicep     All Azure resources for one environment
.github/workflows/   CI/CD pipeline
docker-compose.yml   Local MongoDB + API + worker + web
```

## Run it locally

With Docker:

```bash
docker compose up --build
docker compose exec api node src/seed.js
# Shop:   http://localhost:3000
# API:    http://localhost:4000/health
```

Without Docker (needs a local MongoDB):

```bash
cd api && cp .env.example .env && npm install && npm run seed && npm run dev
cd web && cp .env.example .env.local && npm install && npm run dev
```

Run `npm install` once in `api/` and `web/` and commit the generated `package-lock.json` files so CI and Docker builds are reproducible.

Sample logins after seeding (password `password123`):

| Role | Email |
| --- | --- |
| Customer | asha@kadai.dev |
| Seller | kuttanad@kadai.dev (also spicecoast@, munnarleaf@, malabar@, wayanad@) |
| Admin | admin@kadai.dev |

**Payments locally.** With no Razorpay keys the API uses a mock gateway, so checkout completes end to end. To use Razorpay test mode, put your test keys in `api/.env`. To receive webhooks on your laptop, expose port 4000 with a tunnel (for example `ngrok http 4000`) and point a Razorpay test webhook at `/api/v1/payments/webhook` with events `payment.captured` and `payment.failed`.

## How the filters work

Filters live in the URL, so every result page is shareable:

```
/?category=Pickles,Snacks&inStock=1&new=1&maxPrice=200&rating=4&sort=newest
```

`api/src/lib/productQuery.js` turns those parameters into a MongoDB query:

| Filter | Rule |
| --- | --- |
| In stock | `stock > 0` |
| New arrivals | seller flagged `isNewArrival`, or created in the last 30 days |
| Coming soon | only `comingSoon` products (hidden otherwise, never purchasable) |
| Category / brand | `$in` lists; facet counts ignore their own filter so you can see what switching would give |
| Price, rating, discount | ranges and minimums; `discountPct` is stored on save so it can be indexed |

## Checkout and payment flow

1. `POST /api/v1/orders/checkout` re-prices the cart from the database, **reserves stock atomically** (`stock >= qty` in the update filter, so two buyers cannot take the last jar), creates the order as `PENDING_PAYMENT` with one sub-order per seller, and opens a Razorpay order in paise.
2. The browser opens Razorpay Checkout. On success it calls `POST /api/v1/payments/verify`; the API checks the HMAC signature.
3. Razorpay also calls `POST /api/v1/payments/webhook`. The raw-body signature is verified and each event ID is stored, so repeated deliveries are ignored.
4. Whichever arrives first moves the order to `CONFIRMED` exactly once and publishes `PaymentCaptured`.
5. The worker confirms, updates sales counts and notifies customer and sellers. Unpaid orders older than 15 minutes are marked `PAYMENT_FAILED` and their stock is released.

## Events on Service Bus (topic `orders`)

| Event | Published when | Handled by worker |
| --- | --- | --- |
| OrderPlaced | checkout creates an order | log |
| PaymentCaptured | payment verified or webhook | sales counts, notify customer and sellers |
| PaymentFailed | webhook or 15-minute timeout | release reserved stock |
| OrderStatusChanged | a seller marks packed / shipped / delivered | notify customer |
| StockChanged | stock edited or released | back-in-stock hook, search index refresh |
| ProductUpdated | product created or edited | catalogue hook |

Messages carry `messageId` (duplicate detection) and a `type` property (used by filtered subscriptions, see `notifications` in Bicep). Handlers are idempotent because Service Bus delivers at least once; failed messages retry and then land in the dead-letter queue.

## API reference (`/api/v1`)

| Method | Path | Who |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/register-seller`, `/auth/login`, `/auth/refresh` | anyone |
| GET | `/auth/me` | logged in |
| GET | `/products?…filters`, `/products/:slug`, `/products/categories` | anyone |
| GET, POST, PATCH, DELETE | `/cart`, `/cart/items/:productId` | customer |
| POST | `/orders/checkout` | customer or guest |
| GET | `/orders`, `/orders/:orderNumber` | customer |
| POST | `/orders/track` | anyone (order number + phone) |
| POST | `/payments/verify`, `/payments/webhook` | browser, Razorpay |
| GET, POST, PATCH | `/seller/summary`, `/seller/products`, `/seller/products/:id`, `/seller/products/:id/stock`, `/seller/orders`, `/seller/orders/:id/status` | approved seller |
| GET, PATCH | `/admin/sellers`, `/admin/sellers/:id`, `/admin/reports/sales` | admin |

## Deploy to Azure

Two environments, each in its own resource group: **staging** (`rg-kadai-stg`, scales to zero) and **production** (`rg-kadai-prod`). GitHub Actions builds once, deploys to staging, then promotes the same images to production after your approval.

### 0. Tools

```bash
az login
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
az provider register --namespace Microsoft.ServiceBus
```

### 1. Database: MongoDB Atlas on Azure

1. In [MongoDB Atlas](https://cloud.mongodb.com), create a project and a cluster with **Azure** as the provider and **Central India** as the region. Make one cluster (or one database name) per environment, e.g. `kadai-stg` and `kadai-prod`.
2. Database Access: add a user with a long generated password.
3. Network Access: Container Apps on the Consumption plan have no fixed outbound IP, so allow `0.0.0.0/0` for now and rely on the strong password and TLS. Lock this down later with a NAT gateway (fixed IP) or a private endpoint.
4. Copy the connection string and add the database name before the `?`:
   `mongodb+srv://kadai:<password>@<cluster>.mongodb.net/kadai?retryWrites=true&w=majority`

### 2. Infrastructure (run once per environment)

```bash
az group create -n rg-kadai-stg -l centralindia

az deployment group create -g rg-kadai-stg -f infra/main.bicep -p \
  env=stg prefix=kadai \
  mongoUri='mongodb+srv://...' \
  jwtSecret=$(openssl rand -hex 32) jwtRefreshSecret=$(openssl rand -hex 32) \
  razorpayKeyId=rzp_test_xxx razorpayKeySecret=xxx razorpayWebhookSecret=xxx

# Note the outputs: apiUrl, webUrl, acrName
az deployment group show -g rg-kadai-stg -n main --query properties.outputs -o table
```

Repeat with `rg-kadai-prod` and `env=prod` (use separate secrets and, when you go live, Razorpay live keys). The first deploy runs a placeholder image; CI/CD replaces it.

### 3. Let GitHub Actions log in to Azure (OIDC, no passwords stored)

Replace `Alifirdouse/kadai-market` with your repository.

```bash
REPO=Alifirdouse/kadai-market
APP_ID=$(az ad app create --display-name kadai-github-actions --query appId -o tsv)
SP_ID=$(az ad sp create --id $APP_ID --query id -o tsv)

# One federated credential per thing a job runs as: the main branch and each GitHub environment
for SUBJECT in "ref:refs/heads/main" "environment:staging" "environment:production"; do
  az ad app federated-credential create --id $APP_ID --parameters "{
    \"name\": \"$(echo $SUBJECT | tr ':/' '--')\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:$REPO:$SUBJECT\",
    \"audiences\": [\"api://AzureADTokenExchange\"] }"
done

for RG in rg-kadai-stg rg-kadai-prod; do
  az role assignment create --assignee-object-id $SP_ID --assignee-principal-type ServicePrincipal \
    --role Contributor --scope $(az group show -n $RG --query id -o tsv)
done

echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)"
echo "AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)"
```

### 4. Configure the repository

In GitHub → Settings:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | printed by step 3 |
| Variable | `ACR_NAME` | staging `acrName` output |
| Variable | `PROD_ACR_NAME` | production `acrName` output |
| Variable | `APP_PREFIX` | `kadai` |
| Variable | `STAGING_RG` / `PROD_RG` | `rg-kadai-stg` / `rg-kadai-prod` |
| Variable | `STAGING_API_URL` / `PROD_API_URL` | each environment's `apiUrl` output |
| Environment | `staging`, `production` | add yourself as a required reviewer on `production` |

### 5. Ship

```bash
git push origin main
```

The pipeline runs tests, builds both images tagged with the commit SHA into the staging registry, rolls out new staging revisions and smoke-tests `/health`. After you approve the `production` environment it copies the same images into the production registry (`az acr import`) and rolls them out there.

### 6. After the first deploy

- **Seed sample data** (staging only). Open the API URL once so a replica starts, then:
  `az containerapp exec -g rg-kadai-stg -n kadai-stg-api --command "node src/seed.js"`
- **Razorpay webhook:** point a webhook at `<apiUrl>/api/v1/payments/webhook` with `payment.captured` and `payment.failed`, using the same secret you passed as `razorpayWebhookSecret`.
- **Logs:** `az containerapp logs show -g rg-kadai-stg -n kadai-stg-api --follow`, or query Application Insights and Log Analytics in the portal.
- **Roll back:** every image is tagged with its commit SHA, so point the app back at the previous one: `az containerapp update -g <rg> -n <app> --image <registry>.azurecr.io/kadai-api:<previous-sha>`. `az containerapp revision list -g <rg> -n <app> -o table` shows what ran when.
- **Custom domain:** add it to the web app with `az containerapp hostname add` and a managed certificate, then update `CORS_ORIGIN` on the API.

## Next steps

- [ ] Image upload: SAS-token upload from the seller hub to Blob Storage
- [ ] Azure AI Search index fed by `ProductUpdated` / `StockChanged` for typo-tolerant search
- [ ] Email/SMS through Azure Communication Services (replace `services/notify.js`)
- [ ] Reviews and ratings, wishlist, back-in-stock alerts
- [ ] Integration tests against a MongoDB container (Testcontainers) and Playwright end-to-end tests in CI
- [ ] Razorpay Route for automatic seller payouts
