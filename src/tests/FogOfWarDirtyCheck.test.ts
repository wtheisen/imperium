import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../EventBus';

vi.mock('../config', () => ({
  MAP_WIDTH: 10,
  MAP_HEIGHT: 10,
}));

import { FogOfWarSystem } from '../systems/FogOfWarSystem';
import { EntityManager } from '../systems/EntityManager';

function makeEntity(tileX: number, tileY: number, team: 'player' | 'enemy' = 'player') {
  return {
    tileX,
    tileY,
    active: true,
    team,
    entityId: `${team}-${tileX}-${tileY}`,
    visible: true,
  } as any;
}

function mockEntityManager(playerEntities: any[] = [], enemyEntities: any[] = []) {
  return {
    getEntitiesByTeam: vi.fn((team: string) => team === 'player' ? playerEntities : enemyEntities),
    getUnits: vi.fn((team: string) => team === 'enemy' ? enemyEntities : []),
    getBuildings: vi.fn(() => []),
  } as unknown as EntityManager;
}

describe('FogOfWarSystem dirty check', () => {
  let fogUpdatedCalls: number;

  beforeEach(() => {
    fogUpdatedCalls = 0;
    EventBus.on('fog-updated', () => { fogUpdatedCalls++; });
  });

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  it('emits fog-updated when visibility changes', () => {
    const unit = makeEntity(5, 5);
    const em = mockEntityManager([unit]);
    const system = new FogOfWarSystem(em);

    // First update should emit — tiles go from HIDDEN to VISIBLE
    system.update(300);
    expect(fogUpdatedCalls).toBe(1);

    system.destroy();
  });

  it('does not emit fog-updated when nothing changes', () => {
    const unit = makeEntity(5, 5);
    const em = mockEntityManager([unit]);
    const system = new FogOfWarSystem(em);

    // First update — reveals tiles
    system.update(300);
    fogUpdatedCalls = 0;

    // Second update — same unit, same position, no change
    system.update(300);
    expect(fogUpdatedCalls).toBe(0);

    system.destroy();
  });

  it('emits fog-updated when a unit moves', () => {
    const unit = makeEntity(5, 5);
    const em = mockEntityManager([unit]);
    const system = new FogOfWarSystem(em);

    // First update
    system.update(300);
    fogUpdatedCalls = 0;

    // Move the unit
    unit.tileX = 7;
    unit.tileY = 7;

    system.update(300);
    expect(fogUpdatedCalls).toBe(1);

    system.destroy();
  });

  it('skips update when timer has not elapsed', () => {
    const unit = makeEntity(5, 5);
    const em = mockEntityManager([unit]);
    const system = new FogOfWarSystem(em);

    system.update(100); // not enough time
    expect(fogUpdatedCalls).toBe(0);

    system.destroy();
  });

  it('emits fog-updated on fog-reveal event', () => {
    const em = mockEntityManager();
    const system = new FogOfWarSystem(em);

    EventBus.emit('fog-reveal', { tileX: 3, tileY: 3, radius: 2 });
    expect(fogUpdatedCalls).toBe(1);

    system.destroy();
  });

  it('removes dead enemy from hiddenEnemies on entity-died', () => {
    // Player at (0,0) sight=6 — enemy at (9,9) is ~12.7 tiles away, outside sight radius
    const player = makeEntity(0, 0, 'player');
    const enemy1 = makeEntity(9, 9, 'enemy');
    const enemies: any[] = [enemy1];
    const em = mockEntityManager([player], enemies);
    const system = new FogOfWarSystem(em);

    // First update: enemy1 enters fog → visible=false, hiddenEnemies gets enemy1.entityId
    system.update(300);
    expect(enemy1.visible).toBe(false);

    // entity-died fires → fix removes enemy1.entityId from hiddenEnemies
    EventBus.emit('entity-died', { entity: enemy1 });

    // Simulate entity ID reuse: new entity2 spawns with same ID, visible=true (default)
    const enemy2 = { ...enemy1, visible: true, active: true };
    enemies[0] = enemy2;

    // Move player slightly so fog changes and dirty=true triggers updateEnemyVisibility
    player.tileX = 0;
    player.tileY = 1;
    system.update(300);

    // enemy2 tile (9,9) is still in fog; without the fix hiddenEnemies would still have
    // the stale ID, so !hiddenEnemies.has(id) would be false and visible would stay true.
    // With the fix the stale entry was removed, so enemy2 gets hidden correctly.
    expect(enemy2.visible).toBe(false);

    system.destroy();
  });

  it('stops tracking hiddenEnemies after destroy', () => {
    // Player at (0,0), enemy at (9,9) — enemy stays in fog
    const player = makeEntity(0, 0, 'player');
    const enemy = makeEntity(9, 9, 'enemy');
    const em = mockEntityManager([player], [enemy]);
    const system = new FogOfWarSystem(em);

    system.update(300);
    expect(enemy.visible).toBe(false);

    system.destroy();

    // After destroy, entity-died should not crash (listener was unregistered)
    EventBus.emit('entity-died', { entity: enemy });
  });
});

describe('FogOfWarSystem out-of-bounds entity coordinates', () => {
  afterEach(() => {
    EventBus.removeAllListeners();
  });

  it('does not throw when a player entity has negative tileX', () => {
    const unit = makeEntity(-1, 5);
    const em = mockEntityManager([unit]);
    const system = new FogOfWarSystem(em);
    expect(() => system.update(300)).not.toThrow();
    system.destroy();
  });

  it('does not throw when a player entity has negative tileY', () => {
    const unit = makeEntity(5, -1);
    const em = mockEntityManager([unit]);
    const system = new FogOfWarSystem(em);
    expect(() => system.update(300)).not.toThrow();
    system.destroy();
  });

  it('does not throw when a player entity tileX >= MAP_WIDTH', () => {
    const unit = makeEntity(10, 5); // MAP_WIDTH = 10
    const em = mockEntityManager([unit]);
    const system = new FogOfWarSystem(em);
    expect(() => system.update(300)).not.toThrow();
    system.destroy();
  });

  it('does not throw when a player entity tileY >= MAP_HEIGHT', () => {
    const unit = makeEntity(5, 10); // MAP_HEIGHT = 10
    const em = mockEntityManager([unit]);
    const system = new FogOfWarSystem(em);
    expect(() => system.update(300)).not.toThrow();
    system.destroy();
  });

  it('skips out-of-bounds entity but still reveals in-bounds entities', () => {
    const oobUnit = makeEntity(-5, -5);
    const validUnit = makeEntity(5, 5);
    let fogUpdatedCalls = 0;
    EventBus.on('fog-updated', () => { fogUpdatedCalls++; });

    const em = mockEntityManager([oobUnit, validUnit]);
    const system = new FogOfWarSystem(em);

    system.update(300);
    // The valid unit should have revealed tiles and triggered a fog update
    expect(fogUpdatedCalls).toBe(1);
    system.destroy();
  });

  it('does not emit fog-updated when only out-of-bounds entities are present', () => {
    const oobUnit = makeEntity(-100, 200);
    let fogUpdatedCalls = 0;
    EventBus.on('fog-updated', () => { fogUpdatedCalls++; });

    const em = mockEntityManager([oobUnit]);
    const system = new FogOfWarSystem(em);

    system.update(300);
    // No in-bounds reveals → no tile changes → no event
    expect(fogUpdatedCalls).toBe(0);
    system.destroy();
  });
});
