import { EntityManager } from './EntityManager';
import { CombatComponent } from '../components/CombatComponent';
import { MoverComponent } from '../components/MoverComponent';
import { Entity } from '../entities/Entity';
import { EventBus } from '../EventBus';

export class CombatSystem {
  private entityManager: EntityManager;

  constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  update(_delta: number): void {
    // Auto-target for entities without targets
    const allEntities = this.entityManager.getAllEntities();

    for (const entity of allEntities) {
      const combat = entity.getComponent<CombatComponent>('combat');
      if (!combat) continue;
      const mover = entity.getComponent<MoverComponent>('mover');

      // If no target or target dead, find nearest enemy
      if (!combat.target || !combat.target.active) {
        const hadTarget = !!combat.target;
        const nearest = this.entityManager.getNearestEnemy(entity);
        if (nearest && combat.isInRange(nearest)) {
          combat.setTarget(nearest);
          // Stop attack-moving units when they engage
          if (mover?.attackMoving && mover.isMoving()) {
            mover.stopForCombat();
          }
        } else {
          combat.setTarget(null);
          // Resume attack-move path if target died and we have a destination
          if (hadTarget && mover?.attackMoving && mover.attackMoveDestination && !mover.isMoving()) {
            const dest = mover.attackMoveDestination;
            EventBus.emit('request-path', { unit: entity, targetX: dest.x, targetY: dest.y });
          }
        }
      }
    }
  }
}
