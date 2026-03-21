import { MapManager, TerrainType } from '../map/MapManager';
import { EntityManager } from './EntityManager';
import { MoverComponent } from '../components/MoverComponent';
import { HealthComponent } from '../components/HealthComponent';
import {
  TERRAIN_LAVA_DAMAGE, TERRAIN_LAVA_TICK_MS,
  TERRAIN_ICE_SPEED_MULT, TERRAIN_RUBBLE_DAMAGE_REDUCTION,
} from '../config';

/**
 * Applies tile-level gameplay effects based on the terrain type
 * a unit is standing on:
 * - ICE: 40% movement speed reduction
 * - RUBBLE: 25% incoming damage reduction
 * - LAVA: 3 damage every 1 second (DOT)
 */
export class TerrainEffectSystem {
  private mapManager: MapManager;
  private entityManager: EntityManager;
  /** Tracks accumulated lava tick time per entity */
  private lavaTicks = new Map<string, number>();

  constructor(mapManager: MapManager, entityManager: EntityManager) {
    this.mapManager = mapManager;
    this.entityManager = entityManager;
  }

  update(delta: number): void {
    const entities = this.entityManager.getAllEntities();

    for (const entity of entities) {
      if (!entity.active) continue;

      const mover = entity.getComponent<MoverComponent>('mover');
      const health = entity.getComponent<HealthComponent>('health');

      // Reset per-tick modifiers
      if (mover) mover.speedMultiplier = 1.0;
      if (health) health.terrainDamageReduction = 0;

      const terrain = this.mapManager.getTerrain(entity.tileX, entity.tileY);

      switch (terrain) {
        case TerrainType.ICE:
          if (mover) {
            mover.speedMultiplier = TERRAIN_ICE_SPEED_MULT;
          }
          break;

        case TerrainType.RUBBLE:
          if (health) {
            health.terrainDamageReduction = TERRAIN_RUBBLE_DAMAGE_REDUCTION;
          }
          break;
      }

      // Lava DOT for units adjacent to lava (since lava is unwalkable,
      // damage units standing next to lava tiles)
      if (health && this.isAdjacentToLava(entity.tileX, entity.tileY)) {
        let accumulated = this.lavaTicks.get(entity.entityId) ?? 0;
        accumulated += delta;
        if (accumulated >= TERRAIN_LAVA_TICK_MS) {
          accumulated -= TERRAIN_LAVA_TICK_MS;
          health.takeDamage(TERRAIN_LAVA_DAMAGE);
        }
        this.lavaTicks.set(entity.entityId, accumulated);
      } else {
        this.lavaTicks.delete(entity.entityId);
      }
    }
  }

  private isAdjacentToLava(x: number, y: number): boolean {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (this.mapManager.getTerrain(x + dx, y + dy) === TerrainType.LAVA) {
        return true;
      }
    }
    return false;
  }

  destroy(): void {
    this.lavaTicks.clear();
  }
}
