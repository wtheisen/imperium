import { describe, it, expect } from 'vitest';
import { CardEffects } from '../cards/CardEffects';

describe('CardEffects static lookups', () => {
  describe('getUnitStats', () => {
    it('returns stats for known unit types', () => {
      const marine = CardEffects.getUnitStats('marine');
      expect(marine).toBeDefined();
      expect(marine!.maxHp).toBeGreaterThan(0);
      expect(marine!.attackDamage).toBeGreaterThan(0);
      expect(marine!.speed).toBeGreaterThan(0);
    });

    it('servitor has gather stats', () => {
      const servitor = CardEffects.getUnitStats('servitor');
      expect(servitor).toBeDefined();
      expect(servitor!.gatherRate).toBeGreaterThan(0);
      expect(servitor!.gatherCapacity).toBeGreaterThan(0);
    });

    it('returns undefined for unknown type', () => {
      expect(CardEffects.getUnitStats('nonexistent')).toBeUndefined();
    });

    it('all unit types have required fields', () => {
      const types = ['servitor', 'guardsman', 'marine', 'scout', 'ogryn', 'techmarine', 'rhino', 'leman_russ', 'sentinel'];
      for (const type of types) {
        const stats = CardEffects.getUnitStats(type);
        expect(stats, `${type} should exist`).toBeDefined();
        expect(stats!.maxHp).toBeGreaterThan(0);
        expect(stats!.speed).toBeGreaterThan(0);
        expect(stats!.attackDamage).toBeGreaterThanOrEqual(0);
        expect(stats!.attackRange).toBeGreaterThanOrEqual(1);
        expect(stats!.attackCooldown).toBeGreaterThan(0);
        expect(typeof stats!.isRanged).toBe('boolean');
      }
    });

    it('ranged units have range > 1', () => {
      const ranged = ['guardsman', 'rhino', 'leman_russ', 'sentinel'];
      for (const type of ranged) {
        const stats = CardEffects.getUnitStats(type)!;
        expect(stats.isRanged, `${type} should be ranged`).toBe(true);
        expect(stats.attackRange, `${type} range`).toBeGreaterThan(1);
      }
    });
  });

  describe('getBuildingStats', () => {
    it('returns stats for known building types', () => {
      const tarantula = CardEffects.getBuildingStats('tarantula');
      expect(tarantula).toBeDefined();
      expect(tarantula!.maxHp).toBeGreaterThan(0);
      expect(tarantula!.attackDamage).toBeGreaterThan(0);
    });

    it('aegis has no attack', () => {
      const aegis = CardEffects.getBuildingStats('aegis');
      expect(aegis).toBeDefined();
      expect(aegis!.attackDamage).toBeUndefined();
    });

    it('returns undefined for unknown type', () => {
      expect(CardEffects.getBuildingStats('nonexistent')).toBeUndefined();
    });

    it('all building types have required fields', () => {
      const types = ['tarantula', 'aegis', 'barracks', 'drop_ship', 'sanctum'];
      for (const type of types) {
        const stats = CardEffects.getBuildingStats(type);
        expect(stats, `${type} should exist`).toBeDefined();
        expect(stats!.maxHp).toBeGreaterThan(0);
        expect(stats!.tileWidth).toBeGreaterThanOrEqual(1);
        expect(stats!.tileHeight).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
