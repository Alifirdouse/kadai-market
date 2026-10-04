import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { createApp } from './app.js';
import { subscribeLocal, usingServiceBus, closeEvents } from './services/events.js';
import { handleEvent } from './workers/handlers.js';

await connectDb();

// Local development: no Service Bus, so the API process handles events itself
if (!usingServiceBus()) {
  subscribeLocal(handleEvent);
  console.log('Events: in-process (set SERVICEBUS_CONNECTION to use Azure Service Bus)');
}

const server = createApp().listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await closeEvents();
    await disconnectDb();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
