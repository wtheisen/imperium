import { describe, it, expect, vi, afterEach } from 'vitest';
import { EnemyPlacement } from '../ai/EnemyPlacement';
import { Unit } from '../entities/Unit';

const UNIT_STATS = {
  maxHp: 50, speed: 1, attackDamage: 5, attackRange: 1,
  attackCooldown: 1, isRanged: false,
};

function makeMission(campTileX: number, campTileY: number) {
  return {
    enemyCamps: [{
      id: 'camp1',
      tileX: campTileX,
      tileY: campTileY,
      aggroRadius: 8,
      units: [{ type: 'ork_boy', stats: UNIT_STATS, count: 3 }],
    }],
  } as any;
}

function makeEntityManager(spawnedUnits: { tileX: number; tileY: number }[]) {
  return {
    spawnUnit: vi.fn((tileX, tileY, type, stats, team) => {
      const unit = new Unit(tileX, tileY, type, stats, team);
      spawnedUnits.push({ tileX, tileY });
      return unit;
    }),
    spawnBuilding: vi.fn(),
  } as any;
}

function makeMapManager(walkableFn: (x: number, y: number) => boolean) {
  return { isWalkable: vi.fn((x, y) => walkableFn(x, y)) } as any;
}

describe('EnemyPlacement walkability', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('places units on walkable tiles when offsets are walkable', () => {
    const spawned: { tileX: number; tileY: number }[] = [];
    const em = makeEntityManager(spawned);
    const mm = makeMapManager(() => true); // all tiles walkable

    EnemyPlacement.populate(makeMission(10, 10), em, mm);

    expect(spawned).toHaveLength(3);
    for (const pos of spawned) {
      expect(mm.isWalkable(pos.tileX, pos.tileY)).toBe(true);
    }
  });

  it('falls back to camp center when all offset tiles are impassable', () => {
    const spawned: { tileX: number; tileY: number }[] = [];
    const em = makeEntityManager(spawned);
    // Only the exact camp center (10,10) is walkable; all offsets land elsewhere
    const mm = makeMapManager((x, y) => x === 10 && y === 10);

    EnemyPlacement.populate(makeMission(10, 10), em, mm);

    expect(spawned).toHaveLength(3);
    for (const pos of spawned) {
      expect(pos.tileX).toBe(10);
      expect(pos.tileY).toBe(10);
    }
  });

  it('prefers first walkable offset over camp center', () => {
    const spawned: { tileX: number; tileY: number }[] = [];
    const em = makeEntityManager(spawned);
    // Make everything walkable — units should NOT all land at camp center
    const mm = makeMapManager(() => true);
    const math = vi.spyOn(Math, 'random');
    // Force offsets to always be (+2, +2) → tile (12, 12)
    math.mockReturnValue(0.99);

    EnemyPlacement.populate(makeMission(10, 10), em, mm);

    expect(spawned).toHaveLength(3);
    // With random=0.99: floor(0.99*5)-2 = floor(4.95)-2 = 4-2 = 2, so tile (12,12)
    for (const pos of spawned) {
      expect(pos.tileX).toBe(12);
      expect(pos.tileY).toBe(12);
    }
  });

  it('clamps spawn position to map bounds', () => {
    const spawned: { tileX: number; tileY: number }[] = [];
    const em = makeEntityManager(spawned);
    const mm = makeMapManager(() => true);
    const math = vi.spyOn(Math, 'random');
    // Force offset of +2 in both directions from camp at (79,79) → clamped to (79,79)
    math.mockReturnValue(0.99);

    EnemyPlacement.populate(makeMission(79, 79), em, mm);

    expect(spawned).toHaveLength(3);
    for (const pos of spawned) {
      expect(pos.tileX).toBeLessThanOrEqual(79);
      expect(pos.tileY).toBeLessThanOrEqual(79);
      expect(pos.tileX).toBeGreaterThanOrEqual(0);
      expect(pos.tileY).toBeGreaterThanOrEqual(0);
    }
  });

  it('tries multiple offsets before falling back to camp center', () => {
    const spawned: { tileX: number; tileY: number }[] = [];
    const em = makeEntityManager(spawned);
    // First 4 offsets are impassable, 5th succeeds at (11, 10)
    let callCount = 0;
    const mm = makeMapManager((x, y) => {
      callCount++;
      // Allow the 5th isWalkable call per unit to succeed at some specific tile
      return callCount % 5 === 0;
    });

    EnemyPlacement.populate(makeMission(10, 10), em, mm);

    // 3 units × up to 5 attempts each = up to 15 isWalkable calls
    expect(mm.isWalkable).toHaveBeenCalled();
    expect(spawned).toHaveLength(3);
  });

  it('tags units with camp metadata', () => {
    const units: Unit[] = [];
    const em = {
      spawnUnit: vi.fn((tileX, tileY, type, stats, team) => {
        const u = new Unit(tileX, tileY, type, stats, team);
        units.push(u);
        return u;
      }),
      spawnBuilding: vi.fn(),
    } as any;
    const mm = makeMapManager(() => true);

    EnemyPlacement.populate(makeMission(10, 10), em, mm);

    for (const u of units) {
      expect(u.campId).toBe('camp1');
      expect(u.homeX).toBe(10);
      expect(u.homeY).toBe(10);
      expect(u.aggroRadius).toBe(8);
    }
  });
});
