import { EntityManager } from './EntityManager';
import { CombatComponent } from '../components/CombatComponent';
import { Entity } from '../entities/Entity';

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

      // If no target or target dead, find nearest enemy
      if (!combat.target || !combat.target.active) {
        const nearest = this.entityManager.getNearestEnemy(entity);
        if (nearest && combat.isInRange(nearest)) {
          combat.setTarget(nearest);
        } else {
          combat.setTarget(null);
        }
      }
    }
  }
}
