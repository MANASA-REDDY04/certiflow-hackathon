import { z } from 'zod';

/**
 * Strict Zod schema for switchable user login.
 * Passwords are not needed for the seeded demo users.
 * Notice: role, district, and centre are strictly prohibited in the request body.
 * They are resolved by the server from the database and encoded into the JWT.
 */
export const loginRequestSchema = z
  .object({
    userId: z.string().uuid({ message: 'Valid user UUID is required' }),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;
