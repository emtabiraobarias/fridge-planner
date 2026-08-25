// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;
let LifecycleItem: typeof import('@server/models/lifecycle-item').LifecycleItem;
let PipelineItem: typeof import('@server/models/pipeline-item').PipelineItem;

const REPORTER = 'reporter-1';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // db.ts reads MONGODB_URI at MODULE SCOPE, so the import must come after this line —
  // otherwise the suite silently binds to a real localhost:27017 (CLAUDE.md §8).
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ LifecycleItem } = await import('@server/models/lifecycle-item'));
  ({ PipelineItem } = await import('@server/models/pipeline-item'));
  // Mongoose builds indexes asynchronously. Without this the unique-index assertion races the
  // build and passes or fails depending on suite timing — green in isolation, red in a full run.
  await LifecycleItem.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await LifecycleItem.deleteMany({});
});

function base(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: REPORTER,
    feedbackRecordId: 'rec-1',
    sourceTitle: 'Grocery rows duplicate',
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    stage: 'new',
    ...over,
  };
}

describe('LifecycleItem model', () => {
  it('uses the same collection the pipeline items already live in (research R1)', () => {
    // Asserted against the SHIPPED model, never a literal. An earlier version of this test
    // hard-coded 'pipeline_items' and passed while the two models sat on DIFFERENT collections —
    // the old model sets no explicit name, so Mongoose pluralises it to `pipelineitems`.
    // Comparing the two is the property that actually matters and cannot be self-satisfied.
    expect(LifecycleItem.collection.name).toBe(PipelineItem.collection.name);
    expect(LifecycleItem.collection.name).toBe('pipelineitems');
  });

  it('accepts every one of the eleven stages (FR-FL-001)', async () => {
    const stages = [
      'new',
      'accepted',
      'briefed',
      'in-spec',
      'in-progress',
      'in-review',
      'shipped',
      'closed',
      'dismissed',
      'merged',
      'parked',
    ];
    for (const [i, stage] of stages.entries()) {
      const doc = await LifecycleItem.create(base({ stage, feedbackRecordId: `rec-${i}` }));
      expect(doc.stage).toBe(stage);
    }
  });

  it('rejects a stage outside the eleven (FR-FL-001)', async () => {
    await expect(LifecycleItem.create(base({ stage: 'approved' }))).rejects.toThrow();
  });

  it('enforces one item per record in the DATABASE, so acceptance is idempotent', async () => {
    await LifecycleItem.create(base());
    // Not a controller check: two concurrent accepts must not both create an item.
    await expect(LifecycleItem.create(base())).rejects.toThrow();
  });

  it('stores a dismissal reason from the two-value enum (FR-FL-016/017)', async () => {
    const a = await LifecycleItem.create(
      base({ stage: 'dismissed', dismissalReason: 'no-action-required' }),
    );
    const b = await LifecycleItem.create(
      base({ stage: 'dismissed', dismissalReason: 'declined', feedbackRecordId: 'rec-2' }),
    );
    // The two must stay distinguishable — they mean different things to the reporter.
    expect(a.dismissalReason).not.toBe(b.dismissalReason);
    await expect(
      LifecycleItem.create(base({ dismissalReason: 'because', feedbackRecordId: 'rec-3' })),
    ).rejects.toThrow();
  });

  it('carries clauses with a required derivedFrom (FR-FL-025)', async () => {
    const doc = await LifecycleItem.create(
      base({
        clauses: [
          {
            provisionalId: 'C-01',
            text: 'When a row duplicates, the system shall …',
            derivedFrom: 'grocery rows duplicate after checkout',
            inferred: false,
            vetted: 'pending',
          },
        ],
      }),
    );
    expect(doc.clauses[0]?.derivedFrom).toBeTruthy();
    // Vetting is a COMPARISON against the record's own words. A clause with nothing to compare
    // against silently degrades into a proofread, which is the failure the spec calls
    // load-bearing — well-formed EARS is easy to accept uncritically.
    await expect(
      LifecycleItem.create(
        base({
          feedbackRecordId: 'rec-4',
          clauses: [{ provisionalId: 'C-01', text: 'x', inferred: false, vetted: 'pending' }],
        }),
      ),
    ).rejects.toThrow();
  });

  it('records a rank rather than a fixed priority label (FR-FL-022)', async () => {
    // The design calls for a ranked queue, not a flat list — and never names a P1/P2/P3 scale.
    const doc = await LifecycleItem.create(base({ rank: 3 }));
    expect(doc.rank).toBe(3);
  });

  it('holds the closure record with either a release tag or fallback text (FR-FL-044)', async () => {
    const doc = await LifecycleItem.create(
      base({
        stage: 'closed',
        closure: {
          excerpt: 'Duplicate rows no longer appear.',
          releaseFallbackText: 'shipped in the 25 Aug release',
          unavailableReason: 'release list unreachable',
          closedBy: 'admin-1',
          closedAt: new Date(),
        },
      }),
    );
    expect(doc.closure?.releaseFallbackText).toBeTruthy();
  });

  it('marks an erased reporter without deleting the item (FR-FL-059/060)', async () => {
    const doc = await LifecycleItem.create(base({ reporterErasedAt: new Date() }));
    expect(doc.reporterErasedAt).toBeInstanceOf(Date);
  });

  it('indexes the cross-user triage queue, which is not user-scoped (FR-FL-023)', async () => {
    const idx = await LifecycleItem.collection.indexes();
    const keys = idx.map((i) => JSON.stringify(i.key));
    expect(keys).toContain(JSON.stringify({ stage: 1, updatedAt: -1 }));
  });
});
