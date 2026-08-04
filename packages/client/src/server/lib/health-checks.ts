import 'server-only';
import mongoose from 'mongoose';
import { connectDb } from '../db';

/**
 * Bounded dependency probes for readiness (spec 011 FR-AD-024/025).
 *
 * Every check is time-boxed and reports `degraded` rather than hanging — a slow
 * dependency must not make the readiness endpoint itself unresponsive, which would
 * turn an observability tool into an outage.
 *
 * Results are deliberately COARSE: name + status only, never connection strings,
 * versions, or error bodies, because this endpoint is unauthenticated like
 * `/api/health` and must stay safe to expose to a probe.
 */

export type DependencyStatus = 'ok' | 'degraded' | 'down' | 'not-configured';

export interface DependencyReport {
  name: string;
  status: DependencyStatus;
}

const PROBE_TIMEOUT_MS = 2_000;

async function bounded<T>(work: Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T | 'timeout'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkMongo(): Promise<DependencyReport> {
  try {
    // Readiness asks "can we serve?", not "have we already served?". On a cold process
    // nothing has called connectDb() yet, so without this the probe reported `down` on a
    // perfectly healthy app — found by hitting it on a freshly started dev server.
    if (mongoose.connection.readyState !== 1) {
      const connect = await bounded(connectDb());
      if (connect === 'timeout') return { name: 'mongodb', status: 'degraded' };
    }
    const db = mongoose.connection.db;
    if (!db) return { name: 'mongodb', status: 'down' };
    const res = await bounded(db.admin().ping());
    return { name: 'mongodb', status: res === 'timeout' ? 'degraded' : 'ok' };
  } catch {
    return { name: 'mongodb', status: 'down' };
  }
}

async function checkAgent(name: string, envVar: string): Promise<DependencyReport> {
  const base = process.env[envVar];
  if (!base) return { name, status: 'not-configured' };
  try {
    const res = await bounded(
      fetch(`${base}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }),
    );
    if (res === 'timeout') return { name, status: 'degraded' };
    return { name, status: res.ok ? 'ok' : 'down' };
  } catch {
    return { name, status: 'down' };
  }
}

function checkRecipeProviders(): DependencyReport {
  // FR-037: at least one of the two must be configured for usable recipe links.
  const configured = Boolean(
    process.env['BRAVE_SEARCH_API_KEY'] ?? process.env['SPOONACULAR_API_KEY'],
  );
  return { name: 'recipe-providers', status: configured ? 'ok' : 'not-configured' };
}

export interface ReadinessReport {
  ready: boolean;
  version: string;
  dependencies: DependencyReport[];
}

export async function readiness(): Promise<ReadinessReport> {
  const dependencies = [
    await checkMongo(),
    await checkAgent('meal-recommender', 'HOLODECK_URL'),
    await checkAgent('feedback-agent', 'FEEDBACK_AGENT_URL'),
    checkRecipeProviders(),
  ];
  // `not-configured` is a deployment choice, not a fault — only a real failure or a
  // hang makes the app not-ready.
  const ready = dependencies.every((d) => d.status === 'ok' || d.status === 'not-configured');
  return { ready, version: process.env['APP_VERSION'] ?? 'dev', dependencies };
}
