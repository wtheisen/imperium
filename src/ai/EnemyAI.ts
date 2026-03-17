import { Unit } from '../entities/Unit';
import { Entity } from '../entities/Entity';
import { EntityManager } from '../systems/EntityManager';
import { PathfindingSystem } from '../systems/PathfindingSystem';
import { MoverComponent } from '../components/MoverComponent';
import { CombatComponent } from '../components/CombatComponent';

export class EnemyAI {
  private entityManager: EntityManager;
  private pathfinding: PathfindingSystem;
  private retargetInterval: number = 2000;
  private retargetTimer: number = 0;
  private patrolIndices: Map<string, number> = new Map();

  constructor(entityManager: EntityManager, pathfinding: PathfindingSystem) {
    this.entityManager = entityManager;
    this.pathfinding = pathfinding;
  }

  update(delta: number): void {
    this.retargetTimer += delta;
    if (this.retargetTimer < this.retargetInterval) return;
    this.retargetTimer = 0;

    const enemies = this.entityManager.getUnits('enemy');

    for (const enemy of enemies) {
      this.updateUnit(enemy);
    }
  }

  private async updateUnit(enemy: Unit): Promise<void> {
    const combat = enemy.getComponent<CombatComponent>('combat');
    const mover = enemy.getComponent<MoverComponent>('mover');
    if (!combat || !mover) return;

    const homeX = enemy.homeX ?? enemy.tileX;
    const homeY = enemy.homeY ?? enemy.tileY;
    const aggroRadius = enemy.aggroRadius ?? 6;

    // Find nearest player entity
    const nearestTarget = this.findNearestPlayerEntity(enemy);

    if (nearestTarget) {
      const distToTarget = this.tileDistance(enemy, nearestTarget);
      const distTargetFromHome = Math.abs(nearestTarget.tileX - homeX) + Math.abs(nearestTarget.tileY - homeY);

      // Aggro: player entity is within aggro radius of home
      if (distTargetFromHome <= aggroRadius) {
        combat.setTarget(nearestTarget);
        if (!combat.isInRange(nearestTarget)) {
          const path = await this.pathfinding.findPath(
            enemy.tileX, enemy.tileY,
            nearestTarget.tileX, nearestTarget.tileY
          );
          if (path && path.length > 1) {
            mover.setPath(path.slice(1));
          }
        } else {
          mover.stop();
        }
        return;
      }

      // Chase leash: if already engaged but target moved beyond 2x aggro from home, disengage
      if (distToTarget <= 5 && distTargetFromHome <= aggroRadius * 2) {
        combat.setTarget(nearestTarget);
        if (!combat.isInRange(nearestTarget)) {
          const path = await this.pathfinding.findPath(
            enemy.tileX, enemy.tileY,
            nearestTarget.tileX, nearestTarget.tileY
          );
          if (path && path.length > 1) {
            mover.setPath(path.slice(1));
          }
        } else {
          mover.stop();
        }
        return;
      }
    }

    // No valid target — return to guard behavior
    combat.setTarget(null);
    const distFromHome = Math.abs(enemy.tileX - homeX) + Math.abs(enemy.tileY - homeY);

    if (distFromHome > 2) {
      // Return home
      const path = await this.pathfinding.findPath(
        enemy.tileX, enemy.tileY,
        homeX, homeY
      );
      if (path && path.length > 1) {
        mover.setPath(path.slice(1));
      }
    } else if (enemy.patrolPath && enemy.patrolPath.length > 0) {
      // Patrol
      const patrolIdx = this.patrolIndices.get(enemy.entityId) ?? 0;
      const target = enemy.patrolPath[patrolIdx];
      if (enemy.tileX === target.x && enemy.tileY === target.y) {
        const nextIdx = (patrolIdx + 1) % enemy.patrolPath.length;
        this.patrolIndices.set(enemy.entityId, nextIdx);
      } else {
        const path = await this.pathfinding.findPath(
          enemy.tileX, enemy.tileY,
          target.x, target.y
        );
        if (path && path.length > 1) {
          mover.setPath(path.slice(1));
        }
      }
    } else {
      mover.stop();
    }
  }

  private findNearestPlayerEntity(enemy: Unit): Entity | null {
    const playerEntities = this.entityManager.getEntitiesByTeam('player');
    if (playerEntities.length === 0) return null;

    let nearest: Entity | null = null;
    let minDist = Infinity;
    for (const pe of playerEntities) {
      const dist = this.tileDistance(enemy, pe);
      if (dist < minDist) {
        minDist = dist;
        nearest = pe;
      }
    }
    return nearest;
  }

  private tileDistance(a: Entity, b: Entity): number {
    return Math.abs(a.tileX - b.tileX) + Math.abs(a.tileY - b.tileY);
  }
}
