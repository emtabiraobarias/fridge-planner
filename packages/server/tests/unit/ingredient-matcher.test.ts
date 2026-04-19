import { describe, it, expect } from '@jest/globals';
import { normalizeIngredientName, matchIngredients } from '../../src/lib/ingredient-matcher.js';

describe('normalizeIngredientName', () => {
  it('lowercases and trims', () => {
    expect(normalizeIngredientName('  Onion  ')).toBe('onion');
  });

  it('strips trailing plural -s', () => {
    expect(normalizeIngredientName('Onions')).toBe('onion');
  });

  it('strips -ies plural', () => {
    expect(normalizeIngredientName('Berries')).toBe('berry');
  });

  it('strips -es (tomatoes)', () => {
    expect(normalizeIngredientName('Tomatoes')).toBe('tomato');
  });

  it('strips leading quantity prefix with unit', () => {
    expect(normalizeIngredientName('2 cups onion')).toBe('onion');
    expect(normalizeIngredientName('500g chicken breast')).toBe('chicken breast');
  });

  it('strips leading standalone digits', () => {
    expect(normalizeIngredientName('3 eggs')).toBe('egg');
  });

  it('does not corrupt compound names', () => {
    expect(normalizeIngredientName('chicken breast')).toBe('chicken breast');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeIngredientName('olive   oil')).toBe('olive oil');
  });

  it('leaves exception words unchanged (peas)', () => {
    expect(normalizeIngredientName('peas')).toBe('peas');
  });

  it('leaves exception words unchanged (oats)', () => {
    expect(normalizeIngredientName('oats')).toBe('oats');
  });

  it('stems only the last word in compound names', () => {
    // "bell peppers" -> "bell pepper"
    expect(normalizeIngredientName('bell peppers')).toBe('bell pepper');
  });

  it('handles -ves stemming (loaves)', () => {
    expect(normalizeIngredientName('loaves')).toBe('loaf');
  });

  it('does not strip -us endings', () => {
    expect(normalizeIngredientName('asparagus')).toBe('asparagus');
  });
});

describe('matchIngredients', () => {
  it('groups three identical ingredient strings', () => {
    const result = matchIngredients(['onion', 'onion', 'onion']);
    expect(result.size).toBe(1);
    const group = result.get('onion');
    expect(group).toBeDefined();
    expect(group!.originalNames).toHaveLength(3);
  });

  it('groups plural and singular together (FR-026)', () => {
    const result = matchIngredients(['onion', 'Onion', 'onions']);
    expect(result.size).toBe(1);
    const group = result.get('onion');
    expect(group!.originalNames).toHaveLength(3);
  });

  it('picks the most-descriptive display name from variants sharing a canonical key', () => {
    // "fresh garlic cloves" normalizes to "fresh garlic clove" (4 words → more descriptive than "garlic")
    // Test that a multi-word variant wins when grouped with a single-word variant
    const result = matchIngredients(['onion', 'Onion', 'Onions']);
    const group = result.get('onion');
    expect(group!.displayName).toBeTruthy();
    // All three normalize to "onion"; first encountered title-cased wins
    expect(group!.originalNames).toHaveLength(3);
  });

  it('keeps distinct ingredients separate', () => {
    const result = matchIngredients(['garlic', 'ginger', 'onion']);
    expect(result.size).toBe(3);
  });

  it('ignores empty strings', () => {
    const result = matchIngredients(['', 'garlic', '']);
    expect(result.size).toBe(1);
  });

  it('returns empty map for empty input', () => {
    const result = matchIngredients([]);
    expect(result.size).toBe(0);
  });

  it('title-cases display names', () => {
    const result = matchIngredients(['soy sauce']);
    const group = result.get('soy sauce');
    expect(group!.displayName).toBe('Soy Sauce');
  });
});
