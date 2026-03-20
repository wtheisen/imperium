import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EntityManager } from '../systems/EntityManager';
import { Unit, UnitStats } from '../entities/Unit';
import { Building, BuildingStats } from '../entities/Building';
import { EventBus } from '../EventBus';

// Stub PlacementValidator
function mockValidator() {
  return {
    canPlace: vi.fn().mockReturnValue(true),
    occupyTiles: vi.fn(),
    occupyTile: vi.fn(),
    freeTiles: vi.fn(),
  } as any;
}

const baseUnitStats: UnitStats = {
  maxHp: 10,
  speed: 1,
  attackDamage: 5,
  attackRange: 1,
  attackCooldown: 1000,
  isRanged: false,
};

const baseBuildingStats: BuildingStats = {
  maxHp: 50,
  tileWidth: 1,
  tileHeight: 1,
};

describe('EntityManager cached entity lists', () => {
  let em: EntityManager;

  beforeEach(() => {
    em = new EntityManager(mockValidator());
  });

  afterEach(() => {
    em.destroy();
    EventBus.removeAllListeners();
  });

  it('getUnits(team) returns cached array on repeated calls', () => {
    em.spawnUnit(0, 0,'marine', baseUnitStats, 'player');
    em.spawnUnit(1, 0,'ork', baseUnitStats, 'enemy');

    const first = em.getUnits('player');
    const second = em.getUnits('player');
    expect(first).toBe(second); // same reference = cached
    expect(first).toHaveLength(1);
    expect(first[0]).toBeInstanceOf(Unit);
    expect(first[0].team).toBe('player');
  });

  it('getUnits(team) returns correct team partition', () => {
    em.spawnUnit(0, 0,'marine', baseUnitStats, 'player');
    em.spawnUnit(1, 0,'marine2', baseUnitStats, 'player');
    em.spawnUnit(2, 0,'ork', baseUnitStats, 'enemy');

    expect(em.getUnits('player')).toHaveLength(2);
    expect(em.getUnits('enemy')).toHaveLength(1);
  });

  it('getUnits() without team still filters but does not cache', () => {
    em.spawnUnit(0, 0,'marine', baseUnitStats, 'player');
    const first = em.getUnits();
    const second = em.getUnits();
    // No caching for team-less calls — new array each time
    expect(first).not.toBe(second);
    expect(first).toHaveLength(1);
  });

  it('getBuildings(team) returns cached array on repeated calls', () => {
    em.spawnBuilding(0, 0,'generic', baseBuildingStats, 'player');
    em.spawnBuilding(5, 5,'generic', baseBuildingStats, 'enemy');

    const first = em.getBuildings('player');
    const second = em.getBuildings('player');
    expect(first).toBe(second);
    expect(first).toHaveLength(1);
    expect(first[0]).toBeInstanceOf(Building);
  });

  it('getEntitiesByTeam returns cached array on repeated calls', () => {
    em.spawnUnit(0, 0,'marine', baseUnitStats, 'player');
    em.spawnBuilding(1, 1,'generic', baseBuildingStats, 'player');
    em.spawnUnit(2, 0,'ork', baseUnitStats, 'enemy');

    const playerFirst = em.getEntitiesByTeam('player');
    const playerSecond = em.getEntitiesByTeam('player');
    expect(playerFirst).toBe(playerSecond);
    expect(playerFirst).toHaveLength(2);

    const enemyFirst = em.getEntitiesByTeam('enemy');
    expect(enemyFirst).toBe(em.getEntitiesByTeam('enemy'));
    expect(enemyFirst).toHaveLength(1);
  });

  it('caches are invalidated when a unit is spawned', () => {
    em.spawnUnit(0, 0,'marine', baseUnitStats, 'player');
    const before = em.getUnits('player');
    expect(before).toHaveLength(1);

    em.spawnUnit(1, 0,'marine2', baseUnitStats, 'player');
    const after = em.getUnits('player');
    expect(after).not.toBe(before);
    expect(after).toHaveLength(2);
  });

  it('caches are invalidated when a building is spawned', () => {
    em.spawnBuilding(0, 0,'generic', baseBuildingStats, 'player');
    const before = em.getBuildings('player');

    em.spawnBuilding(2, 2,'generic', baseBuildingStats, 'player');
    const after = em.getBuildings('player');
    expect(after).not.toBe(before);
    expect(after).toHaveLength(2);
  });

  it('caches are invalidated when an entity dies', () => {
    const unit = em.spawnUnit(0, 0,'marine', baseUnitStats, 'player');
    const before = em.getUnits('player');
    expect(before).toHaveLength(1);

    EventBus.emit('entity-died', { entity: unit });
    const after = em.getUnits('player');
    expect(after).not.toBe(before);
    expect(after).toHaveLength(0);
  });

  it('getNearestEnemy uses cached team list and skips inactive', () => {
    const player = em.spawnUnit(0, 0,'marine', baseUnitStats, 'player');
    const nearEnemy = em.spawnUnit(2, 0,'ork1', baseUnitStats, 'enemy');
    em.spawnUnit(10, 10,'ork2', baseUnitStats, 'enemy');

    expect(em.getNearestEnemy(player)).toBe(nearEnemy);
  });

  it('getNearestEnemy skips inactive enemies', () => {
    const player = em.spawnUnit(0, 0,'marine', baseUnitStats, 'player');
    const close = em.spawnUnit(1, 0,'ork1', baseUnitStats, 'enemy');
    const far = em.spawnUnit(5, 5,'ork2', baseUnitStats, 'enemy');

    close.active = false;
    expect(em.getNearestEnemy(player)).toBe(far);
  });

  it('getNearestEnemy returns null when no enemies exist', () => {
    const player = em.spawnUnit(0, 0,'marine', baseUnitStats, 'player');
    expect(em.getNearestEnemy(player)).toBeNull();
  });

  it('getNearestEnemy works for enemy looking at player entities', () => {
    const enemy = em.spawnUnit(0, 0,'ork', baseUnitStats, 'enemy');
    const player = em.spawnUnit(3, 3,'marine', baseUnitStats, 'player');

    expect(em.getNearestEnemy(enemy)).toBe(player);
  });

  it('getNearestEnemyInRange returns null when no enemies are within range', () => {
    const player = em.spawnUnit(0, 0, 'marine', baseUnitStats, 'player');
    em.spawnUnit(10, 10, 'ork', baseUnitStats, 'enemy');

    // maxRange 5 — enemy is at Manhattan distance 20
    expect(em.getNearestEnemyInRange(player, 5)).toBeNull();
  });

  it('getNearestEnemyInRange returns nearest enemy when one is in range', () => {
    const player = em.spawnUnit(0, 0, 'marine', baseUnitStats, 'player');
    const close = em.spawnUnit(2, 1, 'ork1', baseUnitStats, 'enemy');
    em.spawnUnit(10, 10, 'ork2', baseUnitStats, 'enemy');

    // maxRange 5 — close enemy is at distance 3, far enemy at 20
    expect(em.getNearestEnemyInRange(player, 5)).toBe(close);
  });

  it('getNearestEnemyInRange skips inactive enemies', () => {
    const player = em.spawnUnit(0, 0, 'marine', baseUnitStats, 'player');
    const close = em.spawnUnit(1, 0, 'ork1', baseUnitStats, 'enemy');
    const far = em.spawnUnit(3, 0, 'ork2', baseUnitStats, 'enemy');

    close.active = false;
    expect(em.getNearestEnemyInRange(player, 5)).toBe(far);
  });

  it('getNearestEnemyInRange returns null when no enemies exist', () => {
    const player = em.spawnUnit(0, 0, 'marine', baseUnitStats, 'player');
    expect(em.getNearestEnemyInRange(player, 10)).toBeNull();
  });
});
