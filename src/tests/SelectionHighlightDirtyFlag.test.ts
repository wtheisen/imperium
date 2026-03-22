import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub document before importing SelectionSystem (constructor uses it)
vi.stubGlobal('document', {
  createElement: vi.fn(() => ({ style: {} as Record<string, string>, remove: vi.fn() })),
  getElementById: vi.fn(() => null),
  body: { appendChild: vi.fn() },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

import { SelectionSystem } from '../systems/SelectionSystem';
import { EventBus } from '../EventBus';
import { Unit, UnitStats } from '../entities/Unit';

const baseStats: UnitStats = {
  maxHp: 10,
  speed: 1,
  attackDamage: 5,
  attackRange: 1,
  attackCooldown: 1000,
  isRanged: false,
};

function makeUnit(active = true): Unit {
  const u = new Unit(0, 0, 'marine', baseStats, 'player');
  u.active = active;
  return u;
}

function makeEntityManager(units: Unit[] = []) {
  return {
    getUnits: vi.fn(() => units),
    getBuildings: vi.fn(() => []),
    getAllEntities: vi.fn(() => units),
  } as any;
}

describe('SelectionSystem selection-highlight dirty flag', () => {
  let system: SelectionSystem;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    EventBus.removeAllListeners();
    emitSpy = vi.spyOn(EventBus, 'emit');
    system = new SelectionSystem(makeEntityManager());
  });

  afterEach(() => {
    system.destroy();
    vi.restoreAllMocks();
    EventBus.removeAllListeners();
  });

  function highlightEmissions(): string[][] {
    return emitSpy.mock.calls
      .filter(([event]) => event === 'selection-highlight')
      .map(([, ids]) => ids as string[]);
  }

  it('does not emit selection-highlight on first update() when nothing is selected', () => {
    system.update(16);
    expect(highlightEmissions().length).toBe(0);
  });

  it('emits once after clearSelection() then stops on subsequent updates', () => {
    (system as any).clearSelection();
    system.update(16);
    expect(highlightEmissions().length).toBe(1);
    expect(highlightEmissions()[0]).toEqual([]);

    // Second update — dirty cleared, should not emit again
    system.update(16);
    expect(highlightEmissions().length).toBe(1);
  });

  it('emits selected unit ids after manual selection change', () => {
    const unit = makeUnit();
    system.selectedUnits = [unit];
    (system as any).selectionDirty = true;

    system.update(16);
    const emissions = highlightEmissions();
    expect(emissions.length).toBe(1);
    expect(emissions[0]).toContain(unit.entityId);
  });

  it('emits ids for both units and building when both are selected', () => {
    const unit = makeUnit();
    const building = { entityId: 'b1', active: true } as any;
    system.selectedUnits = [unit];
    (system as any).selectedBuilding = building;
    (system as any).selectionDirty = true;

    system.update(16);
    const emissions = highlightEmissions();
    expect(emissions.length).toBe(1);
    expect(emissions[0]).toContain(unit.entityId);
    expect(emissions[0]).toContain('b1');
  });

  it('does not emit on consecutive updates when selection is unchanged', () => {
    const unit = makeUnit();
    system.selectedUnits = [unit];
    (system as any).selectionDirty = true;

    system.update(16); // first — emits
    const afterFirst = highlightEmissions().length;

    system.update(16); // second — unchanged, should not emit
    system.update(16); // third — unchanged, should not emit
    expect(highlightEmissions().length).toBe(afterFirst);
  });

  it('filters dead units and emits when a selected unit becomes inactive', () => {
    const unit = makeUnit(true);
    system.selectedUnits = [unit];
    (system as any).selectionDirty = true;
    system.update(16); // drain the dirty flag
    const beforeCount = highlightEmissions().length;

    unit.active = false;
    system.update(16); // should detect dead unit, filter, and emit

    const emissions = highlightEmissions();
    expect(emissions.length).toBe(beforeCount + 1);
    expect(emissions[emissions.length - 1]).toEqual([]);
    expect(system.selectedUnits).toHaveLength(0);
  });

  it('does not re-emit once a dead unit has been filtered out', () => {
    const unit = makeUnit(true);
    system.selectedUnits = [unit];
    (system as any).selectionDirty = true;
    system.update(16);

    unit.active = false;
    system.update(16); // filters and emits
    const afterFilter = highlightEmissions().length;

    system.update(16); // nothing changed — should not emit
    system.update(16);
    expect(highlightEmissions().length).toBe(afterFilter);
  });

  it('emits empty ids after clearSelection removes all selections', () => {
    const unit = makeUnit();
    system.selectedUnits = [unit];
    (system as any).selectionDirty = true;
    system.update(16); // drain

    (system as any).clearSelection();
    system.update(16);

    const last = highlightEmissions().at(-1)!;
    expect(last).toEqual([]);
  });
});
