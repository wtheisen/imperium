import { describe, it, expect } from 'vitest';
import { MathUtils, createRng, noise2d, smoothNoise, fbm } from '../utils/MathUtils';

describe('MathUtils', () => {
  describe('clamp', () => {
    it('returns value when in range', () => {
      expect(MathUtils.clamp(5, 0, 10)).toBe(5);
    });

    it('clamps to min', () => {
      expect(MathUtils.clamp(-5, 0, 10)).toBe(0);
    });

    it('clamps to max', () => {
      expect(MathUtils.clamp(15, 0, 10)).toBe(10);
    });

    it('handles equal min/max', () => {
      expect(MathUtils.clamp(5, 3, 3)).toBe(3);
    });
  });

  describe('distance', () => {
    it('zero for same point', () => {
      expect(MathUtils.distance(3, 4, 3, 4)).toBe(0);
    });

    it('correct for 3-4-5 triangle', () => {
      expect(MathUtils.distance(0, 0, 3, 4)).toBe(5);
    });
  });

  describe('lerp', () => {
    it('returns a at t=0', () => {
      expect(MathUtils.lerp(10, 20, 0)).toBe(10);
    });

    it('returns b at t=1', () => {
      expect(MathUtils.lerp(10, 20, 1)).toBe(20);
    });

    it('midpoint at t=0.5', () => {
      expect(MathUtils.lerp(0, 100, 0.5)).toBe(50);
    });
  });

  describe('shuffleArray', () => {
    it('returns same length', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(MathUtils.shuffleArray(arr)).toHaveLength(5);
    });

    it('contains same elements', () => {
      const arr = [1, 2, 3, 4, 5];
      const shuffled = MathUtils.shuffleArray(arr);
      expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('does not mutate original', () => {
      const arr = [1, 2, 3];
      MathUtils.shuffleArray(arr);
      expect(arr).toEqual([1, 2, 3]);
    });
  });

  describe('randomInt', () => {
    it('stays within bounds over many calls', () => {
      for (let i = 0; i < 100; i++) {
        const val = MathUtils.randomInt(3, 7);
        expect(val).toBeGreaterThanOrEqual(3);
        expect(val).toBeLessThanOrEqual(7);
        expect(Number.isInteger(val)).toBe(true);
      }
    });
  });

  describe('randomFloat', () => {
    it('stays within bounds over many calls', () => {
      for (let i = 0; i < 100; i++) {
        const val = MathUtils.randomFloat(1.0, 2.0);
        expect(val).toBeGreaterThanOrEqual(1.0);
        expect(val).toBeLessThan(2.0);
      }
    });
  });
});

describe('createRng', () => {
  it('produces deterministic sequence for same seed', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createRng(1);
    const rng2 = createRng(2);
    const v1 = rng1();
    const v2 = rng2();
    expect(v1).not.toBe(v2);
  });

  it('returns values in [0, 1)', () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('handles seed of 0 (falls back to 1)', () => {
    const rng = createRng(0);
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it('handles negative seed', () => {
    const rngPos = createRng(42);
    const rngNeg = createRng(-42);
    expect(rngPos()).toBe(rngNeg());
  });
});

describe('noise2d', () => {
  it('returns deterministic values for same inputs', () => {
    expect(noise2d(5, 10, 42)).toBe(noise2d(5, 10, 42));
  });

  it('returns values in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const v = noise2d(i, i * 3, 99);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('varies with different coordinates', () => {
    const a = noise2d(0, 0, 1);
    const b = noise2d(10, 20, 1);
    expect(a).not.toBe(b);
  });

  it('varies with different seeds', () => {
    const a = noise2d(5, 5, 1);
    const b = noise2d(5, 5, 2);
    expect(a).not.toBe(b);
  });
});

describe('smoothNoise', () => {
  it('matches noise2d at integer coordinates', () => {
    expect(smoothNoise(3, 7, 42)).toBe(noise2d(3, 7, 42));
  });

  it('returns values in [0, 1) for fractional coordinates', () => {
    for (let i = 0; i < 50; i++) {
      const v = smoothNoise(i * 0.37, i * 0.53, 123);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic', () => {
    expect(smoothNoise(1.5, 2.7, 10)).toBe(smoothNoise(1.5, 2.7, 10));
  });
});

describe('fbm', () => {
  it('returns values in [0, 1) range', () => {
    for (let i = 0; i < 50; i++) {
      const v = fbm(i * 0.1, i * 0.2, 4, 42);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic', () => {
    expect(fbm(3.5, 7.2, 4, 99)).toBe(fbm(3.5, 7.2, 4, 99));
  });

  it('varies with octave count', () => {
    const a = fbm(5, 5, 1, 42);
    const b = fbm(5, 5, 4, 42);
    expect(a).not.toBe(b);
  });
});
