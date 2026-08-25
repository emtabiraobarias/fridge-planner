import 'server-only';

/**
 * The repository's published releases, for the closure picker (spec 012 D17, FR-FL-043).
 *
 * **The app's first outbound dependency on a third party.** Everything about this module is
 * shaped by one rule: `FR-FL-045` forbids blocking closure on it. So it never throws, never
 * retries, and reports unavailability as a normal answer rather than an error. A maintainer must
 * always be able to close an item, GitHub reachable or not.
 *
 * Read-only and unauthenticated — the repo is public-readable, so no credential is needed or
 * wanted. If it is ever made private this becomes a token-holding integration and the spec
 * assumption must be revisited.
 */

export interface Release {
  tag: string;
  name: string;
  url: string;
  publishedAt: string;
  /**
   * Where this entry came from. `tag` means the repository publishes releases as git tags
   * rather than GitHub Release objects — see `fetchTags` below.
   */
  source: 'release' | 'tag';
}

export interface ReleaseList {
  releases: Release[];
  available: boolean;
  /** Stated to the maintainer, and recorded on the closure, when the list could not be read. */
  unavailableReason?: string;
}

/** One hour. Releases change rarely, and the unauthenticated rate limit is 60 req/hr/IP. */
const TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

// Module-level, same pattern as `services/recommendations-cache.ts`. A process-local
// optimisation with a TTL, never a source of truth — Twelve-Factor VI holds.
let cache: { at: number; value: ReleaseList } | null = null;

/** Test seam: drop the cache so a suite is not shaped by a previous test's fetch. */
export function resetReleaseCache(): void {
  cache = null;
}

interface GitHubTag {
  name?: string;
  commit?: { sha?: string };
}

interface GitHubRelease {
  tag_name?: string;
  name?: string | null;
  html_url?: string;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
}

function unavailable(reason: string): ReleaseList {
  return { releases: [], available: false, unavailableReason: reason };
}

export async function fetchReleases(): Promise<ReleaseList> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const repo = process.env['GITHUB_REPO'];
  if (!repo) {
    // Not an error: an unset repo simply means the picker is unavailable and closure falls
    // back to free text. Deliberately NOT cached — setting the variable should take effect.
    return unavailable('No repository is configured for the release list.');
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return unavailable(`The release list could not be read (HTTP ${res.status}).`);
    }

    const raw = (await res.json()) as GitHubRelease[];
    const releases: Release[] = raw
      // A draft is not published, and a maintainer closing an item is telling a reporter
      // where to find the fix — pointing at something unreleased would be a lie.
      .filter((r) => !r.draft && r.tag_name && r.html_url)
      .map((r) => ({
        tag: r.tag_name!,
        name: r.name?.trim() || r.tag_name!,
        url: r.html_url!,
        publishedAt: r.published_at ?? '',
        source: 'release' as const,
      }));

    // No GitHub Release objects does NOT mean no releases. This project ships by tagging
    // `nextjs-v*` and bumping the compose pin — CLAUDE.md §14, "the pin bump IS the deploy" —
    // and never creates Release objects, so the picker would be permanently empty while the
    // repo has shipped 15 versions. Tags ARE this repository's published releases, so falling
    // back to them satisfies FR-FL-043 rather than working around it.
    const value: ReleaseList = releases.length
      ? { releases, available: true }
      : await fetchTags(repo);

    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    // Timeout, DNS, offline — all the same answer. Never rethrown: closure must not be gated
    // on a third party, so the caller gets a usable result rather than an exception to handle.
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'unreachable';
    return unavailable(`The release list is ${reason}. You can enter the release manually.`);
  }
}

/**
 * Git tags, used when the repository publishes no GitHub Release objects.
 *
 * The tags endpoint carries no publish date and no release page, so `publishedAt` is left empty
 * and the URL points at the tag's own page — which exists whether or not a Release does. Never
 * throws, for the same reason as its caller: closure must not be gated on a third party.
 */
async function fetchTags(repo: string): Promise<ReleaseList> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/tags?per_page=30`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return unavailable(`The release list could not be read (HTTP ${res.status}).`);
    }

    const raw = (await res.json()) as GitHubTag[];
    const releases: Release[] = raw
      .filter((t): t is GitHubTag & { name: string } => Boolean(t.name))
      .map((t) => ({
        tag: t.name,
        name: t.name,
        url: `https://github.com/${repo}/releases/tag/${encodeURIComponent(t.name)}`,
        publishedAt: '',
        source: 'tag' as const,
      }));

    return releases.length
      ? { releases, available: true }
      : unavailable('This repository has published no releases or tags yet.');
  } catch {
    return unavailable('The release list is unreachable. You can enter the release manually.');
  }
}

/** Coarse status for the readiness probe (FR-FL-047). */
export async function releaseListStatus(): Promise<'ok' | 'degraded' | 'not-configured'> {
  if (!process.env['GITHUB_REPO']) return 'not-configured';
  const list = await fetchReleases();
  // NEVER `down`: an unreachable release list does not make the app unready, because nothing
  // user-facing blocks on it.
  return list.available ? 'ok' : 'degraded';
}
