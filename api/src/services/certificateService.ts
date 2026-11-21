import crypto from 'crypto';
import fs from 'fs';
import { CertificateRepository, CertificateRecord } from '../repositories/certificateRepository.js';
import { DeliveryRepository } from '../repositories/deliveryRepository.js';
import { CandidateRepository } from '../repositories/candidateRepository.js';
import { generateCertificatePdf } from './pdfService.js';
import { env } from '../config/env.js';

export interface CertificateJobData {
  candidateId: string;
  candidateName: string;
  candidatePhone: string;
  candidateScore: number;
  courseName: string;
  batchId: string;
}

export interface VerificationResult {
  status: 'valid' | 'cancelled' | 'not_found';
  cert_number?: string | number;
  course_name?: string;
  issue_date?: string;
  candidate_name_masked?: string;
  verify_code?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  cached?: boolean;
}

/**
 * Mask candidate name to preserve privacy in public verification (minimal data)
 * e.g. "Rahul Sharma" -> "R**** S****"
 */
function maskCandidateName(name: string): string {
  if (!name) return '***';
  return name
    .split(' ')
    .map((part) => (part.length > 1 ? `${part[0]}${'*'.repeat(Math.min(part.length - 1, 4))}` : part))
    .join(' ');
}

export class CertificateService {
  /**
   * Process single certificate issuance worker job idempotently.
   * 1. Creates certificate (unique number, never duplicate).
   * 2. Generates PDF with QR code to verify URL, stores in private location, saves SHA-256.
   * 3. Records delivery attempt before sending.
   * 4. Sends WhatsApp message with unguessable expiring token download link via mock-whatsapp using idempotency key.
   */
  static async processCertificateJob(
    data: CertificateJobData,
    options: {
      baseUrl?: string;
      mockWhatsappUrl?: string;
    } = {}
  ): Promise<{ certificate: CertificateRecord; deliveryStatus: string }> {
    const baseUrl = options.baseUrl || 'http://localhost:3000';
    const mockWhatsappUrl =
      options.mockWhatsappUrl || process.env.MOCK_WHATSAPP_URL || 'http://localhost:4001';

    // 1. Idempotently find or create certificate
    const { certificate } = await CertificateRepository.findOrCreateCertificate(
      data.candidateId,
      data.courseName
    );

    const verifyUrl = `${baseUrl}/verify?cert_number=${certificate.cert_number}&verify_code=${certificate.verify_code}`;

    // 2. Generate PDF with QR Code (if not yet generated or file missing)
    if (!certificate.pdf_sha256 || !certificate.pdf_path || !fs.existsSync(certificate.pdf_path)) {
      const generated = await generateCertificatePdf({
        certNumber: certificate.cert_number,
        verifyCode: certificate.verify_code,
        candidateName: data.candidateName,
        courseName: data.courseName,
        score: data.candidateScore || 85,
        issueDate: new Date(certificate.created_at).toLocaleDateString(),
        verifyUrl,
      });

      await CertificateRepository.updatePdfDetails(
        certificate.id,
        generated.pdfSha256,
        generated.pdfPath
      );
      certificate.pdf_sha256 = generated.pdfSha256;
      certificate.pdf_path = generated.pdfPath;
    }

    // 3. Record delivery attempt BEFORE calling mock-whatsapp
    const idempotencyKey = `wa-cert-${certificate.id}`;
    await DeliveryRepository.recordAttemptBeforeSending({
      certificateId: certificate.id,
      channel: 'whatsapp',
      recipient: data.candidatePhone,
      idempotencyKey,
    });

    // 4. Generate unguessable expiring token download link (valid for 7 days)
    const downloadToken = CertificateService.generateDownloadToken(
      certificate.id,
      certificate.cert_number
    );
    const downloadUrl = `${baseUrl}/api/certificates/download?token=${downloadToken}`;

    const messageText = `Congratulations ${data.candidateName}! Your official certificate for "${data.courseName}" (Cert #${certificate.cert_number}) has been issued. Download PDF (expiring link): ${downloadUrl} | Verify: ${verifyUrl}`;

    // 5. Send message through mock-whatsapp with idempotency key
    try {
      const response = await fetch(`${mockWhatsappUrl}/api/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          to: data.candidatePhone,
          message: messageText,
          certNumber: String(certificate.cert_number),
          idempotencyKey,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        await DeliveryRepository.markFailed(
          idempotencyKey,
          `HTTP ${response.status}: ${errorText}`
        );
        throw new Error(`Mock WhatsApp error (${response.status}): ${errorText}`);
      }

      await DeliveryRepository.markDelivered(idempotencyKey);
      return { certificate, deliveryStatus: 'delivered' };
    } catch (err: any) {
      await DeliveryRepository.markFailed(idempotencyKey, err.message);
      throw err; // Re-throw so pg-boss retries with exponential backoff
    }
  }

  /**
   * Public Certificate Verification with Redis Short-TTL Cache.
   * Returns minimal data only to prevent PII leakage.
   */
  static async verifyCertificate(
    certNumber: string | number,
    verifyCode: string,
    redis?: any
  ): Promise<VerificationResult> {
    const cacheKey = `cert:verify:${certNumber}:${verifyCode.trim().toUpperCase()}`;

    // 1. Check Redis cache first
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          return { ...parsed, cached: true };
        }
      } catch (err) {
        // Cache miss or Redis transient warning
      }
    }

    // 2. Query Repository
    const record = await CertificateRepository.findByNumberAndCode(certNumber, verifyCode);

    if (!record) {
      const notFoundResult: VerificationResult = { status: 'not_found' };
      // Cache not found for 30 seconds to prevent query flooding
      if (redis) {
        try {
          await redis.set(cacheKey, JSON.stringify(notFoundResult), 'EX', 30);
        } catch {}
      }
      return notFoundResult;
    }

    // 3. Handle Cancelled / Revoked
    if (record.status === 'revoked') {
      const cancelledResult: VerificationResult = {
        status: 'cancelled',
        cert_number: record.cert_number,
        cancelled_at: record.cancelled_at,
        cancel_reason: record.cancel_reason || 'Certificate revoked by State Office',
      };

      if (redis) {
        try {
          await redis.set(cacheKey, JSON.stringify(cancelledResult), 'EX', 120);
        } catch {}
      }
      return cancelledResult;
    }

    // 4. Return Valid with Minimal Data
    const validResult: VerificationResult = {
      status: 'valid',
      cert_number: record.cert_number,
      course_name: record.course_name,
      issue_date: new Date(record.created_at).toLocaleDateString(),
      candidate_name_masked: maskCandidateName(record.candidate_name),
      verify_code: record.verify_code,
    };

    if (redis) {
      try {
        // Short TTL in Redis: 120 seconds
        await redis.set(cacheKey, JSON.stringify(validResult), 'EX', 120);
      } catch {}
    }

    return validResult;
  }

  /**
   * Cancel Certificate (State Office only, reason required).
   * Immediately clears the Redis verification cache!
   */
  static async cancelCertificate(
    certificateId: string,
    reason: string,
    actor: { id: string; role: string },
    redis?: any
  ): Promise<CertificateRecord> {
    const cert = await CertificateRepository.findById(certificateId);
    if (!cert) {
      throw new Error('Certificate not found');
    }

    const cancelled = await CertificateRepository.cancelCertificate(
      certificateId,
      reason,
      actor
    );

    // Immediately clear Redis cache
    if (redis) {
      const cacheKey = `cert:verify:${cert.cert_number}:${cert.verify_code.toUpperCase()}`;
      try {
        await redis.del(cacheKey);
      } catch (err) {
        console.warn('[Redis] Failed to delete cache key on cancel:', err);
      }
    }

    return cancelled;
  }

  /**
   * Generate an unguessable expiring token link for candidate PDF download.
   * Cryptographically signed with HMAC-SHA256 and expires in 7 days.
   */
  static generateDownloadToken(certId: string, certNumber: number | string): string {
    const payload = {
      certId,
      certNumber,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', env.JWT_SECRET)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  /**
   * Verify candidate expiring download token
   */
  static verifyDownloadToken(token: string): { certId: string; certNumber: string | number } {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) throw new Error('Invalid token structure');

      const [encoded, signature] = parts;
      const expectedSig = crypto
        .createHmac('sha256', env.JWT_SECRET)
        .update(encoded)
        .digest('base64url');

      if (signature !== expectedSig) {
        throw new Error('Invalid token signature');
      }

      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
      if (Date.now() > payload.exp) {
        throw new Error('Certificate download token has expired');
      }

      return { certId: payload.certId, certNumber: payload.certNumber };
    } catch (err: any) {
      throw new Error(err.message || 'Expired or invalid certificate download token');
    }
  }
}
