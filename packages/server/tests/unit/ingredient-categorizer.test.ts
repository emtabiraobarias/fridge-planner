import { describe, it, expect } from '@jest/globals';
import { inferCategory } from '../../src/lib/ingredient-categorizer.js';

describe('inferCategory', () => {
  it('categorises garlic as Produce', () => {
    expect(inferCategory('garlic')).toBe('Produce');
  });

  it('categorises milk as Dairy', () => {
    expect(inferCategory('milk')).toBe('Dairy');
  });

  it('categorises chicken breast as Meat', () => {
    expect(inferCategory('chicken breast')).toBe('Meat');
  });

  it('categorises salmon as Seafood', () => {
    expect(inferCategory('salmon')).toBe('Seafood');
  });

  it('categorises rice as Grains', () => {
    expect(inferCategory('rice')).toBe('Grains');
  });

  it('categorises soy sauce as Pantry', () => {
    expect(inferCategory('soy sauce')).toBe('Pantry');
  });

  it('categorises ketchup as Condiments', () => {
    expect(inferCategory('ketchup')).toBe('Condiments');
  });

  it('categorises frozen pea as Frozen', () => {
    expect(inferCategory('frozen pea')).toBe('Frozen');
  });

  it('returns Other for unknown ingredients', () => {
    expect(inferCategory('unicorn dust')).toBe('Other');
  });

  it('longest keyword wins (soy sauce > sauce)', () => {
    // "soy sauce" keyword is 9 chars, beats generic shorter matches
    expect(inferCategory('soy sauce')).toBe('Pantry');
  });

  it('categorises egg as Dairy', () => {
    expect(inferCategory('egg')).toBe('Dairy');
  });

  it('categorises cheddar as Dairy', () => {
    expect(inferCategory('cheddar')).toBe('Dairy');
  });

  it('categorises pasta as Grains', () => {
    expect(inferCategory('pasta')).toBe('Grains');
  });

  it('categorises olive oil as Pantry', () => {
    expect(inferCategory('olive oil')).toBe('Pantry');
  });

  it('categorises shrimp as Seafood', () => {
    expect(inferCategory('shrimp')).toBe('Seafood');
  });
});
