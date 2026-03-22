import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Unit } from '../entities/Unit';
import { MoverComponent } from '../components/MoverComponent';
import { CombatComponent } from '../components/CombatComponent';
import { PathfindingSystem } from '../systems/PathfindingSystem';
import { EnemyAI } from '../ai/EnemyAI';
import { EventBus } from '../EventBus';

const makeUnit = (tileX = 0, tileY = 0, team: 'player' | 'enemy' = 'player') =>
  new Unit(tileX, tileY, 'space-marine', {
    maxHp: 100,
    speed: 2,
    attackDamage: 10,
    attackRange: 1,
    attackCooldown: 1000,
    isRanged: false,
  }, team);

const addMover = (unit: Unit) => {
  const mover = new MoverComponent(unit, 2);
  unit.addComponent('mover', mover);
  return mover;
};

const addCombat = (unit: Unit) => {
  const combat = new CombatComponent(unit, 10, 1, 1000, false);
  unit.addComponent('combat', combat);
  return combat;
};

/** Build a mock PathfindingSystem whose findPath returns a controllable promise. */
function makeControllablePF() {
  let resolve!: (v: { x: number; y: number }[] | null) => void;
  const promise = new Promise<{ x: number; y: number }[] | null>((r) => { resolve = r; });
  const pf = {
    findPath: vi.fn(() => promise),
  } as unknown as PathfindingSystem;
  return { pf, resolve };
}

// ---------------------------------------------------------------------------
// CommandSystem — moveUnitToward
// The CommandSystem constructor calls document.addEventListener, so we stub
// document on globalThis before importing.
// ---------------------------------------------------------------------------
describe('CommandSystem.moveUnitToward – dead-entity guard', () => {
  beforeEach(() => {
    // Minimal document stub for CommandSystem constructor
    (globalThis as any).document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    delete (globalThis as any).document;
    EventBus.removeAllListeners();
  });

  it('calls setPath when unit is still active after await', async () => {
    const { pf, resolve } = makeControllablePF();

    const { CommandSystem } = await import('../systems/CommandSystem');
    const selection = { getSelected: () => [] } as any;
    const entityManager = { getAllEntities: () => [], getUnits: () => [] } as any;
    const mapManager = { getTile: () => ({ walkable: true }) } as any;

    const cs = new CommandSystem(selection, pf, entityManager, mapManager);

    const unit = makeUnit();
    const mover = addMover(unit);
    const setPathSpy = vi.spyOn(mover, 'setPath');

    const movePromise = (cs as any).moveUnitToward(unit, 3, 3);
    resolve([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 3, y: 3 }]);
    await movePromise;

    expect(setPathSpy).toHaveBeenCalledOnce();
  });

  it('skips setPath when unit dies while pathfinding is in flight', async () => {
    const { pf, resolve } = makeControllablePF();

    const { CommandSystem } = await import('../systems/CommandSystem');
    const selection = { getSelected: () => [] } as any;
    const entityManager = { getAllEntities: () => [], getUnits: () => [] } as any;
    const mapManager = { getTile: () => ({ walkable: true }) } as any;

    const cs = new CommandSystem(selection, pf, entityManager, mapManager);

    const unit = makeUnit();
    const mover = addMover(unit);
    const setPathSpy = vi.spyOn(mover, 'setPath');

    const movePromise = (cs as any).moveUnitToward(unit, 3, 3);
    unit.active = false;
    resolve([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 3, y: 3 }]);
    await movePromise;

    expect(setPathSpy).not.toHaveBeenCalled();
  });

  it('skips setPath when unit dies and path resolves null', async () => {
    const { pf, resolve } = makeControllablePF();

    const { CommandSystem } = await import('../systems/CommandSystem');
    const selection = { getSelected: () => [] } as any;
    const entityManager = { getAllEntities: () => [], getUnits: () => [] } as any;
    const mapManager = { getTile: () => ({ walkable: true }) } as any;

    const cs = new CommandSystem(selection, pf, entityManager, mapManager);

    const unit = makeUnit();
    const mover = addMover(unit);
    const setPathSpy = vi.spyOn(mover, 'setPath');

    const movePromise = (cs as any).moveUnitToward(unit, 3, 3);
    unit.active = false;
    resolve(null);
    await movePromise;

    expect(setPathSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// EnemyAI — async pathfinding calls
// ---------------------------------------------------------------------------
describe('EnemyAI – dead-entity guard after async pathfinding', () => {
  let pf: PathfindingSystem;
  let resolveAll: Array<() => void>;

  beforeEach(() => {
    resolveAll = [];
    pf = {
      findPath: vi.fn(() => {
        let res!: () => void;
        const p = new Promise<{ x: number; y: number }[]>((r) => {
          res = () => r([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
        });
        resolveAll.push(res);
        return p;
      }),
    } as unknown as PathfindingSystem;
  });

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  const makeEnemyAI = () => {
    const entityManager = {
      getUnits: vi.fn().mockReturnValue([]),
      getEntitiesByTeam: vi.fn().mockReturnValue([]),
    } as any;
    return { ai: new EnemyAI(entityManager, pf), entityManager };
  };

  it('sets path on aggro when enemy survives the await', async () => {
    const { ai } = makeEnemyAI();

    const enemy = makeUnit(0, 0, 'enemy');
    enemy.homeX = 0;
    enemy.homeY = 0;
    enemy.aggroRadius = 10;
    const mover = addMover(enemy);
    const combat = addCombat(enemy);
    const setPathSpy = vi.spyOn(mover, 'setPath');

    // Give it a player target in range that is not in attack range
    const playerUnit = makeUnit(3, 3, 'player');
    vi.spyOn(ai as any, 'findNearestPlayerEntity').mockReturnValue(playerUnit);

    const updatePromise = (ai as any).updateUnit(enemy);
    // Resolve all pending pathfinding promises
    resolveAll.forEach(r => r());
    await updatePromise;

    expect(setPathSpy).toHaveBeenCalledOnce();
  });

  it('skips setPath on aggro when enemy dies during pathfinding await', async () => {
    const { ai } = makeEnemyAI();

    const enemy = makeUnit(0, 0, 'enemy');
    enemy.homeX = 0;
    enemy.homeY = 0;
    enemy.aggroRadius = 10;
    const mover = addMover(enemy);
    addCombat(enemy);
    const setPathSpy = vi.spyOn(mover, 'setPath');

    const playerUnit = makeUnit(3, 3, 'player');
    vi.spyOn(ai as any, 'findNearestPlayerEntity').mockReturnValue(playerUnit);

    const updatePromise = (ai as any).updateUnit(enemy);

    // Enemy dies while pathfinding is pending
    enemy.active = false;
    resolveAll.forEach(r => r());
    await updatePromise;

    expect(setPathSpy).not.toHaveBeenCalled();
  });

  it('skips setPath on home-return when enemy dies during pathfinding await', async () => {
    const { ai } = makeEnemyAI();

    const enemy = makeUnit(5, 5, 'enemy');
    enemy.homeX = 0;
    enemy.homeY = 0;
    enemy.aggroRadius = 6;
    const mover = addMover(enemy);
    addCombat(enemy);
    const setPathSpy = vi.spyOn(mover, 'setPath');

    // No player target → home-return branch
    vi.spyOn(ai as any, 'findNearestPlayerEntity').mockReturnValue(null);

    const updatePromise = (ai as any).updateUnit(enemy);
    enemy.active = false;
    resolveAll.forEach(r => r());
    await updatePromise;

    expect(setPathSpy).not.toHaveBeenCalled();
  });

  it('skips setPath on patrol when enemy dies during pathfinding await', async () => {
    const { ai } = makeEnemyAI();

    // Place enemy at home so home-return branch is skipped, falling through to patrol
    const enemy = makeUnit(0, 0, 'enemy');
    enemy.homeX = 0;
    enemy.homeY = 0;
    enemy.aggroRadius = 6;
    enemy.patrolPath = [{ x: 3, y: 3 }];
    const mover = addMover(enemy);
    addCombat(enemy);
    const setPathSpy = vi.spyOn(mover, 'setPath');

    vi.spyOn(ai as any, 'findNearestPlayerEntity').mockReturnValue(null);

    const updatePromise = (ai as any).updateUnit(enemy);
    enemy.active = false;
    resolveAll.forEach(r => r());
    await updatePromise;

    expect(setPathSpy).not.toHaveBeenCalled();
  });
});
