// Background worker process (deployed as its own Azure Container App).
//   SERVICEBUS_SUBSCRIPTION=order-worker npm run worker
// Also runs the payment-timeout sweep that releases stock from unpaid orders.
import { config } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { subscribeServiceBus, usingServiceBus, closeEvents } from '../services/events.js';
import { expireUnpaidOrders } from '../services/orders.js';
import { handleEvent } from './handlers.js';

await connectDb();

let receiver;
if (usingServiceBus()) {
  receiver = await subscribeServiceBus(process.env.SERVICEBUS_SUBSCRIPTION || 'all-events', handleEvent);
} else {
  console.log('SERVICEBUS_CONNECTION is not set: running only the payment-timeout sweep. Events are handled inside the API.');
}

const sweep = async () => {
  try {
    const n = await expireUnpaidOrders(config.paymentTimeoutMinutes);
    if (n) console.log(`[sweep] expired ${n} unpaid order(s)`);
  } catch (err) {
    console.error('[sweep]', err);
  }
};
const timer = setInterval(sweep, 60_000);
sweep();

async function shutdown() {
  clearInterval(timer);
  await receiver?.close();
  await closeEvents();
  await disconnectDb();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
