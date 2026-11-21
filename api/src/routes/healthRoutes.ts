import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { checkDbConnection } from '../db/index.js';

export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Default root route for port 4000 (GET /)
  fastify.get('/', async (request, reply) => {
    const accept = request.headers.accept || '';
    if (accept.includes('text/html')) {
      return reply.redirect('/docs');
    }

    return reply.status(200).send({
      name: 'CertiFlow API',
      version: '1.0.0',
      status: 'online',
      message: 'CertiFlow Certificate Issuance Platform API is running.',
      documentation: '/docs',
      openapi: '/openapi.json',
      health: '/healthz',
      readiness: '/readyz',
      frontend: 'http://localhost:3000',
    });
  });

  // Liveness checks
  fastify.get('/health/live', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // /healthz alias
  fastify.get('/healthz', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness check: verifies DB and Redis
  fastify.get('/health/ready', async (_request, reply) => {
    const isDbConnected = await checkDbConnection();
    let isRedisConnected = false;

    try {
      if (fastify.redis) {
        const ping = await fastify.redis.ping();
        isRedisConnected = ping === 'PONG';
      }
    } catch (e) {
      isRedisConnected = false;
    }

    const isHealthy = isDbConnected && isRedisConnected;
    const statusCode = isHealthy ? 200 : 503;

    return reply.status(statusCode).send({
      status: isHealthy ? 'ready' : 'unhealthy',
      database: isDbConnected ? 'connected' : 'disconnected',
      redis: isRedisConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  // /readyz alias
  fastify.get('/readyz', async (_request, reply) => {
    const isDbConnected = await checkDbConnection();
    let isRedisConnected = false;

    try {
      if (fastify.redis) {
        const ping = await fastify.redis.ping();
        isRedisConnected = ping === 'PONG';
      }
    } catch (e) {
      isRedisConnected = false;
    }

    const isHealthy = isDbConnected && isRedisConnected;
    const statusCode = isHealthy ? 200 : 503;

    return reply.status(statusCode).send({
      status: isHealthy ? 'ready' : 'unhealthy',
      database: isDbConnected ? 'connected' : 'disconnected',
      redis: isRedisConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  // General health check
  fastify.get('/health', async (_request, reply) => {
    const isDbConnected = await checkDbConnection();
    let isRedisConnected = false;

    try {
      if (fastify.redis) {
        const ping = await fastify.redis.ping();
        isRedisConnected = ping === 'PONG';
      }
    } catch (e) {
      isRedisConnected = false;
    }

    return reply.status(200).send({
      name: 'CertiFlow API',
      version: '1.0.0',
      status: 'ok',
      services: {
        database: isDbConnected ? 'healthy' : 'degraded',
        redis: isRedisConnected ? 'healthy' : 'degraded',
      },
      timestamp: new Date().toISOString(),
    });
  });
};
