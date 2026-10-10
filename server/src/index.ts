import { getEnv } from './config/env.js';
import { connectDatabase, setupGracefulShutdown } from './config/db.js';
import { createApp } from './app.js';

export const SERVER_NAME = 'QueueFlow Server';

export async function bootstrap(): Promise<void> {
  // 1. Validate environment configuration immediately on startup
  const env = getEnv();

  // 2. Establish MongoDB connection with bounded retry policy
  await connectDatabase({
    uri: env.MONGO_URI,
    maxRetries: 3,
    retryDelayMs: 2000,
  });

  // 3. Instantiate Express application
  const app = createApp(env);

  // 4. Start HTTP listener
  const server = app.listen(env.PORT, () => {
    console.log(`[Server] QueueFlow API server listening on http://localhost:${env.PORT}`);
    console.log(`[Server] Environment: ${env.NODE_ENV} | Timezone: ${env.BUSINESS_TIMEZONE}`);
  });

  // 5. Register SIGINT & SIGTERM graceful shutdown hooks
  setupGracefulShutdown(server);
}

// Only execute bootstrap when executed directly (not when imported in tests)
if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err: unknown) => {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Server] Fatal bootstrap error: ${errorMsg}`);
    process.exit(1);
  });
}
