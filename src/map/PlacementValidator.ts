import { MapManager, TerrainType } from './MapManager';
import { IsoHelper } from './IsoHelper';

export class PlacementValidator {
  private mapManager: MapManager;
  private occupiedTiles: Set<string> = new Set();

  constructor(mapManager: MapManager) {
    this.mapManager = mapManager;
  }

  private tileKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  occupyTile(x: number, y: number): void {
    this.occupiedTiles.add(this.tileKey(x, y));
  }

  occupyTiles(x: number, y: number, width: number, height: number): void {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        this.occupyTile(x + dx, y + dy);
      }
    }
  }

  freeTile(x: number, y: number): void {
    this.occupiedTiles.delete(this.tileKey(x, y));
  }

  freeTiles(x: number, y: number, width: number, height: number): void {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        this.freeTile(x + dx, y + dy);
      }
    }
  }

  canPlace(tileX: number, tileY: number, width: number = 1, height: number = 1): boolean {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const tx = tileX + dx;
        const ty = tileY + dy;
        if (!IsoHelper.isInBounds(tx, ty)) return false;
        if (!this.mapManager.isWalkable(tx, ty)) return false;
        if (this.occupiedTiles.has(this.tileKey(tx, ty))) return false;
      }
    }
    return true;
  }

  isTileOccupied(x: number, y: number): boolean {
    return this.occupiedTiles.has(this.tileKey(x, y));
  }
}
