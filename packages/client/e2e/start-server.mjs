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
    });
  });
  return server;
}

const mongo = await MongoMemoryServer.create();
const uri = mongo.getUri('fridge-planner-e2e');

const mockFeedbackAgent = startMockFeedbackAgent();
await new Promise((resolve) => mockFeedbackAgent.listen(0, '127.0.0.1', resolve));
const mockFeedbackAgentPort = mockFeedbackAgent.address().port;

const child = spawn('npx', ['next', 'start', '-p', PORT], {
  stdio: 'inherit',
  env: {
    ...process.env,
    // Serve the e2e-isolated build (see next.config.ts distDir) — never the dev .next.
    NEXT_DIST_DIR: '.next-e2e',
    MONGODB_URI: uri,
    AUTH_MODE: 'dev',
    AUTH_ALLOW_DEV: 'true',
    FEEDBACK_AGENT_URL: `http://127.0.0.1:${mockFeedbackAgentPort}`,
  },
});

async function shutdown(signal) {
  child.kill(signal);
  await new Promise((resolve) => mockFeedbackAgent.close(resolve));
  await mongo.stop();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
child.on('exit', (code) => {
  mockFeedbackAgent.close();
  void mongo.stop().finally(() => process.exit(code ?? 0));
});
