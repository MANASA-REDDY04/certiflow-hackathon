import { z } from 'zod';

export const verifyCertificateQuerySchema = z
  .object({
    cert_number: z.string().min(1, 'Certificate number is required'),
    verify_code: z.string().min(1, 'Verification code is required'),
  })
  .strict();

export type VerifyCertificateQuery = z.infer<typeof verifyCertificateQuerySchema>;

export const cancelCertificateSchema = z
  .object({
    cancel_reason: z
      .string()
      .min(5, 'Cancellation reason must be at least 5 characters')
      .max(500, 'Cancellation reason must not exceed 500 characters'),
  })
  .strict();

export type CancelCertificateInput = z.infer<typeof cancelCertificateSchema>;

export const downloadCertificateQuerySchema = z
  .object({
    token: z.string().min(1, 'Expiring download token is required'),
  })
  .strict();
