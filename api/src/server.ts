import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyRedis from '@fastify/redis';
import multipart from '@fastify/multipart';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import { env } from './config/env.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/healthRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { batchRoutes } from './routes/batchRoutes.js';
import { certificateRoutes } from './routes/certificateRoutes.js';
import { approvalRoutes } from './routes/approvalRoutes.js';
import { eventRoutes } from './routes/eventRoutes.js';
import { traceRoutes } from './routes/traceRoutes.js';
import { swaggerRoutes } from './routes/swaggerRoutes.js';
import { EventBus } from './services/eventBus.js';
import { runMigrations } from './db/migrate.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    genReqId: (req) => {
      const existingId = req.headers['x-request-id'];
      if (typeof existingId === 'string' && existingId.trim().length > 0) {
        return existingId;
      }
      return crypto.randomUUID();
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
  });

  // Security headers with @fastify/helmet
  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false,
  });

  // CORS with explicit origins
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Multipart support for candidate file uploads (5MB max)
  if ((multipart as any)[Symbol.for('plugin-meta')]) {
    (multipart as any)[Symbol.for('plugin-meta')].fastify = '>=4.x';
  }
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });

  // Redis plugin for caching and rate-limiting
  let isRedisAvailable = false;
  if (process.env.NODE_ENV !== 'test') {
    try {
      const probe = new Redis(env.REDIS_URL, {
        connectTimeout: 500,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
        lazyConnect: true,
      });
      probe.on('error', () => {}); // silence connection error
      await probe.connect();
      await probe.ping();
      probe.disconnect();

      await app.register(fastifyRedis, {
        url: env.REDIS_URL,
        closeClient: true,
      });
      isRedisAvailable = true;
      app.log.info('[Redis] Connected to Redis successfully');
    } catch {
      isRedisAvailable = false;
      app.log.warn('[Redis] Redis server offline; falling back to in-memory rate limiting & EventBus');
    }
  }

  // Rate limiting with Redis store (or in-memory fallback if Redis is offline)
  await app.register(fastifyRateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis: isRedisAvailable ? app.redis : undefined,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${context.after}`,
    }),
  });

  // Authentication plugin
  await app.register(authPlugin);

  // Initialize EventBus for real-time Redis/in-memory events
  await EventBus.initialize(app);

  // Register routes
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(batchRoutes);
  await app.register(certificateRoutes);
  await app.register(approvalRoutes);
  await app.register(eventRoutes);
  await app.register(traceRoutes);
  await app.register(swaggerRoutes);

  return app;
}

async function start() {
  try {
    await runMigrations();

    const app = await buildApp();
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`CertiFlow API listening on http://${env.HOST}:${env.PORT}`);
    app.log.info(`Swagger API Docs available at http://localhost:${env.PORT}/docs`);
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
