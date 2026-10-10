import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('5000')
    .transform((val, ctx) => {
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PORT must be an integer between 1 and 65535',
        });
        return z.NEVER;
      }
      return parsed;
    }),
  MONGO_URI: z
    .string({
      required_error: 'MONGO_URI is required',
    })
    .min(1, 'MONGO_URI cannot be empty')
    .refine(
      (uri) => uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'),
      'MONGO_URI must be a valid MongoDB connection string starting with mongodb:// or mongodb+srv://'
    ),
  JWT_SECRET: z
    .string({
      required_error: 'JWT_SECRET is required',
    })
    .min(32, 'JWT_SECRET must be at least 32 characters long for security'),
  CLIENT_URL: z
    .string({
      required_error: 'CLIENT_URL is required',
    })
    .url('CLIENT_URL must be a valid URL (e.g. http://localhost:5173)'),
  BUSINESS_TIMEZONE: z
    .string()
    .default('UTC')
    .refine(
      (tz) => isValidTimeZone(tz),
      'BUSINESS_TIMEZONE must be a valid IANA timezone identifier (e.g. UTC, America/New_York)'
    ),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Format Zod validation errors into sanitized, human-readable strings.
 * Critical: Never includes actual environment variable values to prevent secret leakage.
 */
export function formatEnvErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.') || 'configuration';
    return `[Config Error] ${path}: ${issue.message}`;
  });
}

/**
 * Pure function to validate and parse an environment dictionary.
 * Does not exit the process, making it deterministic and unit-testable.
 */
export function validateEnv(rawEnv: Record<string, string | undefined>): EnvConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = formatEnvErrors(result.error);
    const error = new Error(`Environment validation failed:\n${errorDetails.join('\n')}`);
    (error as Error & { details: string[] }).details = errorDetails;
    throw error;
  }
  return result.data;
}

let cachedEnv: EnvConfig | null = null;

/**
 * Validates and returns the active runtime environment configuration.
 * On validation failure, logs sanitized error explanations and exits with code 1.
 */
export function getEnv(overrideEnv?: Record<string, string | undefined>): EnvConfig {
  if (overrideEnv) {
    return validateEnv(overrideEnv);
  }

  if (cachedEnv) {
    return cachedEnv;
  }

  try {
    cachedEnv = validateEnv(process.env);
    return cachedEnv;
  } catch (err: unknown) {
    console.error('CRITICAL: Server startup aborted due to invalid environment configuration:');
    if (
      err instanceof Error &&
      'details' in err &&
      Array.isArray((err as { details: unknown }).details)
    ) {
      for (const msg of (err as { details: string[] }).details) {
        console.error(`  - ${msg}`);
      }
    } else if (err instanceof Error) {
      console.error(`  - ${err.message}`);
    }
    process.exit(1);
  }
}

/**
 * Helper to reset cached environment for test isolation.
 */
export function resetEnvCache(): void {
  cachedEnv = null;
}
