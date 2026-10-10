import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { z } from 'zod';
import { UserRole } from '@queueflow/shared';
import type { EnvConfig } from '../config/env.js';
import { getEnv } from '../config/env.js';
import { connectDatabase, closeDatabaseConnection } from '../config/db.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';

// Load environment variables from .env
dotenv.config();

export const adminCredentialsSchema = z.object({
  ADMIN_EMAIL: z
    .string({ required_error: 'ADMIN_EMAIL is required' })
    .trim()
    .toLowerCase()
    .email('ADMIN_EMAIL must be a valid email address'),
  ADMIN_INITIAL_PASSWORD: z
    .string({ required_error: 'ADMIN_INITIAL_PASSWORD is required' })
    .min(8, 'ADMIN_INITIAL_PASSWORD must be at least 8 characters long'),
});

export interface SeedAdminOptions {
  email?: string;
  password?: string;
  env?: EnvConfig;
  disconnectOnFinish?: boolean;
}

export interface SeedAdminResult {
  success: boolean;
  message: string;
  actionTaken: 'created' | 'already_exists' | 'error';
}

/**
 * Provisions the initial system administrator account.
 *
 * Security & Idempotency Rules:
 * - Reads credentials exclusively from environment variables or explicit options.
 * - Never logs passwords, connection strings, or credentials.
 * - If the admin already exists with role ADMIN, completes safely with no modification (idempotent).
 * - If an existing account with ADMIN_EMAIL exists with a different role, aborts to prevent promotion or hijacking.
 * - Never silently overwrites an existing user's password or promotes an existing customer.
 * - Closes database connections cleanly on completion.
 */
export async function seedAdmin(options?: SeedAdminOptions): Promise<SeedAdminResult> {
  const adminEmailInput = options?.email ?? process.env.ADMIN_EMAIL;
  const adminPasswordInput = options?.password ?? process.env.ADMIN_INITIAL_PASSWORD;
  const disconnectOnFinish = options?.disconnectOnFinish ?? true;

  // 1. Validate admin credentials
  const parseResult = adminCredentialsSchema.safeParse({
    ADMIN_EMAIL: adminEmailInput,
    ADMIN_INITIAL_PASSWORD: adminPasswordInput,
  });

  if (!parseResult.success) {
    const errorMessages = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    return {
      success: false,
      message: `Validation error: ${errorMessages.join(', ')}`,
      actionTaken: 'error',
    };
  }

  const { ADMIN_EMAIL: adminEmail, ADMIN_INITIAL_PASSWORD: adminPassword } = parseResult.data;

  // 2. Resolve environment configuration
  let env: EnvConfig;
  try {
    env = options?.env ?? getEnv();
  } catch (err: unknown) {
    return {
      success: false,
      message: `Environment configuration error: ${err instanceof Error ? err.message : String(err)}`,
      actionTaken: 'error',
    };
  }

  let weConnected = false;
  try {
    // 3. Connect to database if not already connected
    if (mongoose.connection.readyState !== 1) {
      await connectDatabase({
        uri: env.MONGO_URI,
        maxRetries: 2,
        retryDelayMs: 1000,
      });
      weConnected = true;
    }

    // 4. Check for existing user with this email
    const existingUser = await User.findOne({ email: adminEmail });

    if (existingUser) {
      if (existingUser.role === UserRole.ADMIN) {
        return {
          success: true,
          message: `Administrator '${adminEmail}' already exists. No action required.`,
          actionTaken: 'already_exists',
        };
      }

      return {
        success: false,
        message: `Security violation: User '${adminEmail}' already exists with role '${existingUser.role}'. Refusing to promote or overwrite password.`,
        actionTaken: 'error',
      };
    }

    // 5. Hash password with bcrypt (12 salt rounds)
    const passwordHash = await hashPassword(adminPassword);

    // 6. Create administrator user
    await User.create({
      name: 'System Administrator',
      email: adminEmail,
      phone: '000-000-0000',
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    });

    return {
      success: true,
      message: `Administrator account '${adminEmail}' provisioned successfully.`,
      actionTaken: 'created',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Unexpected failure: ${errorMsg}`,
      actionTaken: 'error',
    };
  } finally {
    if (weConnected && disconnectOnFinish) {
      await closeDatabaseConnection();
    }
  }
}

/**
 * Determines whether the script is being executed directly via CLI.
 */
function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    return path.resolve(process.argv[1]) === path.resolve(currentFilePath);
  } catch {
    return false;
  }
}

/**
 * Standalone CLI runner with exit codes.
 */
async function runCli(): Promise<void> {
  const result = await seedAdmin();
  if (!result.success) {
    console.error(`[Seed Admin] Error: ${result.message}`);
    process.exit(1);
  }
  console.log(`[Seed Admin] ${result.message}`);
  process.exit(0);
}

// Execute when run directly as a CLI script
if (isDirectExecution()) {
  runCli().catch((err: unknown) => {
    console.error('[Seed Admin] Uncaught fatal error:', err);
    process.exit(1);
  });
}
