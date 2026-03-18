import { describe, it, expect } from 'vitest';
import { MathUtils } from '../utils/MathUtils';

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
