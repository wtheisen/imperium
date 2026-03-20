import { describe, it, expect, afterEach, vi } from 'vitest';
import { MissionSystem } from '../systems/MissionSystem';
import { EntityManager } from '../systems/EntityManager';
import { MissionDefinition, ObjectiveDefinition } from '../missions/MissionDefinition';
import { EventBus } from '../EventBus';

function mockValidator() {
  return {
    canPlace: vi.fn().mockReturnValue(true),
    occupyTiles: vi.fn(),
    occupyTile: vi.fn(),
    freeTiles: vi.fn(),
  } as any;
}

function makeObjective(id: string): ObjectiveDefinition {
  return {
    id,
    type: 'recover',
    name: id,
    description: '',
    tileX: 5,
    tileY: 5,
    goldReward: 0,
    cardDraws: 0,
  };
}

function makeMission(
  objectives: ObjectiveDefinition[],
  optionalObjectives?: ObjectiveDefinition[],
): MissionDefinition {
  return {
    id: 'test',
    name: 'Test Mission',
    description: '',
    difficulty: 1,
    objectives,
    optionalObjectives,
    enemyCamps: [],
    playerStartX: 20,
    playerStartY: 20,
    startingGold: 100,
    supplyDropIntervalMs: 60000,
  };
}

describe('MissionSystem.getAllStatuses cache', () => {
  let em: EntityManager;

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  it('returns the same array reference on repeated calls', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([makeObjective('obj1')]));

    const first = (ms as any).getAllStatuses();
    const second = (ms as any).getAllStatuses();
    expect(first).toBe(second);

    ms.destroy();
    em.destroy();
  });

  it('contains all required and optional statuses', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(
      em,
      makeMission([makeObjective('req1'), makeObjective('req2')], [makeObjective('opt1')]),
    );

    const all = (ms as any).getAllStatuses();
    expect(all).toHaveLength(3);
    expect(all[0].definition.id).toBe('req1');
    expect(all[1].definition.id).toBe('req2');
    expect(all[2].definition.id).toBe('opt1');

    ms.destroy();
    em.destroy();
  });

  it('returned statuses are the same object references as the source arrays', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(
      em,
      makeMission([makeObjective('req1')], [makeObjective('opt1')]),
    );

    const all = (ms as any).getAllStatuses();
    expect(all[0]).toBe(ms.objectiveStatuses[0]);
    expect(all[1]).toBe(ms.optionalObjectiveStatuses[0]);

    ms.destroy();
    em.destroy();
  });

  it('mutations to status objects are visible through the cached array', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([makeObjective('req1')]));

    const all = (ms as any).getAllStatuses();
    expect(all[0].completed).toBe(false);

    ms.objectiveStatuses[0].completed = true;

    // Same reference — mutation is visible without re-calling the cache
    expect(all[0].completed).toBe(true);

    ms.destroy();
    em.destroy();
  });

  it('works correctly with no optional objectives', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([makeObjective('req1')]));

    const all = (ms as any).getAllStatuses();
    expect(all).toHaveLength(1);
    expect(all[0].definition.id).toBe('req1');

    ms.destroy();
    em.destroy();
  });

  it('works correctly with no required objectives', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([], [makeObjective('opt1')]));

    const all = (ms as any).getAllStatuses();
    expect(all).toHaveLength(1);
    expect(all[0].definition.id).toBe('opt1');

    ms.destroy();
    em.destroy();
  });

  it('cache is initialized lazily — null before first call', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([makeObjective('req1')]));

    expect((ms as any)._allStatuses).toBeNull();
    (ms as any).getAllStatuses();
    expect((ms as any)._allStatuses).not.toBeNull();

    ms.destroy();
    em.destroy();
  });
});
