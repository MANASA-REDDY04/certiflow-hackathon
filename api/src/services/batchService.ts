import { BatchRepository, BatchRecord } from '../repositories/batchRepository.js';
import { CandidateRepository, CandidateRecord } from '../repositories/candidateRepository.js';
import { CertificateRepository } from '../repositories/certificateRepository.js';
import { parseAndValidateCandidateFile, ParseResult } from './batchCandidateParser.js';
import { PolicyUser } from '../policies/accessControlPolicy.js';

export class BatchService {
  /**
   * List batches scoped to the user's role and assigned jurisdiction
   */
  static async listBatches(user: PolicyUser): Promise<BatchRecord[]> {
    return BatchRepository.findBatchesByScope({
      role: user.role,
      centre_id: user.centre_id,
      district_id: user.district_id,
    });
  }

  /**
   * Get single batch with its uploaded candidates
   */
  static async getBatchWithCandidates(
    batchId: string,
    user: PolicyUser
  ): Promise<{ batch: BatchRecord; candidates: any[] }> {
    const batch = await BatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    // Role check: training centres may only view their own batches
    if (user.role === 'training_centre' && batch.centre_id !== user.centre_id) {
      throw new Error('Forbidden: Access limited to your training centre');
    }

    const candidates = await CandidateRepository.findByBatchId(batchId);
    const candidateIds = candidates.map((c) => c.id).filter(Boolean);
    const certificates = await CertificateRepository.findByCandidateIds(candidateIds);
    const certByCandidateId = new Map(certificates.map((c) => [c.candidate_id, c]));

    const enrichedCandidates = candidates.map((c) => ({
      ...c,
      certificate: certByCandidateId.get(c.id) || null,
    }));

    return { batch, candidates: enrichedCandidates };
  }

  /**
   * Create a new draft batch
   */
  static async createBatch(user: PolicyUser, courseName: string): Promise<BatchRecord> {
    if (!user.centre_id) {
      throw new Error('User does not have an assigned training centre');
    }

    return BatchRepository.create({
      centre_id: user.centre_id,
      district_id: user.district_id || '11111111-1111-1111-1111-111111111111',
      course_name: courseName,
    });
  }

  /**
   * Validate and save candidates for a batch in a single atomic transaction.
   * If any validation error exists, returns errors and saves NOTHING.
   */
  static async uploadCandidates(
    batchId: string,
    fileBuffer: Buffer,
    user: PolicyUser
  ): Promise<ParseResult> {
    const batch = await BatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'draft') {
      throw new Error('Cannot upload candidates to a non-draft batch');
    }

    // Query candidates already certified for this course
    const existingCertified = await CandidateRepository.findCertifiedPhonesByCourse(
      batch.course_name
    );

    // Validate every row
    const parseResult = parseAndValidateCandidateFile(fileBuffer, {
      batchCourse: batch.course_name,
      existingCertifiedPhoneNumbers: existingCertified,
      maxRows: 2000,
      maxSizeBytes: 5 * 1024 * 1024,
    });

    // All-or-nothing: if any errors exist, save nothing and return errors
    if (!parseResult.success) {
      return parseResult;
    }

    // Save all candidates in a single transaction
    await CandidateRepository.saveBatchCandidatesInTransaction(
      batchId,
      parseResult.candidates,
      { id: user.id, role: user.role }
    );

    // Update batch counter
    BatchRepository.updateCandidateCount(batchId, parseResult.candidates.length);

    return parseResult;
  }

  /**
   * Submit batch to District Review
   */
  static async submitBatch(batchId: string, user: PolicyUser): Promise<BatchRecord> {
    const batch = await BatchRepository.findById(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'draft') {
      throw new Error('Only draft batches can be submitted');
    }

    const candidates = await CandidateRepository.findByBatchId(batchId);
    if (candidates.length === 0 && (batch.candidate_count || 0) === 0) {
      throw new Error('Cannot submit a batch without candidates. Please upload candidates first.');
    }

    return BatchRepository.submit(batchId, { id: user.id, role: user.role });
  }
}
