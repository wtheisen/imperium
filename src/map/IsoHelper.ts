import { TILE_WIDTH, TILE_HEIGHT, MAP_WIDTH, MAP_HEIGHT } from '../config';

export class IsoHelper {
  static tileToScreen(tileX: number, tileY: number): { x: number; y: number } {
    return {
      x: (tileX - tileY) * (TILE_WIDTH / 2),
      y: (tileX + tileY) * (TILE_HEIGHT / 2),
    };
  }

  static screenToTile(screenX: number, screenY: number): { tileX: number; tileY: number } {
    const tileX = Math.floor(screenY / TILE_HEIGHT + screenX / TILE_WIDTH);
    const tileY = Math.floor(screenY / TILE_HEIGHT - screenX / TILE_WIDTH);
    return { tileX, tileY };
  }

  static isInBounds(tileX: number, tileY: number): boolean {
    return tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT;
  }

  static tileDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  /**
   * Depth for ground tiles only (offset 0).
   * Range: 0 .. ~780 for a 40×40 map.
   */
  static getTileDepth(tileX: number, tileY: number): number {
    return (tileY + tileX) * 10;
  }

  /**
   * Depth for entities (buildings, units, projectiles, effects).
   * Offset into a range that starts above ALL tile depths so entities
   * never clip below tiles in adjacent iso rows.
   * Base = 1000, giving range 1000 .. ~1784.
   */
  static getDepth(tileX: number, tileY: number, offset: number = 0): number {
    return 1000 + (tileY + tileX) * 10 + offset;
  }
}
