import { describe, it, expect, beforeEach } from 'vitest';
import { PathfindingSystem } from '../systems/PathfindingSystem';

describe('PathfindingSystem', () => {
  let pf: PathfindingSystem;

  beforeEach(() => {
    pf = new PathfindingSystem();
  });

  it('finds a path on an open grid', async () => {
    const path = await pf.findPath(0, 0, 2, 2);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    const last = path![path!.length - 1];
    expect(last).toEqual({ x: 2, y: 2 });
  });

  it('setTileWalkable blocks a tile and path avoids it', async () => {
    // Block a column of tiles at x=1 from y=0 to y=3, forcing a path around
    pf.setTileWalkable(1, 0, false);
    pf.setTileWalkable(1, 1, false);
    pf.setTileWalkable(1, 2, false);
    pf.setTileWalkable(1, 3, false);

    const path = await pf.findPath(0, 0, 3, 0);
    expect(path).not.toBeNull();
    // Path must not pass through any blocked tile (x=1, y=0..3)
    const blocked = new Set(['1,0', '1,1', '1,2', '1,3']);
    for (const step of path!) {
      expect(blocked.has(`${step.x},${step.y}`)).toBe(false);
    }
  });

  it('returns null when destination is completely blocked', async () => {
    // Surround tile (2,2) completely
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx !== 0 || dy !== 0) {
          pf.setTileWalkable(2 + dx, 2 + dy, false);
        }
      }
    }
    pf.setTileWalkable(2, 2, false);
    const path = await pf.findPath(0, 0, 2, 2);
    expect(path).toBeNull();
  });

  it('unblocking a tile restores path through it', async () => {
    pf.setTileWalkable(1, 0, false);
    pf.setTileWalkable(1, 1, false);
    pf.setTileWalkable(1, 2, false);
    pf.setTileWalkable(1, 3, false);

    // Re-open one tile
    pf.setTileWalkable(1, 2, true);

    const path = await pf.findPath(0, 0, 3, 0);
    expect(path).not.toBeNull();
  });
});
