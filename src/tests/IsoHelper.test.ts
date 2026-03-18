import { describe, it, expect } from 'vitest';
import { IsoHelper } from '../map/IsoHelper';
import { TILE_WIDTH, TILE_HEIGHT, MAP_WIDTH, MAP_HEIGHT } from '../config';

describe('IsoHelper', () => {
  describe('tileToScreen', () => {
    it('converts origin tile to screen origin', () => {
      const { x, y } = IsoHelper.tileToScreen(0, 0);
      expect(x).toBe(0);
      expect(y).toBe(0);
    });

    it('moves right-down for increasing tileX', () => {
      const { x, y } = IsoHelper.tileToScreen(1, 0);
      expect(x).toBe(TILE_WIDTH / 2);
      expect(y).toBe(TILE_HEIGHT / 2);
    });

    it('moves left-down for increasing tileY', () => {
      const { x, y } = IsoHelper.tileToScreen(0, 1);
      expect(x).toBe(-TILE_WIDTH / 2);
      expect(y).toBe(TILE_HEIGHT / 2);
    });

    it('diagonal tiles have zero x offset', () => {
      const { x } = IsoHelper.tileToScreen(5, 5);
      expect(x).toBe(0);
    });
  });

  describe('screenToTile', () => {
    it('round-trips origin', () => {
      const screen = IsoHelper.tileToScreen(0, 0);
      const tile = IsoHelper.screenToTile(screen.x, screen.y);
      expect(tile.tileX).toBe(0);
      expect(tile.tileY).toBe(0);
    });

    it('round-trips tile center for (3, 7)', () => {
      // tileToScreen gives the top-left corner; screenToTile floors, so shift to center
      const screen = IsoHelper.tileToScreen(3, 7);
      const centerX = screen.x + 1; // nudge into tile interior
      const centerY = screen.y + 1;
      const tile = IsoHelper.screenToTile(centerX, centerY);
      expect(tile.tileX).toBe(3);
      expect(tile.tileY).toBe(7);
    });
  });

  describe('isInBounds', () => {
    it('origin is in bounds', () => {
      expect(IsoHelper.isInBounds(0, 0)).toBe(true);
    });

    it('max corner is in bounds', () => {
      expect(IsoHelper.isInBounds(MAP_WIDTH - 1, MAP_HEIGHT - 1)).toBe(true);
    });

    it('negative coords are out of bounds', () => {
      expect(IsoHelper.isInBounds(-1, 0)).toBe(false);
      expect(IsoHelper.isInBounds(0, -1)).toBe(false);
    });

    it('coords at map edge are out of bounds', () => {
      expect(IsoHelper.isInBounds(MAP_WIDTH, 0)).toBe(false);
      expect(IsoHelper.isInBounds(0, MAP_HEIGHT)).toBe(false);
    });
  });

  describe('tileDistance', () => {
    it('same tile is distance 0', () => {
      expect(IsoHelper.tileDistance(5, 5, 5, 5)).toBe(0);
    });

    it('computes manhattan distance', () => {
      expect(IsoHelper.tileDistance(0, 0, 3, 4)).toBe(7);
    });

    it('is symmetric', () => {
      expect(IsoHelper.tileDistance(1, 2, 5, 8)).toBe(IsoHelper.tileDistance(5, 8, 1, 2));
    });
  });

  describe('getDepth / getTileDepth', () => {
    it('tile depth increases with sum of coords', () => {
      expect(IsoHelper.getTileDepth(1, 0)).toBeLessThan(IsoHelper.getTileDepth(1, 1));
    });

    it('entity depth is always above tile depth for same coords', () => {
      const tileDepth = IsoHelper.getTileDepth(5, 5);
      const entityDepth = IsoHelper.getDepth(5, 5);
      expect(entityDepth).toBeGreaterThan(tileDepth);
    });

    it('offset shifts entity depth', () => {
      expect(IsoHelper.getDepth(5, 5, 3)).toBe(IsoHelper.getDepth(5, 5) + 3);
    });
  });
});
