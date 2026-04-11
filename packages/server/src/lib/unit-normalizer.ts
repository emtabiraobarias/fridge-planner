export type DimensionFamily = 'volume' | 'mass' | 'count' | 'servings' | 'unknown';

export interface NormalizedQuantity {
  value: number;
  baseUnit: string;
  family: DimensionFamily;
}

/** Alias map: normalises unit strings before lookup */
const UNIT_ALIASES: Record<string, string> = {
  // volume
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  floz: 'fl oz',
  'fl. oz': 'fl oz',
  cups: 'cup',
  pint: 'pt',
  pints: 'pt',
  quart: 'qt',
  quarts: 'qt',
  gallon: 'gal',
  gallons: 'gal',
  // mass
  gram: 'g',
  grams: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  milligram: 'mg',
  milligrams: 'mg',
  ounce: 'oz',
  ounces: 'oz',
  pound: 'lb',
  pounds: 'lb',
  lbs: 'lb',
  // count
  piece: 'count',
  pieces: 'count',
  unit: 'count',
  units: 'count',
  item: 'count',
  items: 'count',
  dozen: 'dozen',
  pack: 'count',
  packs: 'count',
};

/** Volume family: ml as base unit */
const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  'fl oz': 29.5735,
  cup: 236.588,
  pt: 473.176,
  qt: 946.353,
  gal: 3785.41,
};

/** Mass family: g as base unit */
const MASS_TO_G: Record<string, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

/** Count family: count as base unit */
const COUNT_TO_COUNT: Record<string, number> = {
  count: 1,
  dozen: 12,
};

export function resolveAlias(unit: string): string {
  const lower = unit.trim().toLowerCase();
  return UNIT_ALIASES[lower] ?? lower;
}

export function normalizeUnit(quantity: number, unit: string): NormalizedQuantity {
  const resolved = resolveAlias(unit);

  if (resolved === 'servings') {
    return { value: quantity, baseUnit: 'servings', family: 'servings' };
  }

  if (resolved in VOLUME_TO_ML) {
    return {
      value: quantity * (VOLUME_TO_ML[resolved] as number),
      baseUnit: 'ml',
      family: 'volume',
    };
  }

  if (resolved in MASS_TO_G) {
    return {
      value: quantity * (MASS_TO_G[resolved] as number),
      baseUnit: 'g',
      family: 'mass',
    };
  }

  if (resolved in COUNT_TO_COUNT) {
    return {
      value: quantity * (COUNT_TO_COUNT[resolved] as number),
      baseUnit: 'count',
      family: 'count',
    };
  }

  return { value: quantity, baseUnit: resolved, family: 'unknown' };
}

export function canSubtract(unitA: string, unitB: string): boolean {
  const a = normalizeUnit(1, unitA);
  const b = normalizeUnit(1, unitB);
  if (a.family === 'servings' || b.family === 'servings') return false;
  if (a.family === 'unknown' || b.family === 'unknown') return false;
  return a.family === b.family;
}

/**
 * Returns net quantity still needed (in the original unit of `neededUnit`),
 * after subtracting `availableQty availableUnit` from `neededQty neededUnit`.
 * Returns null if units are incompatible.
 * Returns 0 if we have more than enough.
 */
export function netNeeded(
  neededQty: number,
  neededUnit: string,
  availableQty: number,
  availableUnit: string,
): { netQty: number; netUnit: string } | null {
  if (!canSubtract(neededUnit, availableUnit)) return null;

  const needed = normalizeUnit(neededQty, neededUnit);
  const available = normalizeUnit(availableQty, availableUnit);

  const netBase = needed.value - available.value;
  if (netBase <= 0) return { netQty: 0, netUnit: neededUnit };

  // Convert back to original unit
  const resolvedNeeded = resolveAlias(neededUnit);
  let conversionFactor = 1;

  if (needed.family === 'volume') {
    conversionFactor = VOLUME_TO_ML[resolvedNeeded] ?? 1;
  } else if (needed.family === 'mass') {
    conversionFactor = MASS_TO_G[resolvedNeeded] ?? 1;
  } else if (needed.family === 'count') {
    conversionFactor = COUNT_TO_COUNT[resolvedNeeded] ?? 1;
  }

  return {
    netQty: Math.ceil((netBase / conversionFactor) * 100) / 100,
    netUnit: neededUnit,
  };
}
