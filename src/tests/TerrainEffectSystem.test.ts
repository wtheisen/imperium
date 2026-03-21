import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainEffectSystem } from '../systems/TerrainEffectSystem';
import { MapManager, TerrainType } from '../map/MapManager';
import { Unit } from '../entities/Unit';
import { MoverComponent } from '../components/MoverComponent';
import { HealthComponent } from '../components/HealthComponent';
import { Entity } from '../entities/Entity';
import {
  TERRAIN_ICE_SPEED_MULT, TERRAIN_RUBBLE_DAMAGE_REDUCTION,
  TERRAIN_LAVA_DAMAGE, TERRAIN_LAVA_TICK_MS,
} from '../config';

function makeUnit(tileX: number, tileY: number): Unit {
  const unit = new Unit(tileX, tileY, 'test_unit', {
    maxHp: 50, speed: 2, attackDamage: 5, attackRange: 1,
    attackCooldown: 1000, isRanged: false,
  }, 'player');
  const mover = new MoverComponent(unit, 2);
  const health = new HealthComponent(unit, 50);
  unit.addComponent('mover', mover);
  unit.addComponent('health', health);
  return unit;
}

/** Minimal mock EntityManager that just returns a list of entities */
function mockEntityManager(entities: Entity[]) {
  return {
    getAllEntities: () => entities,
  } as any;
}

describe('TerrainEffectSystem', () => {
  let mapManager: MapManager;

  beforeEach(() => {
    mapManager = new MapManager();
  });

  it('resets speed multiplier to 1.0 on normal terrain', () => {
    const unit = makeUnit(5, 5);
    const mover = unit.getComponent<MoverComponent>('mover')!;
    mover.speedMultiplier = 0.5;

    const system = new TerrainEffectSystem(mapManager, mockEntityManager([unit]));
    system.update(100);

    expect(mover.speedMultiplier).toBe(1.0);
  });

  it('applies ice speed reduction when unit is on ICE', () => {
    const grid = mapManager.getTerrainGrid();
    grid[5][5] = TerrainType.ICE;

    const unit = makeUnit(5, 5);
    const system = new TerrainEffectSystem(mapManager, mockEntityManager([unit]));
    system.update(100);

    const mover = unit.getComponent<MoverComponent>('mover')!;
    expect(mover.speedMultiplier).toBe(TERRAIN_ICE_SPEED_MULT);
  });

  it('applies rubble damage reduction when unit is on RUBBLE', () => {
    const grid = mapManager.getTerrainGrid();
    grid[5][5] = TerrainType.RUBBLE;

    const unit = makeUnit(5, 5);
    const system = new TerrainEffectSystem(mapManager, mockEntityManager([unit]));
    system.update(100);

    const health = unit.getComponent<HealthComponent>('health')!;
    expect(health.terrainDamageReduction).toBe(TERRAIN_RUBBLE_DAMAGE_REDUCTION);
  });

  it('resets damage reduction when unit leaves rubble', () => {
    const grid = mapManager.getTerrainGrid();
    grid[5][5] = TerrainType.RUBBLE;

    const unit = makeUnit(5, 5);
    const system = new TerrainEffectSystem(mapManager, mockEntityManager([unit]));

    system.update(100);
    expect(unit.getComponent<HealthComponent>('health')!.terrainDamageReduction).toBe(TERRAIN_RUBBLE_DAMAGE_REDUCTION);

    // Move unit to grass
    unit.tileX = 6;
    unit.tileY = 5;
    system.update(100);
    expect(unit.getComponent<HealthComponent>('health')!.terrainDamageReduction).toBe(0);
  });

  it('deals lava DOT when unit is adjacent to lava', () => {
    const grid = mapManager.getTerrainGrid();
    grid[5][6] = TerrainType.LAVA;

    const unit = makeUnit(5, 5);
    const system = new TerrainEffectSystem(mapManager, mockEntityManager([unit]));

    const health = unit.getComponent<HealthComponent>('health')!;
    const initialHp = health.currentHp;

    system.update(TERRAIN_LAVA_TICK_MS + 1);
    expect(health.currentHp).toBe(initialHp - TERRAIN_LAVA_DAMAGE);
  });

  it('does not deal lava DOT before tick interval', () => {
    const grid = mapManager.getTerrainGrid();
    grid[5][6] = TerrainType.LAVA;

    const unit = makeUnit(5, 5);
    const system = new TerrainEffectSystem(mapManager, mockEntityManager([unit]));

    const health = unit.getComponent<HealthComponent>('health')!;
    const initialHp = health.currentHp;

    system.update(TERRAIN_LAVA_TICK_MS - 100);
    expect(health.currentHp).toBe(initialHp);
  });

  it('does not deal lava damage when not adjacent to lava', () => {
    const unit = makeUnit(5, 5);
    const system = new TerrainEffectSystem(mapManager, mockEntityManager([unit]));

    const health = unit.getComponent<HealthComponent>('health')!;
    const initialHp = health.currentHp;

    system.update(TERRAIN_LAVA_TICK_MS + 1);
    expect(health.currentHp).toBe(initialHp);
  });

  it('skips inactive entities', () => {
    const grid = mapManager.getTerrainGrid();
    grid[5][5] = TerrainType.ICE;

    const unit = makeUnit(5, 5);
    unit.active = false;
    const system = new TerrainEffectSystem(mapManager, mockEntityManager([unit]));
    system.update(100);

    const mover = unit.getComponent<MoverComponent>('mover')!;
    expect(mover.speedMultiplier).toBe(1.0);
  });

  it('accumulates lava ticks across multiple updates', () => {
    const grid = mapManager.getTerrainGrid();
    grid[5][6] = TerrainType.LAVA;

    const unit = makeUnit(5, 5);
    const system = new TerrainEffectSystem(mapManager, mockEntityManager([unit]));

    const health = unit.getComponent<HealthComponent>('health')!;
    const initialHp = health.currentHp;

    // Two half-ticks
    system.update(TERRAIN_LAVA_TICK_MS / 2);
    expect(health.currentHp).toBe(initialHp);

    system.update(TERRAIN_LAVA_TICK_MS / 2 + 1);
    expect(health.currentHp).toBe(initialHp - TERRAIN_LAVA_DAMAGE);
  });
});
