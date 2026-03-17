import { EventBus } from '../EventBus';
import { MissionDefinition, ObjectiveDefinition } from '../missions/MissionDefinition';
import { EntityManager } from './EntityManager';
import { Building } from '../entities/Building';
import { Unit } from '../entities/Unit';
import { MAP_WIDTH, MAP_HEIGHT, SUPPLY_DROP_GOLD, SUPPLY_DROP_CARD_DRAWS, OBJECTIVE_COMPLETION_BONUS, OBJECTIVE_CARD_DRAWS } from '../config';

export type MissionState = 'DEPLOY' | 'ACTIVE' | 'VICTORY' | 'DEFEAT';

export interface ObjectiveStatus {
  definition: ObjectiveDefinition;
  completed: boolean;
}

export class MissionSystem {
  private entityManager: EntityManager;
  public mission: MissionDefinition;
  public state: MissionState = 'DEPLOY';
  public objectiveStatuses: ObjectiveStatus[];
  public supplyTimer: number = 0;
  private deployTimer: number = 3000;

  constructor(entityManager: EntityManager, mission: MissionDefinition) {
    this.entityManager = entityManager;
    this.mission = mission;
    this.objectiveStatuses = mission.objectives.map((obj) => ({
      definition: obj,
      completed: false,
    }));

    EventBus.on('entity-died', this.onEntityDied, this);
  }

  private onEntityDied({ entity }: { entity: any }): void {
    if (this.state !== 'ACTIVE') return;

    // Check 'destroy' objectives — did we destroy a building belonging to targeted camp?
    if (entity instanceof Building && entity.team === 'enemy') {
      const campId = (entity as any).campId as string | undefined;
      if (campId) {
        for (const status of this.objectiveStatuses) {
          if (!status.completed && status.definition.type === 'destroy' && status.definition.targetCampId === campId) {
            this.completeObjective(status);
          }
        }
      }
    }

    // Check 'purge' objectives — are all enemies within radius dead?
    if (entity.team === 'enemy') {
      for (const status of this.objectiveStatuses) {
        if (!status.completed && status.definition.type === 'purge') {
          this.checkPurgeObjective(status);
        }
      }
    }
  }

  private checkPurgeObjective(status: ObjectiveStatus): void {
    const obj = status.definition;
    const radius = obj.purgeRadius || 5;
    const enemies = this.entityManager.getUnits('enemy');
    const enemiesInRadius = enemies.filter((e) => {
      const dx = e.tileX - obj.tileX;
      const dy = e.tileY - obj.tileY;
      return Math.abs(dx) + Math.abs(dy) <= radius;
    });
    // Also check enemy buildings in radius
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

  /** Check recover objectives — called when a player unit reaches the objective tile */
  checkRecoverObjectives(unit: Unit): void {
    if (this.state !== 'ACTIVE' || unit.team !== 'player') return;

    for (const status of this.objectiveStatuses) {
      if (!status.completed && status.definition.type === 'recover') {
        if (unit.tileX === status.definition.tileX && unit.tileY === status.definition.tileY) {
          this.completeObjective(status);
        }
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
    });

    // Check if all objectives are done
    if (this.objectiveStatuses.every((s) => s.completed)) {
      this.state = 'VICTORY';
      EventBus.emit('mission-complete', {
        missionName: this.mission.name,
        objectivesCompleted: this.objectiveStatuses.length,
        totalObjectives: this.objectiveStatuses.length,
      });
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

    if (this.state !== 'ACTIVE') return;

    // Supply drop timer — spawn a pod on the map instead of giving rewards directly
    this.supplyTimer += delta;
    if (this.supplyTimer >= this.mission.supplyDropIntervalMs) {
      this.supplyTimer = 0;

      // Pick a landing tile near player start (within ~6 tiles, on walkable ground)
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

    // Check recover objectives each frame (player unit at objective tile)
    const playerUnits = this.entityManager.getUnits('player');
    for (const unit of playerUnits) {
      this.checkRecoverObjectives(unit);
    }

    // Emit mission status for UI
    EventBus.emit('mission-update', {
      state: this.state,
      missionName: this.mission.name,
      objectives: this.objectiveStatuses.map((s) => ({
        id: s.definition.id,
        name: s.definition.name,
        type: s.definition.type,
        completed: s.completed,
        tileX: s.definition.tileX,
        tileY: s.definition.tileY,
      })),
      supplyTimer: this.supplyTimer,
      supplyInterval: this.mission.supplyDropIntervalMs,
    });
  }

  destroy(): void {
    EventBus.off('entity-died', this.onEntityDied, this);
  }
}
