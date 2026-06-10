import type { QueuedJob } from '@toopo/db';
import { describe, expect, it } from 'vitest';
import { toClaimedJob, toNewJobInput } from './claimed-job.js';
import type { JobReference } from './job-reference.js';

const T0 = new Date('2026-06-10T00:00:00.000Z');

const REFERENCE: JobReference = {
  projectId: 'proj-1',
  repo: { host: 'github.com', owner: 'toopo', name: 'toopo' },
  commitSha: 'a'.repeat(40),
};

const QUEUED: QueuedJob = {
  id: 'job-1',
  dedupeKey: 'proj-1:sha',
  projectId: 'proj-1',
  repoHost: 'github.com',
  repoOwner: 'toopo',
  repoName: 'toopo',
  commitSha: 'a'.repeat(40),
  status: 'processing',
  attempts: 2,
  availableAt: T0,
  leaseUntil: T0,
  lastError: null,
  createdAt: T0,
  updatedAt: T0,
};

describe('toClaimedJob', () => {
  it('projects a flat stored job into the nested domain shape', () => {
    expect(toClaimedJob(QUEUED)).toEqual({
      id: 'job-1',
      reference: REFERENCE,
      attempts: 2,
      dedupeKey: 'proj-1:sha',
    });
  });
});

describe('toNewJobInput', () => {
  it('flattens a domain reference into the storage input', () => {
    expect(toNewJobInput(REFERENCE, { dedupeKey: 'k', availableAt: T0 })).toEqual({
      dedupeKey: 'k',
      projectId: 'proj-1',
      repoHost: 'github.com',
      repoOwner: 'toopo',
      repoName: 'toopo',
      commitSha: 'a'.repeat(40),
      availableAt: T0,
    });
  });

  it('passes a null dedupeKey through', () => {
    expect(toNewJobInput(REFERENCE, { dedupeKey: null, availableAt: T0 }).dedupeKey).toBeNull();
  });
});
