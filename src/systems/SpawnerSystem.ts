import { EventBus } from '../EventBus';
import { EntityManager } from './EntityManager';
import { EnemyCampDefinition } from '../missions/MissionDefinition';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';
import { getActiveModifiers } from '../state/PlayerState';
import { getCachedMergedEffects } from '../state/DifficultyModifiers';
import {
  ROAM_PATROL_INTERVAL,
  ROAM_PATROL_SIZE,
  REINFORCEMENT_DELAY,
  REINFORCEMENT_SIZE_BASE,
  PRESSURE_ESCALATION_INTERVAL,
  PRESSURE_MAX,
  EXTRACTION_WAVE_INTERVAL_MS,
  EXTRACTION_WAVE_SIZE_BASE,
} from '../config';
import { ENEMY_GRUNT, ENEMY_ARCHER } from '../ai/EnemyStats';

interface SpawnerConfig {
  campId: string;
  tileX: number;
  tileY: number;
  spawnInterval: number;      // ms between spawn cycles
  spawnGroup: { type: string; texture: string; stats: any; count: number }[];
  maxActiveUnits: number;
  patrolRadius: number;
  buildingEntityId: string;   // linked building
}

interface ActiveSpawner {
  config: SpawnerConfig;
  timer: number;
  activeUnits: Set<string>;   // entity IDs of living units from this spawner
  disabled: boolean;
}

export class SpawnerSystem {
  private entityManager: EntityManager;
  private spawners: ActiveSpawner[] = [];
  private pressureMultiplier: number = 1.0;
  private pressureTimer: number = 0;
  private roamTimer: number = 0;
  private totalElapsed: number = 0;
  private destroyed: boolean = false;
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
  private extracting: boolean = false;
  private extractionTarget: { x: number; y: number } = { x: 0, y: 0 };
  private extractionWaveTimer: number = 0;

  constructor(entityManager: EntityManager, camps: EnemyCampDefinition[]) {
    this.entityManager = entityManager;

    // Create spawners for camps that have buildings and spawner config
    for (const camp of camps) {
      if (!camp.building || !camp.spawner) continue;

      // Find the building entity
      const buildings = entityManager.getBuildings('enemy');
      const bld = buildings.find(b => (b as any).campId === camp.id);
      if (!bld) continue;

      this.spawners.push({
        config: {
          campId: camp.id,
          tileX: camp.tileX,
          tileY: camp.tileY,
          spawnInterval: camp.spawner.spawnInterval,
          spawnGroup: camp.spawner.spawnGroup,
          maxActiveUnits: camp.spawner.maxActiveUnits,
          patrolRadius: camp.spawner.patrolRadius || 8,
          buildingEntityId: bld.entityId,
        },
        timer: camp.spawner.spawnInterval * 0.5, // Start with half timer so first spawn is delayed
        activeUnits: new Set(),
        disabled: false,
      });
    }

    EventBus.on('entity-died', this.onEntityDied, this);
    EventBus.on('objective-completed', this.onObjectiveCompleted, this);
    EventBus.on('extraction-started', this.onExtractionStarted, this);
    EventBus.on('survive-wave-spawn', this.onSurviveWaveSpawn, this);
    EventBus.on('extraction-wave-spawn', this.onExtractionWaveSpawn, this);
  }

  update(delta: number): void {
    this.totalElapsed += delta;

    // Pressure escalation
    this.pressureTimer += delta;
    if (this.pressureTimer >= PRESSURE_ESCALATION_INTERVAL) {
      this.pressureTimer = 0;
      this.pressureMultiplier = Math.min(PRESSURE_MAX, this.pressureMultiplier + 0.1);
    }

    // Update each spawner
    for (const spawner of this.spawners) {
      if (spawner.disabled) continue;

      // Check if linked building still alive
      const bld = this.entityManager.getEntity(spawner.config.buildingEntityId);
      if (!bld || !bld.active) {
        spawner.disabled = true;
        EventBus.emit('spawner-neutralized', { campId: spawner.config.campId, tileX: spawner.config.tileX, tileY: spawner.config.tileY });
        continue;
      }

      const effects = getCachedMergedEffects(getActiveModifiers);
      const spawnRateMult = effects.spawnRateMult ?? 1;
      const effectiveInterval = (spawner.config.spawnInterval * spawnRateMult) / this.pressureMultiplier;
      spawner.timer += delta;
      if (spawner.timer >= effectiveInterval && spawner.activeUnits.size < spawner.config.maxActiveUnits) {
        spawner.timer = 0;
        this.spawnGroup(spawner);
      }
    }

    // Roaming patrols
    this.roamTimer += delta;
    if (this.roamTimer >= ROAM_PATROL_INTERVAL) {
      this.roamTimer = 0;
      this.spawnRoamingPatrol();
    }
  }

  private spawnGroup(spawner: ActiveSpawner): void {
    for (const def of spawner.config.spawnGroup) {
      for (let i = 0; i < def.count; i++) {
        if (spawner.activeUnits.size >= spawner.config.maxActiveUnits) return;

        const offsetX = Math.floor(Math.random() * 3) - 1;
        const offsetY = Math.floor(Math.random() * 3) - 1;
        const sx = Math.max(0, Math.min(MAP_WIDTH - 1, spawner.config.tileX + offsetX));
        const sy = Math.max(0, Math.min(MAP_HEIGHT - 1, spawner.config.tileY + offsetY));

        const unit = this.entityManager.spawnUnit(sx, sy, def.type, def.stats, 'enemy');
        unit.campId = spawner.config.campId;

        // Random home position within patrol radius
        const pr = spawner.config.patrolRadius;
        unit.homeX = spawner.config.tileX + Math.floor(Math.random() * pr * 2) - pr;
        unit.homeY = spawner.config.tileY + Math.floor(Math.random() * pr * 2) - pr;
        unit.homeX = Math.max(0, Math.min(MAP_WIDTH - 1, unit.homeX));
        unit.homeY = Math.max(0, Math.min(MAP_HEIGHT - 1, unit.homeY));
        unit.aggroRadius = 6;

        spawner.activeUnits.add(unit.entityId);
      }
    }
  }

  private spawnRoamingPatrol(): void {
    // Spawn from a random map edge
    const edge = Math.floor(Math.random() * 4);
    let sx: number, sy: number, tx: number, ty: number;

    switch (edge) {
      case 0: // top
        sx = Math.floor(Math.random() * MAP_WIDTH);
        sy = 0;
        tx = Math.floor(Math.random() * MAP_WIDTH);
        ty = MAP_HEIGHT - 1;
        break;
      case 1: // right
        sx = MAP_WIDTH - 1;
        sy = Math.floor(Math.random() * MAP_HEIGHT);
        tx = 0;
        ty = Math.floor(Math.random() * MAP_HEIGHT);
        break;
      case 2: // bottom
        sx = Math.floor(Math.random() * MAP_WIDTH);
        sy = MAP_HEIGHT - 1;
        tx = Math.floor(Math.random() * MAP_WIDTH);
        ty = 0;
        break;
      default: // left
        sx = 0;
        sy = Math.floor(Math.random() * MAP_HEIGHT);
        tx = MAP_WIDTH - 1;
        ty = Math.floor(Math.random() * MAP_HEIGHT);
        break;
    }

    for (let i = 0; i < ROAM_PATROL_SIZE; i++) {
      const unit = this.entityManager.spawnUnit(
        Math.max(0, Math.min(MAP_WIDTH - 1, sx + Math.floor(Math.random() * 3) - 1)),
        Math.max(0, Math.min(MAP_HEIGHT - 1, sy + Math.floor(Math.random() * 3) - 1)),
        'enemy_grunt', ENEMY_GRUNT, 'enemy'
      );
      // Patrol to opposite side
      unit.homeX = tx;
      unit.homeY = ty;
      unit.aggroRadius = 6;
      unit.patrolPath = [
        { x: sx, y: sy },
        { x: tx, y: ty },
      ];
    }
  }

  spawnReinforcement(targetX: number, targetY: number): void {
    // Spawn a counter-attack group from nearest map edge
    const edges = [
      { x: 0, y: targetY },
      { x: MAP_WIDTH - 1, y: targetY },
      { x: targetX, y: 0 },
      { x: targetX, y: MAP_HEIGHT - 1 },
    ];
    const edge = edges[Math.floor(Math.random() * edges.length)];

    const size = Math.floor(REINFORCEMENT_SIZE_BASE * this.pressureMultiplier);
    const gruntCount = Math.ceil(size * 0.7);
    const archerCount = size - gruntCount;

    const timeout = setTimeout(() => {
      if (this.destroyed) return;

      for (let i = 0; i < gruntCount; i++) {
        const unit = this.entityManager.spawnUnit(
          Math.max(0, Math.min(MAP_WIDTH - 1, edge.x + Math.floor(Math.random() * 3) - 1)),
          Math.max(0, Math.min(MAP_HEIGHT - 1, edge.y + Math.floor(Math.random() * 3) - 1)),
          'enemy_grunt', ENEMY_GRUNT, 'enemy'
        );
        unit.homeX = targetX;
        unit.homeY = targetY;
        unit.aggroRadius = 8;
      }
      for (let i = 0; i < archerCount; i++) {
        const unit = this.entityManager.spawnUnit(
          Math.max(0, Math.min(MAP_WIDTH - 1, edge.x + Math.floor(Math.random() * 3) - 1)),
          Math.max(0, Math.min(MAP_HEIGHT - 1, edge.y + Math.floor(Math.random() * 3) - 1)),
          'enemy_archer', ENEMY_ARCHER, 'enemy'
        );
        unit.homeX = targetX;
        unit.homeY = targetY;
        unit.aggroRadius = 8;
      }
      EventBus.emit('reinforcements-incoming', { tileX: targetX, tileY: targetY });
    }, REINFORCEMENT_DELAY);

    this.pendingTimeouts.push(timeout);
  }

  private onEntityDied = ({ entity }: { entity: any }): void => {
    if (!entity) return;
    for (const spawner of this.spawners) {
      if (spawner.activeUnits.has(entity.entityId)) {
        spawner.activeUnits.delete(entity.entityId);
        break;
      }
    }
  };

  private onObjectiveCompleted = ({ tileX, tileY }: { tileX?: number; tileY?: number }): void => {
    if (tileX !== undefined && tileY !== undefined) {
      this.spawnReinforcement(tileX, tileY);
    }
  };

  private onExtractionStarted = ({ tileX, tileY }: { tileX: number; tileY: number }): void => {
    this.extracting = true;
    this.extractionTarget = { x: tileX, y: tileY };
    this.extractionWaveTimer = 0;
    EventBus.emit('reinforcements-incoming', { tileX, tileY });
  };

  private onSurviveWaveSpawn = ({ tileX, tileY, size }: { tileX: number; tileY: number; size: number }): void => {
    this.spawnTargetedWave(tileX, tileY, Math.floor(size * this.pressureMultiplier));
  };

  private onExtractionWaveSpawn = ({ tileX, tileY }: { tileX: number; tileY: number }): void => {
    const size = Math.floor(EXTRACTION_WAVE_SIZE_BASE * this.pressureMultiplier);
    this.spawnTargetedWave(tileX, tileY, size);
    EventBus.emit('reinforcements-incoming', { tileX, tileY });
  };

  /** Spawn a wave from a random map edge targeting a specific location */
  private spawnTargetedWave(targetX: number, targetY: number, size: number): void {
    const edges = [
      { x: 0, y: targetY },
      { x: MAP_WIDTH - 1, y: targetY },
      { x: targetX, y: 0 },
      { x: targetX, y: MAP_HEIGHT - 1 },
    ];
    const edge = edges[Math.floor(Math.random() * edges.length)];

    const gruntCount = Math.ceil(size * 0.7);
    const archerCount = size - gruntCount;

    for (let i = 0; i < gruntCount; i++) {
      const unit = this.entityManager.spawnUnit(
        Math.max(0, Math.min(MAP_WIDTH - 1, edge.x + Math.floor(Math.random() * 3) - 1)),
        Math.max(0, Math.min(MAP_HEIGHT - 1, edge.y + Math.floor(Math.random() * 3) - 1)),
        'enemy_grunt', ENEMY_GRUNT, 'enemy'
      );
      unit.homeX = targetX;
      unit.homeY = targetY;
      unit.aggroRadius = 8;
    }
    for (let i = 0; i < archerCount; i++) {
      const unit = this.entityManager.spawnUnit(
        Math.max(0, Math.min(MAP_WIDTH - 1, edge.x + Math.floor(Math.random() * 3) - 1)),
        Math.max(0, Math.min(MAP_HEIGHT - 1, edge.y + Math.floor(Math.random() * 3) - 1)),
        'enemy_archer', ENEMY_ARCHER, 'enemy'
      );
      unit.homeX = targetX;
      unit.homeY = targetY;
      unit.aggroRadius = 8;
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const timeout of this.pendingTimeouts) {
      clearTimeout(timeout);
    }
    this.pendingTimeouts = [];
    EventBus.off('entity-died', this.onEntityDied, this);
    EventBus.off('objective-completed', this.onObjectiveCompleted, this);
    EventBus.off('extraction-started', this.onExtractionStarted, this);
    EventBus.off('survive-wave-spawn', this.onSurviveWaveSpawn, this);
    EventBus.off('extraction-wave-spawn', this.onExtractionWaveSpawn, this);
  }
}
