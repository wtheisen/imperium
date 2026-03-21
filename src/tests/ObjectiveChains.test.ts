import { describe, it, expect, afterEach, vi } from 'vitest';
import { MissionSystem, ObjectiveStatus } from '../systems/MissionSystem';
import { EntityManager } from '../systems/EntityManager';
import { MissionDefinition, ObjectiveDefinition, OnCompleteAction } from '../missions/MissionDefinition';
import { EventBus } from '../EventBus';

function mockValidator() {
  return {
    canPlace: vi.fn().mockReturnValue(true),
    occupyTiles: vi.fn(),
    occupyTile: vi.fn(),
    freeTiles: vi.fn(),
  } as any;
}

function makeObjective(id: string, overrides?: Partial<ObjectiveDefinition>): ObjectiveDefinition {
  return {
    id,
    type: 'recover',
    name: id,
    description: '',
    tileX: 5,
    tileY: 5,
    goldReward: 10,
    cardDraws: 1,
    ...overrides,
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

function getStatus(ms: MissionSystem, objectiveId: string): ObjectiveStatus | undefined {
  return [...ms.objectiveStatuses, ...ms.optionalObjectiveStatuses]
    .find(s => s.definition.id === objectiveId);
}

describe('Objective Chains — Prerequisite Gating', () => {
  let em: EntityManager;

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  it('marks objectives with prerequisiteId as locked initially', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([
      makeObjective('phase1'),
      makeObjective('phase2', { prerequisiteId: 'phase1' }),
    ]));

    const phase2 = getStatus(ms, 'phase2')!;
    expect(phase2.locked).toBe(true);
    expect(phase2.hidden).toBe(false);

    ms.destroy();
    em.destroy();
  });

  it('marks objectives without prerequisiteId as unlocked', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([
      makeObjective('phase1'),
    ]));

    const phase1 = getStatus(ms, 'phase1')!;
    expect(phase1.locked).toBe(false);

    ms.destroy();
    em.destroy();
  });

  it('marks objectives with hidden:true as hidden initially', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([
      makeObjective('phase1'),
      makeObjective('phase2', { prerequisiteId: 'phase1', hidden: true }),
    ]));

    const phase2 = getStatus(ms, 'phase2')!;
    expect(phase2.locked).toBe(true);
    expect(phase2.hidden).toBe(true);

    ms.destroy();
    em.destroy();
  });

  it('does not allow locked objectives to be completed via proximity', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([
      makeObjective('phase1'),
      makeObjective('phase2', { prerequisiteId: 'phase1', tileX: 10, tileY: 10 }),
    ]));

    // Simulate a player unit at the locked objective's tile
    vi.spyOn(em, 'getUnits').mockReturnValue([
      { tileX: 10, tileY: 10, team: 'player', entityId: 'u1' } as any,
    ]);

    // Force state to ACTIVE
    ms.state = 'ACTIVE';

    const completedIds: string[] = [];
    EventBus.on('objective-completed', (data: any) => completedIds.push(data.objectiveId));

    // Tick the mission system — phase2 is locked, shouldn't complete
    ms.update(100);

    expect(completedIds).not.toContain('phase2');

    ms.destroy();
    em.destroy();
  });

  it('unlocks objective when prerequisite completes and emits objective-unlocked', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([
      makeObjective('phase1', { tileX: 5, tileY: 5 }),
      makeObjective('phase2', { prerequisiteId: 'phase1', tileX: 10, tileY: 10 }),
    ]));

    const unlockedIds: string[] = [];
    EventBus.on('objective-unlocked', (data: any) => unlockedIds.push(data.objectiveId));

    // Simulate completing phase1 by directly manipulating status
    const phase1 = getStatus(ms, 'phase1')!;
    // Use internal completeObjective
    (ms as any).completeObjective(phase1);

    expect(unlockedIds).toContain('phase2');

    const phase2 = getStatus(ms, 'phase2')!;
    expect(phase2.locked).toBe(false);
    expect(phase2.hidden).toBe(false);

    ms.destroy();
    em.destroy();
  });
});

describe('Objective Chains — On-Complete Actions', () => {
  let em: EntityManager;

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  it('executes reveal_fog action on objective completion', () => {
    em = new EntityManager(mockValidator());
    const action: OnCompleteAction = {
      type: 'reveal_fog',
      fogTileX: 15,
      fogTileY: 15,
      fogRadius: 10,
    };
    const ms = new MissionSystem(em, makeMission([
      makeObjective('obj1', { onCompleteAction: action }),
      makeObjective('obj2'), // need 2 so victory isn't triggered
    ]));

    const fogReveals: any[] = [];
    EventBus.on('fog-reveal', (data: any) => fogReveals.push(data));

    const status = getStatus(ms, 'obj1')!;
    (ms as any).completeObjective(status);

    expect(fogReveals).toHaveLength(1);
    expect(fogReveals[0]).toEqual({ tileX: 15, tileY: 15, radius: 10 });

    ms.destroy();
    em.destroy();
  });

  it('executes spawn_reinforcements action on objective completion', () => {
    em = new EntityManager(mockValidator());
    const action: OnCompleteAction = {
      type: 'spawn_reinforcements',
      spawnTileX: 20,
      spawnTileY: 20,
      spawnCount: 8,
    };
    const ms = new MissionSystem(em, makeMission([
      makeObjective('obj1', { onCompleteAction: action }),
      makeObjective('obj2'),
    ]));

    const spawns: any[] = [];
    EventBus.on('chain-spawn-reinforcements', (data: any) => spawns.push(data));

    const status = getStatus(ms, 'obj1')!;
    (ms as any).completeObjective(status);

    expect(spawns).toHaveLength(1);
    expect(spawns[0]).toEqual({ tileX: 20, tileY: 20, count: 8 });

    ms.destroy();
    em.destroy();
  });

  it('executes modify_environment action on objective completion', () => {
    em = new EntityManager(mockValidator());
    const action: OnCompleteAction = {
      type: 'modify_environment',
      modifier: 'dense_fog',
      modifierAction: 'remove',
    };
    const ms = new MissionSystem(em, makeMission([
      makeObjective('obj1', { onCompleteAction: action }),
      makeObjective('obj2'),
    ]));

    const envChanges: any[] = [];
    EventBus.on('chain-modify-environment', (data: any) => envChanges.push(data));

    const status = getStatus(ms, 'obj1')!;
    (ms as any).completeObjective(status);

    expect(envChanges).toHaveLength(1);
    expect(envChanges[0]).toEqual({ modifier: 'dense_fog', action: 'remove' });

    ms.destroy();
    em.destroy();
  });

  it('executes grant_bonus action with gold and card draws', () => {
    em = new EntityManager(mockValidator());
    const action: OnCompleteAction = {
      type: 'grant_bonus',
      bonusGold: 25,
      bonusCardDraws: 2,
    };
    const ms = new MissionSystem(em, makeMission([
      makeObjective('obj1', { onCompleteAction: action }),
      makeObjective('obj2'),
    ]));

    const bonusEvents: any[] = [];
    EventBus.on('objective-completed', (data: any) => bonusEvents.push(data));

    const status = getStatus(ms, 'obj1')!;
    (ms as any).completeObjective(status);

    // Should have 2 objective-completed events: one for obj1 itself, one for the bonus
    expect(bonusEvents).toHaveLength(2);
    const bonus = bonusEvents.find((e: any) => e.objectiveId === '__bonus__');
    expect(bonus).toBeDefined();
    expect(bonus.goldReward).toBe(25);
    expect(bonus.cardDraws).toBe(2);

    ms.destroy();
    em.destroy();
  });

  it('executes reveal_objective action to inject a new objective', () => {
    em = new EntityManager(mockValidator());
    const hiddenObj = makeObjective('hidden_target', { tileX: 30, tileY: 30 });
    const action: OnCompleteAction = {
      type: 'reveal_objective',
      revealObjective: hiddenObj,
    };
    const ms = new MissionSystem(em, makeMission([
      makeObjective('obj1', { onCompleteAction: action }),
      makeObjective('obj2'),
    ]));

    const injected: any[] = [];
    EventBus.on('objective-injected', (data: any) => injected.push(data));

    const status = getStatus(ms, 'obj1')!;
    (ms as any).completeObjective(status);

    expect(injected).toHaveLength(1);
    expect(injected[0].objectiveId).toBe('hidden_target');

    // The new objective should be in objectiveStatuses (required)
    const newStatus = getStatus(ms, 'hidden_target');
    expect(newStatus).toBeDefined();
    expect(newStatus!.optional).toBe(false);

    ms.destroy();
    em.destroy();
  });
});

describe('Objective Chains — Dynamic Injection', () => {
  let em: EntityManager;

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  it('injects a required objective via inject-objective event', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([
      makeObjective('obj1'),
    ]));

    EventBus.emit('inject-objective', {
      objective: makeObjective('dynamic1', { tileX: 30, tileY: 30 }),
      optional: false,
    });

    expect(ms.objectiveStatuses).toHaveLength(2);
    const dynamic = getStatus(ms, 'dynamic1')!;
    expect(dynamic).toBeDefined();
    expect(dynamic.optional).toBe(false);
    expect(dynamic.locked).toBe(false);

    ms.destroy();
    em.destroy();
  });

  it('injects an optional objective via inject-objective event', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([
      makeObjective('obj1'),
    ]));

    EventBus.emit('inject-objective', {
      objective: makeObjective('bonus1'),
      optional: true,
    });

    expect(ms.optionalObjectiveStatuses).toHaveLength(1);
    const bonus = getStatus(ms, 'bonus1')!;
    expect(bonus.optional).toBe(true);

    ms.destroy();
    em.destroy();
  });

  it('invalidates allStatuses cache after injection', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([
      makeObjective('obj1'),
    ]));

    // Warm cache
    const before = (ms as any).getAllStatuses();
    expect(before).toHaveLength(1);

    EventBus.emit('inject-objective', {
      objective: makeObjective('dynamic1'),
    });

    const after = (ms as any).getAllStatuses();
    expect(after).toHaveLength(2);
    // Cache should be a new reference
    expect(after).not.toBe(before);

    ms.destroy();
    em.destroy();
  });

  it('injected required objectives block victory until completed', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([
      makeObjective('obj1'),
    ]));
    ms.state = 'ACTIVE';

    // Complete obj1
    const victoryEvents: any[] = [];
    EventBus.on('mission-complete', (data: any) => victoryEvents.push(data));

    // Inject a new required objective before completing obj1
    EventBus.emit('inject-objective', {
      objective: makeObjective('dynamic1'),
      optional: false,
    });

    // Complete obj1 — victory should NOT trigger because dynamic1 is pending
    const obj1Status = getStatus(ms, 'obj1')!;
    (ms as any).completeObjective(obj1Status);

    expect(victoryEvents).toHaveLength(0);
    expect(ms.state).toBe('ACTIVE');

    // Now complete dynamic1 — victory should trigger
    const dynamic1Status = getStatus(ms, 'dynamic1')!;
    (ms as any).completeObjective(dynamic1Status);

    expect(victoryEvents).toHaveLength(1);

    ms.destroy();
    em.destroy();
  });
});

describe('Objective Chains — Mission Update Emission', () => {
  let em: EntityManager;

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  it('includes locked and hidden fields in mission-update event', () => {
    em = new EntityManager(mockValidator());
    const ms = new MissionSystem(em, makeMission([
      makeObjective('phase1'),
      makeObjective('phase2', { prerequisiteId: 'phase1', hidden: true }),
    ]));
    ms.state = 'ACTIVE';
    vi.spyOn(em, 'getUnits').mockReturnValue([]);

    const updates: any[] = [];
    EventBus.on('mission-update', (data: any) => updates.push(data));

    ms.update(100);

    expect(updates).toHaveLength(1);
    const phase2Data = updates[0].objectives.find((o: any) => o.id === 'phase2');
    expect(phase2Data.locked).toBe(true);
    expect(phase2Data.hidden).toBe(true);

    ms.destroy();
    em.destroy();
  });
});

describe('Objective Chains — Chain Archetypes in ProceduralMissionGenerator', () => {
  it('generates intel_hunt with prerequisite chain', async () => {
    const { generateMission } = await import('../missions/ProceduralMissionGenerator');
    const mission = generateMission(2, 42, undefined, 'intel_hunt');

    expect(mission.objectives.length).toBeGreaterThanOrEqual(2);

    // First objective should not have a prerequisite
    expect(mission.objectives[0].prerequisiteId).toBeUndefined();

    // Second objective should have prerequisiteId pointing to first
    expect(mission.objectives[1].prerequisiteId).toBe(mission.objectives[0].id);
    expect(mission.objectives[1].hidden).toBe(true);
  });

  it('generates relay_cascade with prerequisite chain', async () => {
    const { generateMission } = await import('../missions/ProceduralMissionGenerator');
    const mission = generateMission(2, 42, undefined, 'relay_cascade');

    expect(mission.objectives.length).toBeGreaterThanOrEqual(2);

    // Both should be activate type
    expect(mission.objectives[0].type).toBe('activate');
    expect(mission.objectives[1].type).toBe('activate');

    // Second has prerequisite on first
    expect(mission.objectives[1].prerequisiteId).toBe(mission.objectives[0].id);

    // First has an on-complete action (reveal_fog)
    expect(mission.objectives[0].onCompleteAction).toBeDefined();
    expect(mission.objectives[0].onCompleteAction!.type).toBe('reveal_fog');
  });

  it('generates siege_and_breach with 3-phase chain', async () => {
    const { generateMission } = await import('../missions/ProceduralMissionGenerator');
    const mission = generateMission(3, 42, undefined, 'siege_and_breach');

    expect(mission.objectives.length).toBeGreaterThanOrEqual(3);

    // Phase 1: destroy, no prerequisite
    expect(mission.objectives[0].type).toBe('destroy');
    expect(mission.objectives[0].prerequisiteId).toBeUndefined();
    expect(mission.objectives[0].onCompleteAction?.type).toBe('spawn_reinforcements');

    // Phase 2: survive, prerequisite on phase 1
    expect(mission.objectives[1].type).toBe('survive');
    expect(mission.objectives[1].prerequisiteId).toBe(mission.objectives[0].id);

    // Phase 3: destroy, prerequisite on phase 2, hidden
    expect(mission.objectives[2].type).toBe('destroy');
    expect(mission.objectives[2].prerequisiteId).toBe(mission.objectives[1].id);
    expect(mission.objectives[2].hidden).toBe(true);
  });

  it('non-chain archetypes have no prerequisiteIds', async () => {
    const { generateMission } = await import('../missions/ProceduralMissionGenerator');
    const mission = generateMission(2, 42, undefined, 'purge_and_destroy');

    for (const obj of mission.objectives) {
      expect(obj.prerequisiteId).toBeUndefined();
      expect(obj.hidden).toBeUndefined();
    }
  });
});
