import mongoose from 'mongoose';
import type { Server } from 'http';

export interface DatabaseConnectionOptions {
  uri: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Strips password credentials from a MongoDB connection string for safe logging.
 */
export function sanitizeMongoUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    // If not a standard URL format, use regex to mask credentials between // and @
    return uri.replace(/\/\/(.*):(.*)@/, '//$1:***@');
  }
}

let isShutdownHookRegistered = false;

/**
 * Establishes connection to MongoDB with a bounded retry policy.
 */
export async function connectDatabase(
  options: DatabaseConnectionOptions
): Promise<typeof mongoose> {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 2000;
  const sanitizedUri = sanitizeMongoUri(options.uri);

  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      console.log(
        `[Database] Connecting to MongoDB (attempt ${attempt}/${maxRetries}): ${sanitizedUri}`
      );
      const conn = await mongoose.connect(options.uri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('[Database] MongoDB connection established successfully.');
      return conn;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Database] Connection attempt ${attempt}/${maxRetries} failed: ${errMsg}`);

      if (attempt >= maxRetries) {
        const failureMessage = `[Database] Failed to connect to MongoDB after ${maxRetries} attempts. Aborting startup.`;
        console.error(failureMessage);
        throw new Error(failureMessage);
      }

      console.log(`[Database] Retrying connection in ${retryDelayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(`[Database] Failed to connect to MongoDB after ${maxRetries} attempts.`);
}

/**
 * Closes the active MongoDB connection cleanly.
 */
export async function closeDatabaseConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    console.log('[Database] Closing MongoDB connection...');
    await mongoose.connection.close(false);
    console.log('[Database] MongoDB connection closed.');
  }
}

/**
 * Returns the current Mongoose connection status.
 */
export function getDatabaseState(): 'connected' | 'connecting' | 'disconnected' | 'disconnecting' {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    case 0:
    default:
      return 'disconnected';
  }
}

/**
 * Registers process signal listeners (SIGINT, SIGTERM) to close server and MongoDB cleanly.
 * Prevents multiple registrations.
 */
export function setupGracefulShutdown(server?: Server): void {
  if (isShutdownHookRegistered) {
    return;
  }
  isShutdownHookRegistered = true;

  const handleShutdown = async (signal: string) => {
    console.log(`\n[Process] Received ${signal}. Initiating graceful shutdown...`);

    if (server) {
      await new Promise<void>((resolve) => {
        server.close((err) => {
          if (err) {
            console.error('[Server] Error while closing HTTP server:', err);
          } else {
            console.log('[Server] HTTP server stopped accepting connections.');
          }
          resolve();
        });
      });
    }

    try {
      await closeDatabaseConnection();
      console.log('[Process] Graceful shutdown completed cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('[Process] Error during database shutdown:', err);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => handleShutdown('SIGINT'));
  process.once('SIGTERM', () => handleShutdown('SIGTERM'));
}

/**
 * Reset registration state for testing purposes.
 */
export function resetShutdownHookState(): void {
  isShutdownHookRegistered = false;
}
