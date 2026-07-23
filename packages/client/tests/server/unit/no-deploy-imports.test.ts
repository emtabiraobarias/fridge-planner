// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// FR-F-017 / SC-F-008 architecture invariant: the pipeline layer must be STRUCTURALLY
// incapable of a merge / tag / deploy side effect. We assert the source text of the
// controller and the pure state machine reference no process-spawning, git, or deploy
// module — so `approve-release` can only ever flip a DB field, never ship anything.
//
// This reads the files from disk (not via import) so it also catches a string reference
// that a bundler might otherwise tree-shake, and so it keeps holding as the files grow.

const here = path.dirname(fileURLToPath(import.meta.url));
// tests/server/unit → packages/client
const clientRoot = path.resolve(here, '../../..');

const GUARDED_FILES = [
  'src/server/controllers/pipeline.ts',
  'src/server/lib/pipeline-transitions.ts',
];

// Tokens that would indicate an ability to run a subprocess, drive git, or deploy.
// We target modules and call names — the CAPABILITY — not the bare word "git", which
// would false-positive on an explanatory comment ("performs no git/merge/deploy…") and
// so would be an unstable guard. Every git-capable path still fails this test: a git
// library (simple-git / nodegit / isomorphic-git) by name, or shelling out to the `git`
// binary via child_process / execa / exec*/spawn* (all listed below).
const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: 'child_process', pattern: /child_process/ },
  { label: 'simple-git', pattern: /simple-git/ },
  { label: 'nodegit', pattern: /nodegit/ },
  { label: 'isomorphic-git', pattern: /isomorphic-git/ },
  { label: 'execa', pattern: /execa/ },
  { label: '@octokit', pattern: /@octokit/ },
  { label: 'exec', pattern: /\bexec(?:Sync|File)?\b/ },
  { label: 'spawn', pattern: /\bspawn(?:Sync)?\b/ },
  { label: 'shell/deploy', pattern: /\b(?:shelljs|dockerode|kubernetes-client)\b/ },
];

describe('FR-F-017 — pipeline layer is structurally incapable of merge/tag/deploy (T018)', () => {
  for (const rel of GUARDED_FILES) {
    it(`${rel} references no process/git/deploy-capable module`, () => {
      const source = readFileSync(path.join(clientRoot, rel), 'utf8');
      const hits = FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(({ label }) => label);
      expect(hits, `forbidden token(s) found in ${rel}: ${hits.join(', ')}`).toEqual([]);
    });
  }
});
