import type { MealRecommendation } from '../types/meal-recommendation';

// Option A (groundedness): the LLM never authors a recipeUrl/imageUrl — this module is
// the ONLY source of those fields, and only ever attaches one when a real, existing
// recipe page has been found. Primary: search restricted to the four approved recipe
// blogs via Brave Search. Fallback: Spoonacular's own recipe database. Any failure
// (missing key, network error, no confident match) degrades to omitting the fields —
// never fabricates a URL.

const APPROVED_DOMAINS = [
  'panlasangpinoy.com',
  'recipetineats.com',
  'kawalingpinoy.com',
  'taste.com.au',
] as const;

const FETCH_TIMEOUT_MS = 8_000;
// Jaccard word overlap between the generated meal name and a candidate title. 0.25
// (was 0.34) because long descriptive agent names dilute the score: "Garlic Butter
// Chicken Thighs with Rice" vs "Garlic Chicken" is the same dish at ~0.33, while
// genuinely unrelated titles score ~0-0.15. Raising this again starves FR-037's
// linked-meal minimum; lowering it much further risks attaching wrong recipes.
const MIN_TITLE_SIMILARITY = 0.25;

interface BraveWebResult {
  title: string;
  url: string;
}
interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] };
}

interface SpoonacularSearchResult {
  id: number;
  title: string;
  image?: string;
}
interface SpoonacularSearchResponse {
  results?: SpoonacularSearchResult[];
}
interface SpoonacularRecipeInfo {
  sourceUrl?: string;
  image?: string;
}

export interface VerifiedRecipe {
  recipeUrl: string;
  imageUrl?: string;
}

/** Normalise a title/name into a comparable word set (lowercased, punctuation stripped, short tokens dropped). */
function normalizeWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/**
 * Return the first argument that is a well-formed image URL, else undefined. Spoonacular's
 * /information endpoint can emit a malformed URL (empty imageType → a trailing-dot URL with
 * no extension, e.g. `.../653775-556x370.`); we must not surface that as an <img> src.
 */
function firstValidImageUrl(...candidates: (string | undefined)[]): string | undefined {
  return candidates.find(
    (u): u is string => typeof u === 'string' && /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(u),
  );
}

/** Jaccard-style word overlap between a generated meal name and a candidate recipe title. */
function titleSimilarity(mealName: string, candidateTitle: string): number {
  const a = normalizeWords(mealName);
  const b = normalizeWords(candidateTitle);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  return intersection / new Set([...a, ...b]).size;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isApprovedDomain(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return APPROVED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Search only the four approved recipe-blog domains via Brave Search's `site:` operator. */
async function searchApprovedDomains(mealName: string): Promise<VerifiedRecipe | null> {
  const apiKey = process.env['BRAVE_SEARCH_API_KEY'];
  if (!apiKey) return null;

  const siteClause = APPROVED_DOMAINS.map((d) => `site:${d}`).join(' OR ');
  const query = `${mealName} recipe (${siteClause})`;

  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
      {
        headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as BraveSearchResponse;
    const results = data.web?.results ?? [];
    const best = results
      .filter((r) => isApprovedDomain(r.url))
      .map((r) => ({ r, score: titleSimilarity(mealName, r.title) }))
      .sort((a, b) => b.score - a.score)[0];

    if (!best || best.score < MIN_TITLE_SIMILARITY) return null;
    return { recipeUrl: best.r.url };
  } catch (err) {
    console.warn('recipe-verifier: approved-domain search failed', err);
    return null;
  }
}

/** Run Spoonacular's complexSearch and return the top candidate if it's a plausible match. */
async function findSpoonacularCandidate(
  mealName: string,
  apiKey: string,
): Promise<SpoonacularSearchResult | null> {
  const searchRes = await fetch(
    `https://api.spoonacular.com/recipes/complexSearch?apiKey=${apiKey}&number=1&query=${encodeURIComponent(mealName)}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!searchRes.ok) return null;
  const searchData = (await searchRes.json()) as SpoonacularSearchResponse;
  const top = searchData.results?.[0];
  const isMatch = top !== undefined && titleSimilarity(mealName, top.title) >= MIN_TITLE_SIMILARITY;
  return isMatch ? top! : null;
}

/** Fetch full recipe info (for sourceUrl) once complexSearch has identified a candidate id. */
async function fetchSpoonacularInfo(id: number, apiKey: string): Promise<SpoonacularRecipeInfo | null> {
  const infoRes = await fetch(`https://api.spoonacular.com/recipes/${id}/information?apiKey=${apiKey}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!infoRes.ok) return null;
  return (await infoRes.json()) as SpoonacularRecipeInfo;
}

function toVerifiedRecipe(sourceUrl: string, imageUrl: string | undefined): VerifiedRecipe {
  return imageUrl ? { recipeUrl: sourceUrl, imageUrl } : { recipeUrl: sourceUrl };
}

/** Fallback: Spoonacular's own recipe database (not domain-restricted). */
async function searchSpoonacular(mealName: string): Promise<VerifiedRecipe | null> {
  const apiKey = process.env['SPOONACULAR_API_KEY'];
  if (!apiKey) return null;

  try {
    const candidate = await findSpoonacularCandidate(mealName, apiKey);
    if (!candidate) return null;

    const info = await fetchSpoonacularInfo(candidate.id, apiKey);
    if (!info || !info.sourceUrl) return null;

    // Prefer the search-result image (reliably well-formed) over /information's (which can
    // be malformed); attach only a valid image URL, else omit imageUrl entirely.
    return toVerifiedRecipe(info.sourceUrl, firstValidImageUrl(candidate.image, info.image));
  } catch (err) {
    console.warn('recipe-verifier: Spoonacular fallback failed', err);
    return null;
  }
}

/**
 * FR-037: whether recipe-link verification can run at all. With neither provider key
 * configured, no meal can ever be linked — the recommendations controller uses this to
 * fail loudly instead of silently returning (and then dropping) every meal.
 */
export function isRecipeVerificationConfigured(): boolean {
  return Boolean(process.env['BRAVE_SEARCH_API_KEY'] || process.env['SPOONACULAR_API_KEY']);
}

/**
 * Find a real, verified recipe URL for a meal name — approved domains first, then
 * Spoonacular. Returns null (never a guess) if nothing confident is found.
 */
export async function verifyRecipe(mealName: string): Promise<VerifiedRecipe | null> {
  const approved = await searchApprovedDomains(mealName);
  if (approved) return approved;
  return searchSpoonacular(mealName);
}

/** Enrich a recommendation list with verified recipe URLs (parallel across meals, best-effort). */
export async function attachVerifiedRecipes(meals: MealRecommendation[]): Promise<MealRecommendation[]> {
  const verified = await Promise.all(meals.map((m) => verifyRecipe(m.mealName)));
  return meals.map((meal, i) => {
    const v = verified[i];
    if (!v) return meal;
    return v.imageUrl ? { ...meal, recipeUrl: v.recipeUrl, imageUrl: v.imageUrl } : { ...meal, recipeUrl: v.recipeUrl };
  });
}
