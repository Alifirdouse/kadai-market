// Domain events. With SERVICEBUS_CONNECTION set, events go to an Azure Service Bus topic
// and separate worker processes consume them. Without it (local dev) an in-process
// EventEmitter delivers them to the same handlers, so the code path is identical.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { config } from '../config.js';

export const EVENTS = {
  OrderPlaced: 'OrderPlaced',
  PaymentCaptured: 'PaymentCaptured',
  PaymentFailed: 'PaymentFailed',
  OrderStatusChanged: 'OrderStatusChanged',
  StockChanged: 'StockChanged',
  ProductUpdated: 'ProductUpdated',
};

const local = new EventEmitter();
let sbClient;
let sbSender;

async function serviceBus() {
  if (!sbClient) {
    const { ServiceBusClient } = await import('@azure/service-bus');
    sbClient = new ServiceBusClient(config.serviceBus.connection);
    sbSender = sbClient.createSender(config.serviceBus.topic);
  }
  return { client: sbClient, sender: sbSender };
}

export const usingServiceBus = () => Boolean(config.serviceBus.connection);

export async function publish(type, data) {
  const event = { id: crypto.randomUUID(), type, data, occurredAt: new Date().toISOString() };
  if (usingServiceBus()) {
    const { sender } = await serviceBus();
    await sender.sendMessages({
      body: event,
      messageId: event.id, // enables Service Bus duplicate detection
      subject: type,
      applicationProperties: { type }, // subscriptions filter on this with SQL rules
      contentType: 'application/json',
    });
  } else {
    setImmediate(() => local.emit('event', event));
  }
  return event;
}

export function subscribeLocal(handler) {
  local.on('event', (event) => {
    Promise.resolve(handler(event)).catch((err) => console.error(`[event ${event.type}]`, err));
  });
}

// Used by the worker process. Throwing from the handler abandons the message so
// Service Bus retries it; after MaxDeliveryCount it moves to the dead-letter queue.
export async function subscribeServiceBus(subscriptionName, handler) {
  const { client } = await serviceBus();
  const receiver = client.createReceiver(config.serviceBus.topic, subscriptionName);
  receiver.subscribe({
    processMessage: async (message) => handler(message.body),
    processError: async (args) => console.error(`[servicebus ${subscriptionName}]`, args.error),
  });
  console.log(`Listening on topic "${config.serviceBus.topic}" / subscription "${subscriptionName}"`);
  return receiver;
}

export async function closeEvents() {
  await sbSender?.close();
  await sbClient?.close();
}
