import { EventBus } from '../EventBus';
import { MissionDefinition, ObjectiveDefinition } from '../missions/MissionDefinition';
import { EntityManager } from './EntityManager';
import { Building } from '../entities/Building';
import { Unit } from '../entities/Unit';
import { MoverComponent } from '../components/MoverComponent';
import {
  MAP_WIDTH, MAP_HEIGHT, SUPPLY_DROP_GOLD, SUPPLY_DROP_CARD_DRAWS,
  EXTRACTION_ZONE_RADIUS, SURVIVE_WAVE_INTERVAL_MS, SURVIVE_WAVE_SIZE_BASE,
} from '../config';
import { getSupplyDropInterval } from '../ship/ShipState';

export type MissionState = 'DEPLOY' | 'ACTIVE' | 'EXTRACTION' | 'VICTORY' | 'DEFEAT';

export interface ObjectiveStatus {
  definition: ObjectiveDefinition;
  completed: boolean;
  optional: boolean;
  /** Progress tracking for survive/activate/collect objectives */
  progress: number;
  progressMax: number;
  /** Whether a survive objective has been triggered (player entered zone) */
  activated: boolean;
  /** Wave timer for survive objectives */
  waveTimer: number;
  /** For collect: which positions have been collected */
  collectedPositions: Set<number>;
}

export class MissionSystem {
  private entityManager: EntityManager;
  public mission: MissionDefinition;
  public state: MissionState = 'DEPLOY';
  public objectiveStatuses: ObjectiveStatus[];
  public optionalObjectiveStatuses: ObjectiveStatus[];
  public supplyTimer: number = 0;
  private deployTimer: number = 3000;

  // Extraction phase
  public extractionTimer: number = 0;
  public extractionTimerMax: number = 0;
  private extractionWaveTimer: number = 0;
  private _allStatuses: ObjectiveStatus[] | null = null;

  constructor(entityManager: EntityManager, mission: MissionDefinition) {
    this.entityManager = entityManager;
    this.mission = mission;
    this.objectiveStatuses = mission.objectives.map((obj) => this.createStatus(obj, false));
    this.optionalObjectiveStatuses = (mission.optionalObjectives ?? []).map((obj) => this.createStatus(obj, true));
    this.extractionTimerMax = mission.extractionTimerMs ?? 0;

    EventBus.on('entity-died', this.onEntityDied, this);
  }

  private createStatus(obj: ObjectiveDefinition, optional: boolean): ObjectiveStatus {
    let progressMax = 0;
    if (obj.type === 'survive') progressMax = obj.surviveDurationMs ?? 60000;
    if (obj.type === 'activate') progressMax = obj.channelDurationMs ?? 20000;
    if (obj.type === 'collect') progressMax = obj.collectTotal ?? (obj.collectPositions?.length ?? 0);

    return {
      definition: obj,
      completed: false,
      optional,
      progress: 0,
      progressMax,
      activated: false,
      waveTimer: 0,
      collectedPositions: new Set(),
    };
  }

  private getAllStatuses(): ObjectiveStatus[] {
    if (!this._allStatuses) {
      this._allStatuses = [...this.objectiveStatuses, ...this.optionalObjectiveStatuses];
    }
    return this._allStatuses;
  }

  private onEntityDied({ entity }: { entity: any }): void {
    if (this.state !== 'ACTIVE' && this.state !== 'EXTRACTION') return;

    for (const status of this.getAllStatuses()) {
      if (status.completed) continue;

      // Destroy objectives: building belonging to targeted camp died
      if (status.definition.type === 'destroy' && entity instanceof Building && entity.team === 'enemy') {
        const campId = (entity as any).campId as string | undefined;
        if (campId && status.definition.targetCampId === campId) {
          this.completeObjective(status);
        }
      }

      // Purge objectives: check if area is clear after an enemy dies
      if (status.definition.type === 'purge' && entity.team === 'enemy') {
        this.checkPurgeObjective(status);
      }
    }
  }

  private checkPurgeObjective(status: ObjectiveStatus): void {
    const obj = status.definition;
    const radius = obj.purgeRadius || 5;

    const enemies = this.entityManager.getUnits('enemy');
    const enemiesInRadius = enemies.filter((e) => {
      const hx = e.homeX ?? e.tileX;
      const hy = e.homeY ?? e.tileY;
      return Math.abs(hx - obj.tileX) + Math.abs(hy - obj.tileY) <= radius;
    });

    const enemyBuildings = this.entityManager.getBuildings('enemy');
    const buildingsInRadius = enemyBuildings.filter((b) => {
      const dx = b.tileX - obj.tileX;
      const dy = b.tileY - obj.tileY;
      return Math.abs(dx) + Math.abs(dy) <= radius;
    });

    if (enemiesInRadius.length === 0 && buildingsInRadius.length === 0) {
      this.completeObjective(status);
    }
  }

  /** Check proximity-based objectives (recover, collect, survive trigger, activate) */
  private checkProximityObjectives(playerUnits: Unit[]): void {
    for (const status of this.getAllStatuses()) {
      if (status.completed) continue;
      const obj = status.definition;

      for (const unit of playerUnits) {
        const dx = Math.abs(unit.tileX - obj.tileX);
        const dy = Math.abs(unit.tileY - obj.tileY);
        const dist = dx + dy;

        // Recover: exact tile match
        if (obj.type === 'recover' && dist === 0) {
          this.completeObjective(status);
        }

        // Survive: player entering radius triggers the objective
        if (obj.type === 'survive' && !status.activated) {
          const surviveRadius = obj.surviveRadius ?? 5;
          if (dist <= surviveRadius) {
            status.activated = true;
            EventBus.emit('survive-objective-started', {
              objectiveId: obj.id, tileX: obj.tileX, tileY: obj.tileY,
            });
          }
        }

        // Collect: check if unit is at any uncollected position
        if (obj.type === 'collect' && obj.collectPositions) {
          for (let i = 0; i < obj.collectPositions.length; i++) {
            if (status.collectedPositions.has(i)) continue;
            const pos = obj.collectPositions[i];
            if (Math.abs(unit.tileX - pos.tileX) + Math.abs(unit.tileY - pos.tileY) <= 1) {
              status.collectedPositions.add(i);
              status.progress = status.collectedPositions.size;
              EventBus.emit('collect-item-picked', {
                objectiveId: obj.id, posIndex: i,
                tileX: pos.tileX, tileY: pos.tileY,
                current: status.progress, total: status.progressMax,
              });
              if (status.progress >= status.progressMax) {
                this.completeObjective(status);
              }
            }
          }
        }
      }
    }
  }

  /** Update survive objectives — tick timer, spawn waves */
  private updateSurviveObjectives(delta: number, playerUnits: Unit[]): void {
    for (const status of this.getAllStatuses()) {
      if (status.completed || status.definition.type !== 'survive' || !status.activated) continue;

      const obj = status.definition;
      const surviveRadius = obj.surviveRadius ?? 5;

      // Check if any player unit is still in the zone
      const hasPresence = playerUnits.some((u) => {
        return Math.abs(u.tileX - obj.tileX) + Math.abs(u.tileY - obj.tileY) <= surviveRadius;
      });

      if (hasPresence) {
        status.progress += delta;

        // Spawn waves periodically
        status.waveTimer += delta;
        if (status.waveTimer >= SURVIVE_WAVE_INTERVAL_MS) {
          status.waveTimer = 0;
          EventBus.emit('survive-wave-spawn', {
            tileX: obj.tileX, tileY: obj.tileY,
            size: SURVIVE_WAVE_SIZE_BASE,
          });
        }

        if (status.progress >= status.progressMax) {
          this.completeObjective(status);
        }
      }
    }
  }

  /** Update activate objectives — channel while stationary at tile */
  private updateActivateObjectives(delta: number, playerUnits: Unit[]): void {
    for (const status of this.getAllStatuses()) {
      if (status.completed || status.definition.type !== 'activate') continue;

      const obj = status.definition;

      // Find a player unit at the exact objective tile that is not moving
      const channeler = playerUnits.find((u) => {
        if (u.tileX !== obj.tileX || u.tileY !== obj.tileY) return false;
        const mover = u.getComponent<MoverComponent>('mover');
        return !mover || !mover.isMoving();
      });

      if (channeler) {
        if (!status.activated) {
          status.activated = true;
          EventBus.emit('activate-channel-started', {
            objectiveId: obj.id, tileX: obj.tileX, tileY: obj.tileY,
          });
        }
        status.progress += delta;

        // Attract enemies while channeling
        status.waveTimer += delta;
        if (status.waveTimer >= SURVIVE_WAVE_INTERVAL_MS) {
          status.waveTimer = 0;
          EventBus.emit('survive-wave-spawn', {
            tileX: obj.tileX, tileY: obj.tileY,
            size: Math.ceil(SURVIVE_WAVE_SIZE_BASE * 0.75),
          });
        }

        if (status.progress >= status.progressMax) {
          this.completeObjective(status);
        }
      } else if (status.activated) {
        // Channel interrupted — reset progress
        status.progress = 0;
        status.activated = false;
        EventBus.emit('activate-channel-interrupted', { objectiveId: obj.id });
      }
    }
  }

  private completeObjective(status: ObjectiveStatus): void {
    status.completed = true;
    const obj = status.definition;

    EventBus.emit('objective-completed', {
      objectiveId: obj.id,
      goldReward: obj.goldReward,
      cardDraws: obj.cardDraws,
      tileX: obj.tileX,
      tileY: obj.tileY,
      optional: status.optional,
    });

    // Check if all REQUIRED objectives are done
    if (this.objectiveStatuses.every((s) => s.completed)) {
      this.startExtractionOrVictory();
    }
  }

  private startExtractionOrVictory(): void {
    if (this.extractionTimerMax > 0) {
      this.state = 'EXTRACTION';
      this.extractionTimer = 0;
      this.extractionWaveTimer = 0;
      EventBus.emit('extraction-started', {
        timerMs: this.extractionTimerMax,
        tileX: this.mission.playerStartX,
        tileY: this.mission.playerStartY,
      });
    } else {
      this.state = 'VICTORY';
      EventBus.emit('mission-complete', {
        missionName: this.mission.name,
        objectivesCompleted: this.objectiveStatuses.length,
        totalObjectives: this.objectiveStatuses.length,
        optionalCompleted: this.optionalObjectiveStatuses.filter((s) => s.completed).length,
        optionalTotal: this.optionalObjectiveStatuses.length,
      });
    }
  }

  private updateExtraction(delta: number): void {
    this.extractionTimer += delta;

    // Spawn extraction waves
    this.extractionWaveTimer += delta;
    if (this.extractionWaveTimer >= 10000) {
      this.extractionWaveTimer = 0;
      EventBus.emit('extraction-wave-spawn', {
        tileX: this.mission.playerStartX,
        tileY: this.mission.playerStartY,
      });
    }

    // Can still complete optional objectives during extraction
    const playerUnits = this.entityManager.getUnits('player');
    this.checkProximityObjectives(playerUnits);

    if (this.extractionTimer >= this.extractionTimerMax) {
      // Check if any player unit is near the drop ship
      const nearDrop = playerUnits.some((u) => {
        const dx = Math.abs(u.tileX - this.mission.playerStartX);
        const dy = Math.abs(u.tileY - this.mission.playerStartY);
        return dx + dy <= EXTRACTION_ZONE_RADIUS;
      });

      if (nearDrop) {
        this.state = 'VICTORY';
        EventBus.emit('mission-complete', {
          missionName: this.mission.name,
          objectivesCompleted: this.objectiveStatuses.length,
          totalObjectives: this.objectiveStatuses.length,
          optionalCompleted: this.optionalObjectiveStatuses.filter((s) => s.completed).length,
          optionalTotal: this.optionalObjectiveStatuses.length,
        });
      }
    }
  }

  update(delta: number): void {
    if (this.state === 'DEPLOY') {
      this.deployTimer -= delta;
      if (this.deployTimer <= 0) {
        this.state = 'ACTIVE';
        EventBus.emit('mission-active', { missionName: this.mission.name });
      }
      return;
    }

    if (this.state === 'EXTRACTION') {
      this.updateExtraction(delta);
      this.emitMissionUpdate();
      return;
    }

    if (this.state !== 'ACTIVE') return;

    // Supply drop timer
    const supplyInterval = this.mission.supplyDropIntervalMs * getSupplyDropInterval();
    this.supplyTimer += delta;
    if (this.supplyTimer >= supplyInterval) {
      this.supplyTimer = 0;

      const baseX = this.mission.playerStartX;
      const baseY = this.mission.playerStartY;
      let podX = baseX + Math.floor(Math.random() * 10) - 5;
      let podY = baseY + Math.floor(Math.random() * 10) - 5;
      podX = Math.max(1, Math.min(MAP_WIDTH - 2, podX));
      podY = Math.max(1, Math.min(MAP_HEIGHT - 2, podY));

      EventBus.emit('supply-pod-incoming', {
        tileX: podX,
        tileY: podY,
        gold: SUPPLY_DROP_GOLD,
        cardDraws: SUPPLY_DROP_CARD_DRAWS,
      });
    }

    // Check proximity-based objectives each frame
    const playerUnits = this.entityManager.getUnits('player');
    this.checkProximityObjectives(playerUnits);
    this.updateSurviveObjectives(delta, playerUnits);
    this.updateActivateObjectives(delta, playerUnits);

    this.emitMissionUpdate();
  }

  private emitMissionUpdate(): void {
    const mapStatus = (s: ObjectiveStatus) => ({
      id: s.definition.id,
      name: s.definition.name,
      type: s.definition.type,
      completed: s.completed,
      tileX: s.definition.tileX,
      tileY: s.definition.tileY,
      optional: s.optional,
      progress: s.progress,
      progressMax: s.progressMax,
      activated: s.activated,
    });

    EventBus.emit('mission-update', {
      state: this.state,
      missionName: this.mission.name,
      objectives: this.objectiveStatuses.map(mapStatus),
      optionalObjectives: this.optionalObjectiveStatuses.map(mapStatus),
      supplyTimer: this.supplyTimer,
      supplyInterval: this.mission.supplyDropIntervalMs * getSupplyDropInterval(),
      extractionTimer: this.extractionTimer,
      extractionTimerMax: this.extractionTimerMax,
      isExtracting: this.state === 'EXTRACTION',
    });
  }

  destroy(): void {
    EventBus.off('entity-died', this.onEntityDied, this);
  }
}
