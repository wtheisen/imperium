import { MAP_WIDTH, MAP_HEIGHT } from '../config';
import { EntityManager } from './EntityManager';
import { Entity } from '../entities/Entity';
import { Building } from '../entities/Building';
import { EventBus } from '../EventBus';

/** Visibility state per tile */
export enum FogState {
  /** Never seen — fully black */
  HIDDEN = 0,
  /** Previously explored but not currently visible — dark shroud */
  EXPLORED = 1,
  /** Currently visible by a friendly unit/building */
  VISIBLE = 2,
}

/** Default sight radius by entity type */
const SIGHT_RADIUS_UNIT = 6;
const SIGHT_RADIUS_BUILDING = 4;
const SIGHT_RADIUS_TOWNHALL = 8;

export class FogOfWarSystem {
  private entityManager: EntityManager;

  /** Per-tile fog state grid */
  private fogGrid: FogState[][];
  /** Previous frame's fog state for dirty detection */
  private prevFogGrid: FogState[][];

  /** How often to do a full visibility recalc (ms) */
  private updateInterval: number = 250;
  private updateTimer: number = 0;

  /** Track which enemy entities are hidden */
  private hiddenEnemies: Set<string> = new Set();

  constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;

    // Initialize fog grids
    this.fogGrid = [];
    this.prevFogGrid = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      this.fogGrid[y] = [];
      this.prevFogGrid[y] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        this.fogGrid[y][x] = FogState.HIDDEN;
        this.prevFogGrid[y][x] = FogState.HIDDEN;
      }
    }

    EventBus.on('fog-reveal', this.onFogReveal, this);
  }

  private onFogReveal = (data: { tileX: number; tileY: number; radius: number }): void => {
    this.revealAround(data.tileX, data.tileY, data.radius);
    EventBus.emit('fog-updated', this.fogGrid);
  };

  private getSightRadius(entity: Entity): number {
    if (entity instanceof Building) {
      if (entity.buildingType === 'tarantula') return 7;
      return entity.buildingType === 'drop_ship' ? SIGHT_RADIUS_TOWNHALL : SIGHT_RADIUS_BUILDING;
    }
    return SIGHT_RADIUS_UNIT;
  }

  private recalcVisibility(): void {
    // Save current state as previous
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        this.prevFogGrid[y][x] = this.fogGrid[y][x];
      }
    }

    // Demote VISIBLE → EXPLORED
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.fogGrid[y][x] === FogState.VISIBLE) {
          this.fogGrid[y][x] = FogState.EXPLORED;
        }
      }
    }

    // Reveal around player entities
    const playerEntities = this.entityManager.getEntitiesByTeam('player');
    for (const entity of playerEntities) {
      if (!entity.active) continue;
      const sight = this.getSightRadius(entity);
      this.revealAround(entity.tileX, entity.tileY, sight);
    }

    // Check if any tile changed
    let dirty = false;
    for (let y = 0; y < MAP_HEIGHT && !dirty; y++) {
      for (let x = 0; x < MAP_WIDTH && !dirty; x++) {
        if (this.fogGrid[y][x] !== this.prevFogGrid[y][x]) {
          dirty = true;
        }
      }
    }

    if (dirty) {
      // Emit fog grid for 3D FogRenderer
      EventBus.emit('fog-updated', this.fogGrid);

      // Hide/show enemy entities
      this.updateEnemyVisibility();
    }
  }

  private revealAround(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
          this.fogGrid[ty][tx] = FogState.VISIBLE;
        }
      }
    }
  }

  private updateEnemyVisibility(): void {
    const enemies = [
      ...this.entityManager.getUnits('enemy'),
      ...this.entityManager.getBuildings('enemy'),
    ];

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const tx = enemy.tileX;
      const ty = enemy.tileY;
      const tileVisible = tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT
        && this.fogGrid[ty][tx] === FogState.VISIBLE;

      if (tileVisible) {
        if (this.hiddenEnemies.has(enemy.entityId)) {
          enemy.visible = true;
          this.hiddenEnemies.delete(enemy.entityId);
        }
      } else {
        if (!this.hiddenEnemies.has(enemy.entityId)) {
          enemy.visible = false;
          this.hiddenEnemies.add(enemy.entityId);
        }
      }
    }
  }

  isVisible(tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) return false;
    return this.fogGrid[tileY][tileX] === FogState.VISIBLE;
  }

  isExplored(tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) return false;
    return this.fogGrid[tileY][tileX] !== FogState.HIDDEN;
  }

  update(delta: number): void {
    this.updateTimer += delta;
    if (this.updateTimer < this.updateInterval) return;
    this.updateTimer = 0;

    this.recalcVisibility();
  }

  destroy(): void {
    EventBus.off('fog-reveal', this.onFogReveal, this);
    this.fogGrid = [];
    this.prevFogGrid = [];
    this.hiddenEnemies.clear();
  }
}
