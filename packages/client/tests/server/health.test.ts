// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { GET } from '../../app/api/health/route';

/**
 * `/api/health` is the rollout probe (scripts/verify-rollout.sh). The version it reports
 * is the only way to ask a running deployment which release it is serving — a bare
 * `{status:'ok'}` was returned by a stale container for a full day during the spec-010
 * release without anyone being able to tell.
 */
describe('GET /api/health', () => {
  const original = process.env.APP_VERSION;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = original;
  });

  it('stays a 200 with status ok (compose healthcheck + validate-e2e depend on this)', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });

  it('reports the version baked in at image build time', async () => {
    process.env.APP_VERSION = '4.10.0';
    expect(await GET().json()).toEqual({ status: 'ok', version: '4.10.0' });
  });

  it("falls back to 'dev' when unset, so a local run is never mistaken for a release", async () => {
    delete process.env.APP_VERSION;
    expect(await GET().json()).toEqual({ status: 'ok', version: 'dev' });
  });
});
