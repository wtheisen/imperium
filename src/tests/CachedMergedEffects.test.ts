import { describe, it, expect } from 'vitest';
import { getCachedMergedEffects, getMergedEffects } from '../state/DifficultyModifiers';

describe('getCachedMergedEffects', () => {
  it('returns the same result as getMergedEffects', () => {
    const modifiers = ['iron_skull', 'austerity'];
    const getter = () => modifiers;
    const cached = getCachedMergedEffects(getter);
    const direct = getMergedEffects(modifiers);
    expect(cached).toEqual(direct);
  });

  it('returns the same object reference on repeated calls with same modifiers', () => {
    const modifiers = ['wrath'];
    const getter = () => modifiers;
    const first = getCachedMergedEffects(getter);
    const second = getCachedMergedEffects(getter);
    expect(first).toBe(second);
  });

  it('recomputes when modifiers change', () => {
    let modifiers = ['iron_skull'];
    const getter = () => modifiers;
    const first = getCachedMergedEffects(getter);
    expect(first.enemyHpMult).toBe(1.25);

    modifiers = ['iron_skull', 'austerity'];
    const second = getCachedMergedEffects(getter);
    expect(second).not.toBe(first);
    expect(second.goldMult).toBe(0.75);
    expect(second.enemyHpMult).toBe(1.25);
  });

  it('returns empty effects for no modifiers', () => {
    const result = getCachedMergedEffects(() => []);
    expect(result).toEqual({});
  });
});
