/** Normalises an ingredient name string into a canonical grouping key */
export function normalizeIngredientName(raw: string): string {
  let name = raw.trim().toLowerCase();

  // Strip leading quantity prefix: e.g. "2 cups onion" -> "onion"
  // Longer unit strings must come before shorter ones to avoid partial matches
  name = name.replace(/^\d+(\.\d+)?\s*(tablespoons|tablespoon|teaspoons|teaspoon|fl oz|pounds|ounces|pound|ounce|cups|tbsp|tsp|lbs|cup|oz|lb|kg|ml|g|l)?\s*/i, '');

  // Strip remaining leading digits (e.g. "1 onion" -> "onion")
  name = name.replace(/^\d+\s+/, '');

  // Collapse internal whitespace
  name = name.replace(/\s+/g, ' ').trim();

  // Simple plural stemming
  name = stemPlural(name);

  return name;
}

function stemPlural(word: string): string {
  // Exceptions — do not stem these
  const exceptions = new Set([
    'asparagus', 'broccoli', 'couscous', 'hummus', 'quinoa', 'oats',
    'peas', 'beans', 'lentils', 'chips', 'greens', 'sprouts', 'herbs',
  ]);
  if (exceptions.has(word)) return word;

  // Handle compound words — only stem the last word
  const parts = word.split(' ');
  const last = parts[parts.length - 1] ?? word;
  const stem = stemWord(last);
  parts[parts.length - 1] = stem;
  return parts.join(' ');
}

function stripEsSuffix(w: string): string | null {
  if (!w.endsWith('es') || w.length <= 4) return null;
  const pre = w.slice(0, -2);
  if (/(?:sh|ch|x|z|ss)$/.test(pre)) return pre;
  if (pre.endsWith('to')) return pre; // "tomatoes" -> "tomato"
  return null;
}

function endsWithPlainS(w: string): boolean {
  return w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is');
}

function stemWord(w: string): string {
  if (w.length <= 3) return w;

  // -ies -> -y (e.g. "berries" -> "berry")
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';

  // -ves -> -f (e.g. "loaves" -> "loaf")
  if (w.endsWith('ves') && w.length > 4) return w.slice(0, -3) + 'f';

  // -es ending: only strip if preceded by sh, ch, x, z, ss
  const stripped = stripEsSuffix(w);
  if (stripped !== null) return stripped;

  // Trailing -s (but not -ss, -us, -is endings)
  if (endsWithPlainS(w)) return w.slice(0, -1);

  return w;
}

interface MatchGroup {
  canonical: string;
  displayName: string;
  originalNames: string[];
}

/**
 * Groups a list of ingredient name strings by canonical key.
 * Returns a Map from canonical name -> MatchGroup.
 */
export function matchIngredients(names: string[]): Map<string, MatchGroup> {
  const groups = new Map<string, MatchGroup>();

  for (const raw of names) {
    const canonical = normalizeIngredientName(raw);
    if (!canonical) continue;

    const existing = groups.get(canonical);
    if (existing) {
      existing.originalNames.push(raw);
      // Keep the most-descriptive (most words) display name
      if (raw.split(' ').length > existing.displayName.split(' ').length) {
        existing.displayName = toTitleCase(raw);
      }
    } else {
      groups.set(canonical, {
        canonical,
        displayName: toTitleCase(raw),
        originalNames: [raw],
      });
    }
  }

  return groups;
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}
