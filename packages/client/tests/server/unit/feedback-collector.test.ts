// @vitest-environment node
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sendToFeedbackAgent } from '@server/services/feedback-collector';
import type { IFeedbackMessage } from '@server/types/feedback';

// Mock global fetch so the REAL feedback-collector client logic runs (transcript framing,
// HTTP call, response parse + zod validation) without a live Holodeck sidecar.
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function holodeckOk(content: string): { ok: true; json: () => Promise<unknown> } {
  return {
    ok: true,
    json: async () => ({
      content,
      session_id: 'sess-1',
      tool_calls: [],
      tokens_used: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      execution_time_ms: 120,
    }),
  };
}

const collecting = JSON.stringify({
  status: 'collecting',
  reply: 'What did you expect to happen?',
  missing: ['expectedBehavior'],
});

const completeBug = JSON.stringify({
  status: 'complete',
  reply: 'Thanks — I have logged that grocery-count bug.',
  record: {
    type: 'bug',
    title: 'Grocery count wrong',
    problemStatement: 'Count mismatches items.',
    userStory: 'As a cook, I want the count to match, so that I trust the list.',
    acceptanceCriteria: [{ given: '5 items', when: 'open page', then: 'count is 5' }],
    reproSteps: ['Open page', 'Add 5 items'],
    expectedBehavior: 'Count is 5.',
    actualBehavior: 'Count is 0.',
    affectedArea: 'grocery',
    priority: 'P2',
  },
});

const transcript: IFeedbackMessage[] = [
  { role: 'user', content: 'the grocery list is broken', at: new Date() },
];

describe('sendToFeedbackAgent (Holodeck feedback-collector client)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, FEEDBACK_AGENT_URL: 'http://localhost:8002' };
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when FEEDBACK_AGENT_URL is not set', async () => {
    delete process.env['FEEDBACK_AGENT_URL'];
    await expect(sendToFeedbackAgent(transcript)).rejects.toThrow('FEEDBACK_AGENT_URL');
  });

  it('POSTs to the feedback-collector chat endpoint with a marker-framed transcript', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk(collecting));
    await sendToFeedbackAgent(transcript);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8002/agent/feedback-collector/chat',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as { body: string }).body) as { message: string };
    expect(body.message).toContain('[USER] the grocery list is broken');
    expect(body.message).not.toContain('FINALIZE NOW');
  });

  it('appends a FINALIZE NOW directive when finalize is requested (FR-F-008)', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk(completeBug));
    await sendToFeedbackAgent(transcript, { finalize: true });
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as { body: string }).body) as { message: string };
    expect(body.message).toContain('FINALIZE NOW');
  });

  it('parses a collecting reply', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk(collecting));
    const reply = await sendToFeedbackAgent(transcript);
    expect(reply.status).toBe('collecting');
    if (reply.status === 'collecting') expect(reply.reply).toMatch(/expect/i);
  });

  it('parses a complete reply with a validated record (FR-F-003)', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk(completeBug));
    const reply = await sendToFeedbackAgent(transcript);
    expect(reply.status).toBe('complete');
    if (reply.status === 'complete') {
      expect(reply.record.type).toBe('bug');
      expect(reply.record.reproSteps.length).toBeGreaterThan(0);
    }
  });

  it('tolerates a ```json markdown fence around the object (FR-F-010)', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk('```json\n' + collecting + '\n```'));
    const reply = await sendToFeedbackAgent(transcript);
    expect(reply.status).toBe('collecting');
  });

  it('salvages a JSON object embedded in stray prose', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk('Sure! ' + collecting + ' hope that helps'));
    const reply = await sendToFeedbackAgent(transcript);
    expect(reply.status).toBe('collecting');
  });

  it('throws on a non-ok holodeck response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'Bad Gateway' });
    await expect(sendToFeedbackAgent(transcript)).rejects.toThrow('502');
  });

  it('throws when the reply is not valid protocol JSON', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk('I could not understand that.'));
    await expect(sendToFeedbackAgent(transcript)).rejects.toThrow();
  });

  it('rejects a complete reply whose bug record is missing repro steps (FR-F-004)', async () => {
    const badBug = JSON.parse(completeBug) as { record: { reproSteps: string[] } };
    badBug.record.reproSteps = [];
    mockFetch.mockResolvedValueOnce(holodeckOk(JSON.stringify(badBug)));
    await expect(sendToFeedbackAgent(transcript)).rejects.toThrow();
  });
});
