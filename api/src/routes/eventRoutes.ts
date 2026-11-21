import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { EventBus } from '../services/eventBus.js';
import { PolicyUser } from '../policies/accessControlPolicy.js';

export const eventRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * Authenticated Server-Sent Events (SSE) Endpoint
   * GET /api/events/stream?token=...
   * Filtered by user's role and assigned district, fed by Redis pub/sub.
   */
  fastify.get('/api/events/stream', async (request, reply) => {
    // 1. Authenticate user from query token or Authorization header
    const token =
      (request.query as any)?.token ||
      request.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return reply.status(401).send({ error: 'Authentication token required for SSE stream' });
    }

    let user: PolicyUser;
    try {
      const decoded = fastify.jwt.verify<any>(token);
      user = {
        id: decoded.sub,
        name: decoded.name,
        email: decoded.email,
        role: decoded.role,
        district_id: decoded.district_id,
        centre_id: decoded.centre_id,
      };
    } catch (jwtErr) {
      return reply.status(401).send({ error: 'Invalid or expired SSE authentication token' });
    }

    // 2. Set SSE Headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.flushHeaders();

    // Send initial connected acknowledgement event
    reply.raw.write(
      `data: ${JSON.stringify({
        type: 'connected',
        title: 'Real-time Channel Active',
        message: `Connected as ${user.name} (${user.role})`,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    // 3. Subscribe to EventBus with role and district filtering
    const unsubscribe = EventBus.subscribe(user, (event) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (err) {
        unsubscribe();
      }
    });

    // 4. Keep-alive ping every 15s to keep connection open across firewalls/proxies
    const keepAliveTimer = setInterval(() => {
      try {
        reply.raw.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAliveTimer);
        unsubscribe();
      }
    }, 15000);

    // 5. Cleanup on client disconnect
    request.raw.on('close', () => {
      clearInterval(keepAliveTimer);
      unsubscribe();
    });
  });
};
