import { describe, it, expect } from 'vitest';
import {
  generateMission,
  generateSeedString,
  parseSeedString,
  seedToString,
  getArchetypeIds,
  getArchetypeLabel,
} from '../missions/ProceduralMissionGenerator';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';

describe('generateMission', () => {
  describe('structural validity', () => {
    for (const d of [1, 2, 3, 4]) {
      it(`produces a valid MissionDefinition at difficulty ${d}`, () => {
        const mission = generateMission(d, 12345);
        expect(mission.id).toContain('proc_');
        expect(mission.name.length).toBeGreaterThan(0);
        expect(mission.description.length).toBeGreaterThan(0);
        expect(mission.difficulty).toBe(d);
        expect(mission.objectives.length).toBeGreaterThan(0);
        expect(mission.enemyCamps.length).toBeGreaterThan(0);
        expect(mission.startingGold).toBeGreaterThan(0);
        expect(mission.supplyDropIntervalMs).toBeGreaterThan(0);
        expect(mission.terrain).toBeDefined();
      });
    }
  });

  describe('objective-camp references', () => {
    it('all destroy objectives reference existing camps', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const mission = generateMission(3, seed);
        const campIds = new Set(mission.enemyCamps.map(c => c.id));
        const allObjectives = [
          ...mission.objectives,
          ...(mission.optionalObjectives || []),
        ];
        for (const obj of allObjectives) {
          if (obj.type === 'destroy' && obj.targetCampId) {
            expect(campIds.has(obj.targetCampId)).toBe(true);
          }
        }
      }
    });
  });

  describe('positions in bounds', () => {
    it('all camp and objective positions are within map bounds', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const d = ((seed - 1) % 4) + 1;
        const mission = generateMission(d, seed);

        for (const camp of mission.enemyCamps) {
          expect(camp.tileX).toBeGreaterThanOrEqual(0);
          expect(camp.tileX).toBeLessThan(MAP_WIDTH);
          expect(camp.tileY).toBeGreaterThanOrEqual(0);
          expect(camp.tileY).toBeLessThan(MAP_HEIGHT);
        }

        for (const obj of mission.objectives) {
          expect(obj.tileX).toBeGreaterThanOrEqual(0);
          expect(obj.tileX).toBeLessThan(MAP_WIDTH);
          expect(obj.tileY).toBeGreaterThanOrEqual(0);
          expect(obj.tileY).toBeLessThan(MAP_HEIGHT);
        }
      }
    });
  });

  describe('reproducibility', () => {
    it('same seed produces identical missions', () => {
      const m1 = generateMission(2, 42);
      const m2 = generateMission(2, 42);
      expect(m1).toEqual(m2);
    });

    it('different seeds produce different missions', () => {
      const m1 = generateMission(2, 100);
      const m2 = generateMission(2, 200);
      expect(m1.id).not.toBe(m2.id);
    });
  });

  describe('difficulty scaling', () => {
    it('D1 has higher starting gold than D4', () => {
      // Average over multiple seeds
      let d1Total = 0, d4Total = 0;
      for (let s = 1; s <= 10; s++) {
        d1Total += generateMission(1, s).startingGold;
        d4Total += generateMission(4, s).startingGold;
      }
      expect(d1Total / 10).toBeGreaterThan(d4Total / 10);
    });

    it('D1 has no brutes in guard camps', () => {
      for (let s = 1; s <= 10; s++) {
        const mission = generateMission(1, s);
        for (const camp of mission.enemyCamps) {
          const brutes = camp.units.filter(u => u.type === 'enemy_brute');
          expect(brutes.every(b => b.count === 0) || brutes.length === 0).toBe(true);
        }
      }
    });

    it('D4 has extraction timer', () => {
      const mission = generateMission(4, 42);
      expect(mission.extractionTimerMs).toBeGreaterThan(0);
    });

    it('D1 has no extraction timer', () => {
      const mission = generateMission(1, 42);
      expect(mission.extractionTimerMs).toBeUndefined();
    });

    it('D1 has no environment modifiers without player overrides', () => {
      for (let s = 1; s <= 10; s++) {
        const mission = generateMission(1, s);
        expect(mission.environmentModifiers).toBeUndefined();
      }
    });
  });

  describe('camp spacing', () => {
    it('no two camps are closer than 8 tiles', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const d = ((seed - 1) % 4) + 1;
        const mission = generateMission(d, seed);
        for (let i = 0; i < mission.enemyCamps.length; i++) {
          for (let j = i + 1; j < mission.enemyCamps.length; j++) {
            const a = mission.enemyCamps[i];
            const b = mission.enemyCamps[j];
            // Guard camps are co-located with objectives, which may share position
            // Only check non-co-located camps
            if (a.tileX === b.tileX && a.tileY === b.tileY) continue;
            const dist = Math.abs(a.tileX - b.tileX) + Math.abs(a.tileY - b.tileY);
            expect(dist).toBeGreaterThanOrEqual(8);
          }
        }
      }
    });
  });

  describe('objective type-specific fields', () => {
    it('survive objectives have surviveDurationMs', () => {
      // Generate many missions to find at least one survive objective
      for (let s = 1; s <= 50; s++) {
        const mission = generateMission(3, s);
        for (const obj of mission.objectives) {
          if (obj.type === 'survive') {
            expect(obj.surviveDurationMs).toBeGreaterThan(0);
            expect(obj.surviveRadius).toBeGreaterThan(0);
          }
        }
      }
    });

    it('activate objectives have channelDurationMs', () => {
      for (let s = 1; s <= 50; s++) {
        const mission = generateMission(2, s);
        for (const obj of mission.objectives) {
          if (obj.type === 'activate') {
            expect(obj.channelDurationMs).toBeGreaterThan(0);
          }
        }
      }
    });

    it('collect objectives have collectPositions', () => {
      for (let s = 1; s <= 50; s++) {
        const mission = generateMission(2, s);
        for (const obj of mission.objectives) {
          if (obj.type === 'collect') {
            expect(obj.collectTotal).toBeGreaterThan(0);
            expect(obj.collectPositions).toBeDefined();
            expect(obj.collectPositions!.length).toBe(obj.collectTotal);
          }
        }
      }
    });
  });

  describe('player modifiers', () => {
    it('merges player modifiers into environmentModifiers', () => {
      const mission = generateMission(1, 42, ['ork_frenzy']);
      expect(mission.environmentModifiers).toContain('ork_frenzy');
    });
  });

  describe('archetype override', () => {
    it('respects archetypeId parameter', () => {
      const mission = generateMission(2, 42, undefined, 'deep_infiltration');
      expect(mission.terrain?.mapType).toBe('space_hulk');
      expect(mission.playerStartX).toBe(10);
    });
  });

  describe('space hulk missions', () => {
    it('deep_infiltration generates space hulk terrain', () => {
      const mission = generateMission(3, 42, undefined, 'deep_infiltration');
      expect(mission.terrain?.mapType).toBe('space_hulk');
      expect(mission.terrain?.corridorWidth).toBeGreaterThanOrEqual(2);
      expect(mission.terrain?.corridorWidth).toBeLessThanOrEqual(3);
    });
  });
});

describe('seed utilities', () => {
  describe('generateSeedString', () => {
    it('returns a 6-character string', () => {
      const s = generateSeedString();
      expect(s.length).toBe(6);
    });

    it('only contains valid characters', () => {
      for (let i = 0; i < 20; i++) {
        const s = generateSeedString();
        expect(s).toMatch(/^[A-Z2-9]+$/);
      }
    });
  });

  describe('parseSeedString', () => {
    it('returns a positive number', () => {
      expect(parseSeedString('ABC123')).toBeGreaterThan(0);
    });

    it('is deterministic', () => {
      expect(parseSeedString('XYZ789')).toBe(parseSeedString('XYZ789'));
    });

    it('different strings produce different numbers', () => {
      expect(parseSeedString('AAAAAA')).not.toBe(parseSeedString('BBBBBB'));
    });
  });

  describe('seedToString', () => {
    it('returns a 6-character string', () => {
      expect(seedToString(12345).length).toBe(6);
    });

    it('is deterministic', () => {
      expect(seedToString(42)).toBe(seedToString(42));
    });
  });
});

describe('getArchetypeIds', () => {
  it('returns 10 archetype IDs', () => {
    expect(getArchetypeIds()).toHaveLength(10);
  });

  it('includes expected archetypes', () => {
    const ids = getArchetypeIds();
    expect(ids).toContain('purge_and_destroy');
    expect(ids).toContain('deep_infiltration');
    expect(ids).toContain('total_purge');
  });
});

describe('getArchetypeLabel', () => {
  it('returns human-readable labels', () => {
    expect(getArchetypeLabel('purge_and_destroy')).toBe('PURGE + DESTROY');
    expect(getArchetypeLabel('deep_infiltration')).toBe('DEEP INFILTRATION');
  });

  it('falls back for unknown IDs', () => {
    expect(getArchetypeLabel('unknown_thing')).toBe('UNKNOWN_THING');
  });
});
