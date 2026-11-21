import { PolicyUser, PolicyAction, BatchContext } from '../policies/accessControlPolicy.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: PolicyUser;
    authorize: (action: PolicyAction, batch?: BatchContext | null) => void;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      name: string;
      email: string;
      role: 'training_centre' | 'district_officer' | 'quality_team' | 'state_office';
      district_id: string | null;
      centre_id: string | null;
    };
    user: {
      id: string;
      name: string;
      email: string;
      role: 'training_centre' | 'district_officer' | 'quality_team' | 'state_office';
      district_id: string | null;
      centre_id: string | null;
    };
  }
}
