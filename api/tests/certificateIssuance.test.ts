import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { CertificateService, CertificateJobData } from '../src/services/certificateService.js';
import { CertificateRepository } from '../src/repositories/certificateRepository.js';

// Mock Redis client simulating cache with TTL and immediate deletion
class MockRedis {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, _exFlag: string, ttlSeconds: number): Promise<'OK'> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const deleted = this.store.delete(key);
    return deleted ? 1 : 0;
  }

  clear() {
    this.store.clear();
  }
}

// Mock WhatsApp Provider Simulating Outages, Random Failures, Timeouts & Deduplication
class SimulatedWhatsAppProvider {
  public inbox: Array<{
    id: string;
    to: string;
    message: string;
    idempotencyKey: string;
    certNumber: string;
  }> = [];

  private idempotencyMap = new Map<string, any>();
  public failureRate = 0.4; // 40% failure rate
  public timeoutDeliveredRate = 0.3; // 30% delivered but timed out

  async send(params: {
    to: string;
    message: string;
    idempotencyKey: string;
    certNumber: string;
  }): Promise<{ success: boolean; messageId: string }> {
    // 1. Idempotency Check: if already received under this idempotencyKey, return success without duplicate
    if (this.idempotencyMap.has(params.idempotencyKey)) {
      return { success: true, messageId: this.idempotencyMap.get(params.idempotencyKey).id };
    }

    // 2. Simulate "Delivered but timed out" mode
    if (Math.random() < this.timeoutDeliveredRate) {
      const msg = {
        id: crypto.randomUUID(),
        to: params.to,
        message: params.message,
        idempotencyKey: params.idempotencyKey,
        certNumber: params.certNumber,
      };
      this.inbox.push(msg);
      this.idempotencyMap.set(params.idempotencyKey, msg);

      // Caller experiences a 504 Gateway Timeout
      throw new Error('504 Gateway Timeout: provider timed out after message receipt');
    }

    // 3. Simulate Random Transient Network Failure (500)
    if (Math.random() < this.failureRate) {
      throw new Error('500 Internal Server Error: carrier connection lost');
    }

    // 4. Normal delivery
    const msg = {
      id: crypto.randomUUID(),
      to: params.to,
      message: params.message,
      idempotencyKey: params.idempotencyKey,
      certNumber: params.certNumber,
    };
    this.inbox.push(msg);
    this.idempotencyMap.set(params.idempotencyKey, msg);

    return { success: true, messageId: msg.id };
  }

  reset() {
    this.inbox = [];
    this.idempotencyMap.clear();
  }
}

describe('Certificate Issuance, Idempotent Worker & Cache Invalidation', () => {
  const mockRedis = new MockRedis();
  const simulatedProvider = new SimulatedWhatsAppProvider();

  beforeEach(() => {
    mockRedis.clear();
    simulatedProvider.reset();
  });

  it('Batch of 60 candidates with a failing provider ends with exactly 60 certificates and 60 messages', async () => {
    const candidateCount = 60;
    const batchId = crypto.randomUUID();
    const courseName = 'Electrician Competency Level 2';

    // Generate 60 candidates
    const candidates: CertificateJobData[] = [];
    for (let i = 1; i <= candidateCount; i++) {
      candidates.push({
        candidateId: `cand-uuid-${i.toString().padStart(3, '0')}`,
        candidateName: `Candidate ${i}`,
        candidatePhone: `+9198000000${i.toString().padStart(2, '0')}`,
        candidateScore: 80 + (i % 20),
        courseName,
        batchId,
      });
    }

    // Simulated worker execution with exponential retry backoff
    const issuedCertificates = new Map<string, any>();

    // Process all 60 jobs concurrently with retry loop simulating pg-boss
    await Promise.all(
      candidates.map(async (jobData) => {
        let attempts = 0;
        const maxAttempts = 10;
        let success = false;

        while (!success && attempts < maxAttempts) {
          attempts++;
          try {
            // Step 1: Idempotently find or create certificate
            const { certificate } = await CertificateRepository.findOrCreateCertificate(
              jobData.candidateId,
              jobData.courseName
            );

            issuedCertificates.set(certificate.id, certificate);

            // Step 2: Send WhatsApp message through simulated provider with idempotencyKey
            const idempotencyKey = `wa-cert-${certificate.id}`;
            await simulatedProvider.send({
              to: jobData.candidatePhone,
              message: `Official certificate issued for ${jobData.courseName} (Cert #${certificate.cert_number})`,
              idempotencyKey,
              certNumber: String(certificate.cert_number),
            });

            success = true;
          } catch (err) {
            // Simulated exponential backoff delay before retry
            const backoffMs = Math.min(10 * Math.pow(1.5, attempts), 50);
            await new Promise((res) => setTimeout(res, backoffMs));
          }
        }

        expect(success).toBe(true);
      })
    );

    // EXACT GUARANTEES:
    // 1. Exactly 60 unique certificates created
    expect(issuedCertificates.size).toBe(60);

    // 2. Exactly 60 unique certificate numbers
    const certNumbers = new Set(Array.from(issuedCertificates.values()).map((c) => c.cert_number));
    expect(certNumbers.size).toBe(60);

    // 3. Exactly 60 messages in mock WhatsApp inbox (zero duplicates despite failures & timeouts)
    expect(simulatedProvider.inbox).toHaveLength(60);

    const messageRecipients = new Set(simulatedProvider.inbox.map((m) => m.to));
    expect(messageRecipients.size).toBe(60);
  });

  it('Cancel then verify immediately returns cancelled, clearing Redis cache', async () => {
    // 1. Issue a certificate
    const candidateId = crypto.randomUUID();
    const courseName = 'Solar PV Designer';

    const { certificate } = await CertificateRepository.findOrCreateCertificate(
      candidateId,
      courseName
    );

    expect(certificate.status).toBe('generated');

    // 2. Initial Public Verify -> returns valid and caches in Redis
    const initialVerify = await CertificateService.verifyCertificate(
      certificate.cert_number,
      certificate.verify_code,
      mockRedis
    );

    expect(initialVerify.status).toBe('valid');
    expect(initialVerify.course_name).toBe(courseName);

    // Verify it is now cached in Redis
    const cacheKey = `cert:verify:${certificate.cert_number}:${certificate.verify_code.toUpperCase()}`;
    const cachedEntry = await mockRedis.get(cacheKey);
    expect(cachedEntry).not.toBeNull();
    expect(JSON.parse(cachedEntry!).status).toBe('valid');

    // 3. State Office Cancels Certificate
    const stateOfficeUser = {
      id: crypto.randomUUID(),
      role: 'state_office',
    };
    const cancelReason = 'Candidate disqualified due to duplicate identity document fraud';

    await CertificateService.cancelCertificate(
      certificate.id,
      cancelReason,
      stateOfficeUser,
      mockRedis
    );

    // Verify cache was invalidated
    const cacheAfterCancel = await mockRedis.get(cacheKey);
    expect(cacheAfterCancel).toBeNull();

    // 4. Verify immediately returns cancelled with cancel reason
    const postCancelVerify = await CertificateService.verifyCertificate(
      certificate.cert_number,
      certificate.verify_code,
      mockRedis
    );

    expect(postCancelVerify.status).toBe('cancelled');
    expect(postCancelVerify.cert_number).toBe(certificate.cert_number);
    expect(postCancelVerify.cancel_reason).toBe(cancelReason);
  });

  it('Unguessable expiring download token verifies and protects candidate downloads', () => {
    const certId = crypto.randomUUID();
    const certNumber = 100088;

    const token = CertificateService.generateDownloadToken(certId, certNumber);
    expect(typeof token).toBe('string');

    const decoded = CertificateService.verifyDownloadToken(token);
    expect(decoded.certId).toBe(certId);
    expect(decoded.certNumber).toBe(certNumber);

    // Invalid token throws
    expect(() => CertificateService.verifyDownloadToken('tampered.token.here')).toThrow();
  });
});
