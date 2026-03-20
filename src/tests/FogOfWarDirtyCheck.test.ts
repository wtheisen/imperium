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
});
