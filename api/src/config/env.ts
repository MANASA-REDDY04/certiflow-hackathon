import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from local package or project root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Environment schema with passthrough for system variables.
 */
const envSchema = z
  .object({
    PORT: z
      .string()
      .optional()
      .default('4000')
      .transform((v) => parseInt(v, 10)),
    HOST: z.string().optional().default('0.0.0.0'),
    NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
    DATABASE_URL: z
      .string()
      .optional()
      .default('postgres://postgres:postgres@localhost:5432/certiflow'),
    REDIS_URL: z.string().optional().default('redis://localhost:6379'),
    JWT_SECRET: z.string().optional().default('super-secret-jwt-key-certiflow-2026'),
    JWT_EXPIRES_IN: z.string().optional().default('1d'),
    CORS_ORIGIN: z.string().optional().default('http://localhost:3000,http://127.0.0.1:3000'),
    RATE_LIMIT_MAX: z
      .string()
      .optional()
      .default('100')
      .transform((v) => parseInt(v, 10)),
    RATE_LIMIT_WINDOW_MS: z
      .string()
      .optional()
      .default('60000')
      .transform((v) => parseInt(v, 10)),
    // Demo limit shrink: allows shrinking 24h/48h SLA to seconds for fast live demos
    ESCALATION_REMINDER_SECONDS: z
      .string()
      .optional()
      .default('15') // 15 seconds in demo mode (default 86400 in prod)
      .transform((v) => parseInt(v, 10)),
    ESCALATION_STATE_SECONDS: z
      .string()
      .optional()
      .default('30') // 30 seconds in demo mode (default 172800 in prod)
      .transform((v) => parseInt(v, 10)),
    SLA_DEMO_FAST_MODE: z
      .string()
      .optional()
      .default('true')
      .transform((v) => v === 'true'),
  })
  .passthrough();

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
