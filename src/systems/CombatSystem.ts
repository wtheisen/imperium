import { EntityManager } from './EntityManager';
import { CombatComponent } from '../components/CombatComponent';
import { MoverComponent } from '../components/MoverComponent';
import { HealthComponent } from '../components/HealthComponent';
import { Entity, EntityTeam } from '../entities/Entity';
import { IsoHelper } from '../map/IsoHelper';
import { EventBus } from '../EventBus';

export class CombatSystem {
  private entityManager: EntityManager;
  private retargetTimer = 0;
  private retargetInterval = 250; // ms between auto-target scans

  constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
    EventBus.on('projectile-hit', this.onProjectileHit, this);
    EventBus.on('projectile-hit-aoe', this.onProjectileHitAoe, this);
  }

  private onProjectileHit = (data: { targetId: string; attackerId: string; damage: number }): void => {
    const target = this.entityManager.getEntity(data.targetId);
    if (!target || !target.active) return;
    const health = target.getComponent<HealthComponent>('health');
    if (!health) return;
    const attacker = this.entityManager.getEntity(data.attackerId);
    health.takeDamage(data.damage, attacker);
  };

  private onProjectileHitAoe = (data: {
    attackerId: string; tileX: number; tileY: number;
    radius: number; damage: number; enemyTeam: string;
  }): void => {
    const attacker = this.entityManager.getEntity(data.attackerId);
    const enemies = this.entityManager.getEntitiesByTeam(data.enemyTeam as EntityTeam);
    for (const e of enemies) {
      if (!e.active) continue;
      if (IsoHelper.tileDistance(data.tileX, data.tileY, e.tileX, e.tileY) <= data.radius) {
        const health = e.getComponent<HealthComponent>('health');
        if (health) health.takeDamage(data.damage, attacker);
      }
    }
  };

  destroy(): void {
    EventBus.off('projectile-hit', this.onProjectileHit, this);
    EventBus.off('projectile-hit-aoe', this.onProjectileHitAoe, this);
  }

  update(delta: number): void {
    // Throttle auto-targeting to avoid O(N^2) scans every frame
    this.retargetTimer += delta;
    if (this.retargetTimer < this.retargetInterval) return;
    this.retargetTimer = 0;

    // Auto-target for entities without targets
    const allEntities = this.entityManager.getAllEntities();

    for (const entity of allEntities) {
      const combat = entity.getComponent<CombatComponent>('combat');
      if (!combat) continue;
      const mover = entity.getComponent<MoverComponent>('mover');

      // If no target or target dead, find nearest enemy
      if (!combat.target || !combat.target.active) {
        const hadTarget = !!combat.target;
        // Buildings can't move — only scan within their attack range
        const nearest = mover
          ? this.entityManager.getNearestEnemy(entity)
          : this.entityManager.getNearestEnemyInRange(entity, combat.getRange());
        if (nearest && combat.isInRange(nearest)) {
          combat.setTarget(nearest);
          // Stop moving units when they engage
          if (mover && mover.isMoving() && (mover.attackMoving || mover.behaviorMode !== 'none')) {
            mover.stopForCombat();
          }
        } else {
          combat.setTarget(null);
          if (hadTarget && mover && !mover.isMoving()) {
            // Resume attack-move path
            if (mover.attackMoving && mover.attackMoveDestination) {
              const dest = mover.attackMoveDestination;
              EventBus.emit('request-path', { unit: entity, targetX: dest.x, targetY: dest.y });
            }
            // Resume patrol — walk to next waypoint
            else if (mover.behaviorMode === 'patrol' && mover.patrolPoints.length >= 2) {
              const next = mover.patrolPoints[mover.patrolIndex];
              EventBus.emit('request-path', { unit: entity, targetX: next.x, targetY: next.y });
            }
            // Resume explore — pick a new random destination
            else if (mover.behaviorMode === 'explore') {
              EventBus.emit('command-explore-resume', { unit: entity });
            }
          }
        }
      }
    }
  }
}
