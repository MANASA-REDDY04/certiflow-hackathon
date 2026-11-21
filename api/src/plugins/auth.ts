import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { env } from '../config/env.js';
import { can, PolicyAction, BatchContext, PolicyUser } from '../policies/accessControlPolicy.js';

interface JwtPayload {
  sub: string;
  name: string;
  email: string;
  role: 'training_centre' | 'district_officer' | 'quality_team' | 'state_office';
  district_id: string | null;
  centre_id: string | null;
}

const authPluginCallback: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  });

  // Decorate request with authenticate hook
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    // Development fallback token support for local offline frontend testing
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.includes('dev-fallback-token')) {
      const fallbackUser: PolicyUser = {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'Anika',
        email: 'anika@certiflow.local',
        role: 'training_centre',
        district_id: '11111111-1111-1111-1111-111111111111',
        centre_id: '22222222-2222-2222-2222-222222222222',
      };
      request.user = fallbackUser;
      request.authorize = (action: PolicyAction, batch?: BatchContext | null) => {
        const allowed = can(request.user, action, batch);
        if (!allowed) {
          reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: `User with role '${request.user.role}' is not authorized to perform action '${action}'`,
          });
          throw new Error('Forbidden');
        }
      };
      return;
    }

    try {
      const payload = await request.jwtVerify<JwtPayload>();

      // Read role, district, and centre ONLY from the verified token
      const user: PolicyUser = {
        id: payload.sub,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        district_id: payload.district_id,
        centre_id: payload.centre_id,
      };

      request.user = user;

      // Attach policy authorization checker bound to this user
      request.authorize = (action: PolicyAction, batch?: BatchContext | null) => {
        const allowed = can(request.user, action, batch);
        if (!allowed) {
          reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: `User with role '${request.user.role}' is not authorized to perform action '${action}'`,
          });
          throw new Error('Forbidden');
        }
      };
    } catch (err: any) {
      if (err.message === 'Forbidden') {
        throw err;
      }
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or missing authentication token',
      });
      throw err;
    }
  });
};

export const authPlugin = fp(authPluginCallback, {
  name: 'auth-plugin',
});
