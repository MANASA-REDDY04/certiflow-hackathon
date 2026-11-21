import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { ApprovalStateMachine } from '../src/services/approvalStateMachine.js';
import { BatchRepository } from '../src/repositories/batchRepository.js';
import { ApprovalRepository } from '../src/repositories/approvalRepository.js';
import { PolicyUser } from '../src/policies/accessControlPolicy.js';

describe('Approval Workflow State Machine & Concurrency Guarantees', () => {
  const centralDistrictId = '11111111-1111-1111-1111-111111111111';
  const otherDistrictId = '99999999-9999-9999-9999-999999999999';

  // Seeded Personas
  const devOfficer: PolicyUser = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    name: 'Dev',
    email: 'dev@certiflow.local',
    role: 'district_officer',
    district_id: centralDistrictId,
    centre_id: null,
  };

  const meeraOfficer: PolicyUser = {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    name: 'Meera',
    email: 'meera@certiflow.local',
    role: 'district_officer',
    district_id: centralDistrictId,
    centre_id: null,
  };

  const outsiderOfficer: PolicyUser = {
    id: '77777777-7777-7777-7777-777777777777',
    name: 'Rohan',
    email: 'rohan@otherdistrict.gov',
    role: 'district_officer',
    district_id: otherDistrictId,
    centre_id: null,
  };

  const nehaQuality: PolicyUser = {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    name: 'Neha',
    email: 'neha@certiflow.local',
    role: 'quality_team',
    district_id: null,
    centre_id: null,
  };

  const farahState: PolicyUser = {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    name: 'Farah',
    email: 'farah@certiflow.local',
    role: 'state_office',
    district_id: null,
    centre_id: null,
  };

  const anikaCentre: PolicyUser = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Anika',
    email: 'anika@certiflow.local',
    role: 'training_centre',
    district_id: centralDistrictId,
    centre_id: '22222222-2222-2222-2222-222222222222',
  };

  it('District Review requires 2 DIFFERENT officers of the batch district and advances properly', async () => {
    // 1. Create a batch with 60 candidates (>= 50 threshold for Quality Review)
    const batch = await BatchRepository.create({
      centre_id: '22222222-2222-2222-2222-222222222222',
      district_id: centralDistrictId,
      course_name: 'Solar Panel Technician',
    });
    batch.candidate_count = 60;
    batch.status = 'district_review';

    // Officer 1 (Dev) approves
    const devDecision = await ApprovalStateMachine.executeDecision({
      batchId: batch.id,
      officer: devOfficer,
      decision: 'approve',
      comments: 'Documents verified and authentic',
    });

    expect(devDecision.approval.status).toBe('approved');
    expect(devDecision.quorumReached).toBe(false);
    expect(devDecision.batch.status).toBe('district_review'); // Stays in review (count = 1, needs 2)

    // Officer 1 (Dev) attempts to approve a second time in same round -> 409 Conflict
    await expect(
      ApprovalStateMachine.executeDecision({
        batchId: batch.id,
        officer: devOfficer,
        decision: 'approve',
        comments: 'Duplicate attempt',
      })
    ).rejects.toThrow(/already submitted a decision/);

    // Officer 2 (Meera, DIFFERENT officer in the SAME district) approves
    const meeraDecision = await ApprovalStateMachine.executeDecision({
      batchId: batch.id,
      officer: meeraOfficer,
      decision: 'approve',
      comments: 'Centre audit confirmed',
    });

    expect(meeraDecision.approval.status).toBe('approved');
    expect(meeraDecision.quorumReached).toBe(true);
    expect(meeraDecision.advanced).toBe(true);
    // Since candidate_count = 60 (>= 50), advances to quality_review
    expect(meeraDecision.nextState).toBe('quality_review');
    expect(meeraDecision.batch.status).toBe('quality_review');
  });

  it('Concurrent approvals via Promise.all: exactly one succeeds, duplicate gets 409 Conflict', async () => {
    const batch = await BatchRepository.create({
      centre_id: '22222222-2222-2222-2222-222222222222',
      district_id: centralDistrictId,
      course_name: 'Electric Vehicle Technician',
    });
    batch.status = 'district_review';

    // Two simultaneous approval requests from the same officer
    const results = await Promise.allSettled([
      ApprovalStateMachine.executeDecision({
        batchId: batch.id,
        officer: devOfficer,
        decision: 'approve',
        comments: 'Concurrent attempt 1',
      }),
      ApprovalStateMachine.executeDecision({
        batchId: batch.id,
        officer: devOfficer,
        decision: 'approve',
        comments: 'Concurrent attempt 2',
      }),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    // Exactly one succeeds, one gets 409 Conflict
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const failureReason = (failures[0] as PromiseRejectedResult).reason;
    expect(failureReason.statusCode).toBe(409);
  });

  it('Rejects approvals from wrong role and wrong district', async () => {
    const batch = await BatchRepository.create({
      centre_id: '22222222-2222-2222-2222-222222222222',
      district_id: centralDistrictId,
      course_name: 'Data Analytics',
    });
    batch.status = 'district_review';

    // 1. District officer from wrong district
    await expect(
      ApprovalStateMachine.executeDecision({
        batchId: batch.id,
        officer: outsiderOfficer,
        decision: 'approve',
      })
    ).rejects.toThrow(/different district/);

    // 2. Training centre user attempting to approve
    await expect(
      ApprovalStateMachine.executeDecision({
        batchId: batch.id,
        officer: anikaCentre,
        decision: 'approve',
      })
    ).rejects.toThrow(/Only District Officers/);

    // 3. Quality officer attempting to approve in district_review step
    await expect(
      ApprovalStateMachine.executeDecision({
        batchId: batch.id,
        officer: nehaQuality,
        decision: 'approve',
      })
    ).rejects.toThrow(/Only District Officers/);
  });

  it('Send-back returns batch with mandatory reason and invalidates previous approvals on resubmit', async () => {
    const batch = await BatchRepository.create({
      centre_id: '22222222-2222-2222-2222-222222222222',
      district_id: centralDistrictId,
      course_name: 'Organic Farming Specialization',
    });
    batch.status = 'district_review';
    batch.round = 1;

    // Dev approves in round 1
    await ApprovalStateMachine.executeDecision({
      batchId: batch.id,
      officer: devOfficer,
      decision: 'approve',
      comments: 'Round 1 partial approval',
    });

    // Meera decides to Send Back with mandatory reason
    const sendBackReason = 'Candidate attendance sheets are missing page 2 signatures';
    const sendBackResult = await ApprovalStateMachine.executeDecision({
      batchId: batch.id,
      officer: meeraOfficer,
      decision: 'send_back',
      reason: sendBackReason,
    });

    expect(sendBackResult.batch.status).toBe('sent_back');

    // Reject send-back without mandatory reason
    await expect(
      ApprovalStateMachine.executeDecision({
        batchId: batch.id,
        officer: meeraOfficer,
        decision: 'send_back',
        reason: 'no', // too short
      })
    ).rejects.toThrow(/mandatory reason/);

    // Training centre resubmits the batch
    const resubmitted = await ApprovalStateMachine.resubmitBatch(batch.id, anikaCentre);

    // Resubmission guarantees:
    // 1. Round is incremented from 1 to 2
    expect(resubmitted.round).toBe(2);
    // 2. Status resets to district_review
    expect(resubmitted.status).toBe('district_review');

    // 3. In round 2, previous round 1 approvals are invalidated:
    // Dev CAN vote again in round 2!
    const devRound2Decision = await ApprovalStateMachine.executeDecision({
      batchId: batch.id,
      officer: devOfficer,
      decision: 'approve',
      comments: 'Round 2 re-evaluated and verified',
    });

    expect(devRound2Decision.approval.round).toBe(2);
    expect(devRound2Decision.approval.status).toBe('approved');

    // 4. Historical timeline preserves all decisions across rounds
    const timeline = await ApprovalRepository.findTimelineByBatchId(batch.id);
    expect(timeline.length).toBeGreaterThanOrEqual(3);
    expect(timeline.some((t) => t.round === 1 && t.status === 'changes_requested')).toBe(true);
    expect(timeline.some((t) => t.round === 2 && t.status === 'approved')).toBe(true);
  });

  it('Reject is terminal and blocks any subsequent reviews', async () => {
    const batch = await BatchRepository.create({
      centre_id: '22222222-2222-2222-2222-222222222222',
      district_id: centralDistrictId,
      course_name: 'Robotics Workshop',
    });
    batch.status = 'district_review';

    // Reject with reason
    const rejectResult = await ApprovalStateMachine.executeDecision({
      batchId: batch.id,
      officer: devOfficer,
      decision: 'reject',
      reason: 'Batch failed all fundamental compliance checks with fraudulent assessment scores',
    });

    expect(rejectResult.batch.status).toBe('rejected');

    // Subsequent approval attempt is blocked with 409
    await expect(
      ApprovalStateMachine.executeDecision({
        batchId: batch.id,
        officer: meeraOfficer,
        decision: 'approve',
      })
    ).rejects.toThrow(/does not accept reviews/);
  });
});
