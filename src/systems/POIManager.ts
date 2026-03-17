import { EventBus } from '../EventBus';
import { POIDefinition } from '../missions/MissionDefinition';
import { EntityManager } from './EntityManager';
import { POI_PICKUP_RADIUS } from '../config';

interface ActivePOI {
  definition: POIDefinition;
  collected: boolean;
}

export class POIManager {
  private pois: ActivePOI[] = [];
  private entityManager: EntityManager;

  constructor(entityManager: EntityManager, definitions?: POIDefinition[]) {
    this.entityManager = entityManager;
    if (definitions) {
      for (const def of definitions) {
        this.pois.push({ definition: def, collected: false });
        EventBus.emit('poi-marker-3d', {
          id: def.id, type: def.type,
          tileX: def.tileX, tileY: def.tileY,
        });
      }
    }
  }

  update(): void {
    const playerUnits = this.entityManager.getUnits('player');
    for (const poi of this.pois) {
      if (poi.collected) continue;
      for (const unit of playerUnits) {
        const dx = Math.abs(unit.tileX - poi.definition.tileX);
        const dy = Math.abs(unit.tileY - poi.definition.tileY);
        if (dx + dy <= POI_PICKUP_RADIUS) {
          poi.collected = true;
          const reward = poi.definition.reward;
          if (reward.gold) {
            EventBus.emit('gold-changed', { amount: reward.gold, total: -1 }); // total resolved by listener
          }
          if (reward.cardDraws) {
            EventBus.emit('bonus-draws', { count: reward.cardDraws });
          }
          EventBus.emit('poi-collected', {
            id: poi.definition.id,
            type: poi.definition.type,
            tileX: poi.definition.tileX,
            tileY: poi.definition.tileY,
            reward,
          });
          break;
        }
      }
    }
  }

  destroy(): void {
    this.pois = [];
  }
}
