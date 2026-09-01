// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `AGENTS.md` is a verbatim copy of `CLAUDE.md` — different assistants read different filenames,
 * and both must get the same rules.
 *
 * This guard exists because the copy DRIFTED badly: by 2026-09-01 AGENTS.md was ~10KB behind,
 * its §9 still described a single "AI Agent (Holodeck / Meal Recommender)" when there have been
 * two agents since spec 003, and its section numbering had diverged from §13 onward. An
 * assistant reading it would have been working from a materially wrong picture of the system —
 * silently, because nothing compared them.
 */
const ROOT = join(__dirname, '../../../../..');

describe('the two AI guide files cannot drift', () => {
  it('AGENTS.md is byte-identical to CLAUDE.md', () => {
    const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
    const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
    expect(agents, 'AGENTS.md is stale — copy CLAUDE.md over it').toBe(claude);
  });
});
