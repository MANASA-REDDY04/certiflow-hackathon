import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { loginRequestSchema } from '../schemas/authSchemas.js';
import { UserRepository } from '../repositories/userRepository.js';

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * List switchable seeded users for demo & testing login screen.
   */
  fastify.get('/api/auth/users', async (_request, reply) => {
    try {
      const users = await UserRepository.findAllUsers();
      return reply.send({ users });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to retrieve users' });
    }
  });

  /**
   * Login switchable user without password.
   * Resolves role and district ONLY from database records and encodes them into the signed JWT.
   */
  fastify.post('/api/auth/login', async (request, reply) => {
    const parseResult = loginRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid request body',
        issues: parseResult.error.issues,
      });
    }

    const { userId } = parseResult.data;

    try {
      const user = await UserRepository.findUserById(userId);

      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'User not found in system',
        });
      }

      // Sign JWT with role and district embedded
      const token = fastify.jwt.sign(
        {
          sub: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          district_id: user.district_id,
          centre_id: user.centre_id,
        },
        { expiresIn: '24h' }
      );

      return reply.send({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          district_id: user.district_id,
          district_name: user.district_name,
          centre_id: user.centre_id,
          centre_name: user.centre_name,
        },
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Login failed' });
    }
  });

  /**
   * Get current authenticated user details from JWT token.
   * Reads role and district ONLY from the verified token.
   */
  fastify.get(
    '/api/auth/me',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      return reply.send({
        user: request.user,
      });
    }
  );
};
