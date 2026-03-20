import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../EventBus';

vi.mock('../config', () => ({
  MAP_WIDTH: 10,
  MAP_HEIGHT: 10,
}));

import { ScoutRevealSystem } from '../systems/ScoutRevealSystem';
import { FogState } from '../systems/FogOfWarSystem';

function makeFogGrid(width: number, height: number, defaultState: FogState = FogState.HIDDEN): FogState[][] {
  const grid: FogState[][] = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      grid[y][x] = defaultState;
    }
  }
  return grid;
}

describe('ScoutRevealSystem', () => {
  let pingEvents: any[];
  let alertEvents: any[];

  beforeEach(() => {
    pingEvents = [];
    alertEvents = [];
    EventBus.on('minimap-ping', (data: any) => pingEvents.push(data));
    EventBus.on('scout-alert', (data: any) => alertEvents.push(data));
  });

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  it('emits alerts when an enemy camp becomes visible', () => {
    const system = new ScoutRevealSystem(
      [{ id: 'camp1', tileX: 3, tileY: 3, units: [], aggroRadius: 5 }],
      [], [], [],
    );

    const grid = makeFogGrid(10, 10);
    grid[3][3] = FogState.VISIBLE;
    EventBus.emit('fog-updated', grid);

    expect(pingEvents).toHaveLength(1);
    expect(pingEvents[0].tileX).toBe(3);
    expect(pingEvents[0].tileY).toBe(3);
    expect(pingEvents[0].color).toEqual([220, 60, 60]);

    expect(alertEvents).toHaveLength(1);
    expect(alertEvents[0].text).toBe('ENEMY CAMP DETECTED');
    expect(alertEvents[0].color).toBe('#c43030');

    system.destroy();
  });

  it('emits alerts when a gold mine becomes visible', () => {
    const system = new ScoutRevealSystem(
      [],
      [{ tileX: 5, tileY: 5 }],
      [], [],
    );

    const grid = makeFogGrid(10, 10);
    grid[5][5] = FogState.VISIBLE;
    EventBus.emit('fog-updated', grid);

    expect(alertEvents).toHaveLength(1);
    expect(alertEvents[0].text).toBe('GOLD DEPOSIT FOUND');
    expect(alertEvents[0].color).toBe('#c8982a');

    system.destroy();
  });

  it('emits alerts when a POI becomes visible', () => {
    const system = new ScoutRevealSystem(
      [], [],
      [{ id: 'poi1', type: 'gold_cache', tileX: 7, tileY: 2, reward: { gold: 10 } }],
      [],
    );

    const grid = makeFogGrid(10, 10);
    grid[2][7] = FogState.VISIBLE;
    EventBus.emit('fog-updated', grid);

    expect(alertEvents).toHaveLength(1);
    expect(alertEvents[0].text).toBe('POINT OF INTEREST LOCATED');
    expect(alertEvents[0].color).toBe('#5599ff');

    system.destroy();
  });

  it('emits alerts when a pack becomes visible', () => {
    const system = new ScoutRevealSystem(
      [], [], [],
      [{ tileX: 1, tileY: 1 }],
    );

    const grid = makeFogGrid(10, 10);
    grid[1][1] = FogState.VISIBLE;
    EventBus.emit('fog-updated', grid);

    expect(alertEvents).toHaveLength(1);
    expect(alertEvents[0].text).toBe('SUPPLY CACHE LOCATED');
    expect(alertEvents[0].color).toBe('#50b0b0');

    system.destroy();
  });

  it('does not emit duplicate alerts for the same position', () => {
    const system = new ScoutRevealSystem(
      [{ id: 'camp1', tileX: 3, tileY: 3, units: [], aggroRadius: 5 }],
      [], [], [],
    );

    const grid = makeFogGrid(10, 10);
    grid[3][3] = FogState.VISIBLE;
    EventBus.emit('fog-updated', grid);
    EventBus.emit('fog-updated', grid);

    expect(pingEvents).toHaveLength(1);
    expect(alertEvents).toHaveLength(1);

    system.destroy();
  });

  it('does not emit alerts for EXPLORED (only VISIBLE)', () => {
    const system = new ScoutRevealSystem(
      [{ id: 'camp1', tileX: 3, tileY: 3, units: [], aggroRadius: 5 }],
      [], [], [],
    );

    const grid = makeFogGrid(10, 10);
    grid[3][3] = FogState.EXPLORED;
    EventBus.emit('fog-updated', grid);

    expect(pingEvents).toHaveLength(0);
    expect(alertEvents).toHaveLength(0);

    system.destroy();
  });

  it('does not emit alerts for HIDDEN tiles', () => {
    const system = new ScoutRevealSystem(
      [{ id: 'camp1', tileX: 3, tileY: 3, units: [], aggroRadius: 5 }],
      [], [], [],
    );

    const grid = makeFogGrid(10, 10);
    // grid[3][3] stays HIDDEN
    EventBus.emit('fog-updated', grid);

    expect(pingEvents).toHaveLength(0);
    expect(alertEvents).toHaveLength(0);

    system.destroy();
  });

  it('handles multiple features revealed in one fog update', () => {
    const system = new ScoutRevealSystem(
      [{ id: 'camp1', tileX: 2, tileY: 2, units: [], aggroRadius: 5 }],
      [{ tileX: 7, tileY: 7 }],
      [], [],
    );

    const grid = makeFogGrid(10, 10);
    grid[2][2] = FogState.VISIBLE;
    grid[7][7] = FogState.VISIBLE;
    EventBus.emit('fog-updated', grid);

    expect(pingEvents).toHaveLength(2);
    expect(alertEvents).toHaveLength(2);

    system.destroy();
  });

  it('ignores out-of-bounds feature positions', () => {
    const system = new ScoutRevealSystem(
      [{ id: 'camp1', tileX: -1, tileY: 3, units: [], aggroRadius: 5 }],
      [{ tileX: 15, tileY: 15 }],
      [], [],
    );

    const grid = makeFogGrid(10, 10, FogState.VISIBLE);
    EventBus.emit('fog-updated', grid);

    expect(pingEvents).toHaveLength(0);
    expect(alertEvents).toHaveLength(0);

    system.destroy();
  });

  it('cleans up event listeners on destroy', () => {
    const system = new ScoutRevealSystem(
      [{ id: 'camp1', tileX: 3, tileY: 3, units: [], aggroRadius: 5 }],
      [], [], [],
    );

    system.destroy();

    const grid = makeFogGrid(10, 10);
    grid[3][3] = FogState.VISIBLE;
    EventBus.emit('fog-updated', grid);

    expect(pingEvents).toHaveLength(0);
    expect(alertEvents).toHaveLength(0);
  });
});
