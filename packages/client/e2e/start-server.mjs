// Boots an in-memory MongoDB, a deterministic mock feedback agent, then `next start`
// wired to both, for Playwright E2E. Dev auth seam (AUTH_MODE=dev + AUTH_ALLOW_DEV) →
// the browser authenticates as the "anonymous" user without an OIDC IdP. No Holodeck
// meal-recommender: recommendations fall back to popular recipes (by design). The
// feedback-collector agent IS mocked (see startMockFeedbackAgent below) so
// dev-loop.e2e.ts can seed real, schema-valid `complete` FeedbackRecords deterministically
// through the real POST /api/v1/feedback route — no LLM call, no flakiness.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PORT = process.env.E2E_PORT ?? '3100';

// Any transcript containing this marker gets a 'collecting' reply instead of 'complete' —
// lets tests deterministically seed a draft (incomplete) record when needed.
const DRAFT_HOLD_MARKER = 'DRAFT_HOLD_TRIGGER';

// The 012 clause-drafting turn (services/feedback-collector.ts frames it with this line).
// Without a stand-in reply the vetting tests could only assert "the agent drafted nothing",
// which is the degraded path — the one case that needs no UI at all.
const CLAUSE_MODE_MARKER = 'MODE: draft-ears-clauses';

function buildClauses() {
  return [
    {
      text: 'When a grocery row is checked off, the system shall not duplicate it.',
      derivedFrom: 'the reported problem statement',
      inferred: false,
    },
    {
      // Something the record did not state, so the maintainer can see the flag working.
      text: 'While a refresh is in flight, the system shall keep the list stable.',
      derivedFrom: 'the reported problem statement',
      inferred: true,
    },
  ];
}

function buildCompleteRecord(title) {
  const safeTitle = title.slice(0, 120);
  return {
    type: 'bug',
    title: safeTitle,
    problemStatement: safeTitle,
    userStory: `As a user, I want "${safeTitle}" fixed so the app behaves as expected.`,
    acceptanceCriteria: [
      { given: 'the described starting state', when: 'the reported action happens', then: 'the expected result occurs' },
    ],
    reproSteps: ['Open the app', 'Reproduce the described issue'],
    expectedBehavior: 'The app behaves as expected.',
    actualBehavior: 'The app does not behave as expected.',
    affectedArea: 'other',
    priority: 'P2',
  };
}

/**
 * A minimal stand-in for the Holodeck feedback-collector agent (see
 * src/server/services/feedback-collector.ts: POST {agentUrl}/agent/feedback-collector/chat).
 * Always finalizes on the first turn (status:'complete') unless the framed transcript
 * contains DRAFT_HOLD_MARKER, in which case it stays 'collecting' — deterministic, no LLM.
 */
function respond(res, content) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      content,
      session_id: 'e2e-mock-session',
      tool_calls: [],
      tokens_used: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      execution_time_ms: 1,
    }),
  );
}

function startMockFeedbackAgent() {
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || !(req.url ?? '').includes('/agent/feedback-collector/chat')) {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end('{}');
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let message = '';
      try {
        message = JSON.parse(raw).message ?? '';
      } catch {
        message = '';
      }

      const userLines = [...message.matchAll(/\[USER\] (.+)/g)].map((m) => m[1]);
      const latestUser = userLines[userLines.length - 1] ?? 'Untitled E2E feedback';

      if (message.includes(CLAUSE_MODE_MARKER)) {
        respond(res, JSON.stringify({ status: 'clauses', clauses: buildClauses() }));
        return;
      }

      const content = message.includes(DRAFT_HOLD_MARKER)
        ? JSON.stringify({
            status: 'collecting',
            reply: 'Can you tell me a bit more about what happened?',
            missing: ['reproSteps'],
          })
        : JSON.stringify({
            status: 'complete',
            reply: 'Thanks — I filed that as a report.',
            record: buildCompleteRecord(latestUser),
          });

      respond(res, content);
    });
  });
  return server;
}

/**
 * A minimal stand-in for the identity provider's ADMIN API (spec 013,
 * src/server/services/identity-provider.ts).
 *
 * Registration is the first journey in this app that writes THROUGH the app to a third
 * party, so without this the only e2e possible would assert the degraded path — that
 * registration fails when no provider is configured, which needs no UI at all and is exactly
 * the shape of coverage `011` shipped three unbuilt panels behind.
 *
 * Deliberately stateful about one thing only: which addresses it has seen. That is what makes
 * the duplicate-registration refusal (FR-AC-016) testable end to end.
 *
 * A password containing WEAK_PASSWORD_MARKER is refused with a stated reason, so the
 * FR-AC-017 path can be driven through the real form rather than a mocked fetch.
 */
const WEAK_PASSWORD_MARKER = 'weak';

function startMockIdp() {
  const known = new Set();
  let nextId = 0;

  const server = createServer((req, res) => {
    const url = req.url ?? '';
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (url.includes('/protocol/openid-connect/token')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'e2e-admin-token', expires_in: 60 }));
        return;
      }

      if (req.method === 'POST' && url.endsWith('/users')) {
        let body = {};
        try {
          body = JSON.parse(raw);
        } catch {
          body = {};
        }
        const password = body.credentials?.[0]?.value ?? '';
        if (password.includes(WEAK_PASSWORD_MARKER)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ errorMessage: 'Invalid password: minimum length 12.' }));
          return;
        }
        const email = String(body.email ?? '').toLowerCase();
        if (known.has(email)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ errorMessage: 'User exists with same email' }));
          return;
        }
        known.add(email);
        nextId += 1;
        res.writeHead(201, { Location: `/admin/realms/e2e/users/e2e-sub-${nextId}` });
        res.end();
        return;
      }

      // execute-actions-email (verification, password reset) and user updates.
      res.writeHead(204).end();
    });
  });
  return server;
}

const mongo = await MongoMemoryServer.create();
const uri = mongo.getUri('fridge-planner-e2e');

const mockFeedbackAgent = startMockFeedbackAgent();
await new Promise((resolve) => mockFeedbackAgent.listen(0, '127.0.0.1', resolve));
const mockFeedbackAgentPort = mockFeedbackAgent.address().port;

const mockIdp = startMockIdp();
await new Promise((resolve) => mockIdp.listen(0, '127.0.0.1', resolve));
const mockIdpBase = `http://127.0.0.1:${mockIdp.address().port}`;

const child = spawn('npx', ['next', 'start', '-p', PORT], {
  stdio: 'inherit',
  env: {
    ...process.env,
    // Serve the e2e-isolated build (see next.config.ts distDir) — never the dev .next.
    NEXT_DIST_DIR: '.next-e2e',
    MONGODB_URI: uri,
    AUTH_MODE: 'dev',
    AUTH_ALLOW_DEV: 'true',
    // Pinned to CI's values so a developer's `packages/client/.env.local` cannot leak a
    // dev-seam identity into the e2e build. `next start` reads `.env.local` (CLAUDE.md §2) but
    // does not override variables already present in the environment, so setting them here wins.
    //
    // This is not hypothetical: `AUTH_DEV_ROLES=admin` in a local `.env.local` made every
    // `page.goto('/admin')` an administrator, so lifecycle.e2e.ts passed locally for a reason
    // CI does not have. A test must state its own identity — see the `test.use` there.
    // `'anonymous'` is what `auth.ts` falls back to when this is unset, which is what CI gets.
    // NOT `''` — the fallback is `??`, which does not fire on an empty string, so an empty
    // value gives every unidentified request a broken `''` identity instead.
    AUTH_DEV_USER_ID: 'anonymous',
    // `''` IS right here: the roles list is `.filter(Boolean)`-ed, so empty means no roles,
    // exactly as unset does.
    AUTH_DEV_ROLES: '',
    FEEDBACK_AGENT_URL: `http://127.0.0.1:${mockFeedbackAgentPort}`,
    // Spec 013. AUTH_MODE stays `dev`, so this does NOT switch the app to OIDC verification —
    // these are read by the registration route (which needs an issuer to record the identity
    // pair against) and by the provider adapter (which derives the admin endpoint from the
    // JWKS URI rather than a variable that could disagree with it).
    AUTH_ISSUER: `${mockIdpBase}/realms/e2e`,
    AUTH_JWKS_URI: `${mockIdpBase}/realms/e2e/protocol/openid-connect/certs`,
    IDP_ADMIN_CLIENT_ID: 'e2e-admin',
    IDP_ADMIN_CLIENT_SECRET: 'e2e-secret',
  },
});

async function shutdown(signal) {
  child.kill(signal);
  await new Promise((resolve) => mockFeedbackAgent.close(resolve));
  await new Promise((resolve) => mockIdp.close(resolve));
  await mongo.stop();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
child.on('exit', (code) => {
  mockFeedbackAgent.close();
  mockIdp.close();
  void mongo.stop().finally(() => process.exit(code ?? 0));
});
