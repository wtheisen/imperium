import { EventBus } from '../EventBus';
import { POIDefinition } from '../missions/MissionDefinition';
import { EntityManager } from './EntityManager';
import { HealthComponent } from '../components/HealthComponent';
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
          this.applyReward(poi.definition);
          EventBus.emit('poi-collected', {
            id: poi.definition.id,
            type: poi.definition.type,
            tileX: poi.definition.tileX,
            tileY: poi.definition.tileY,
            reward: poi.definition.reward,
          });
          break;
        }
      }
    }
  }

  private applyReward(def: POIDefinition): void {
    const reward = def.reward;
    const tx = def.tileX;
    const ty = def.tileY;

    switch (def.type) {
      case 'gold_cache': {
        const gold = reward.gold ?? 10;
        EventBus.emit('gold-changed', { amount: gold, total: -1 });
        EventBus.emit('floating-text-3d', { tileX: tx, tileY: ty, text: `+${gold} GOLD`, color: '#c8982a' });
        break;
      }
      case 'ammo_dump': {
        const draws = reward.cardDraws ?? 1;
        EventBus.emit('bonus-draws', { count: draws });
        EventBus.emit('floating-text-3d', { tileX: tx, tileY: ty, text: `+${draws} CARD${draws > 1 ? 'S' : ''}`, color: '#50b0b0' });
        break;
      }
      case 'med_station': {
        const healAmount = reward.healAmount ?? 15;
        const healRadius = reward.healRadius ?? 5;
        let healed = 0;
        for (const unit of this.entityManager.getUnits('player')) {
          if (!unit.active) continue;
          const dist = Math.abs(unit.tileX - tx) + Math.abs(unit.tileY - ty);
          if (dist <= healRadius) {
            const health = unit.getComponent<HealthComponent>('health');
            if (health && health.currentHp < health.maxHp) {
              health.heal(healAmount);
              healed++;
            }
          }
        }
        EventBus.emit('floating-text-3d', { tileX: tx, tileY: ty, text: `AREA HEALED (${healed})`, color: '#60aa60' });
        break;
      }
      case 'intel': {
        const radius = reward.fogRevealRadius ?? 20;
        EventBus.emit('fog-reveal', { tileX: tx, tileY: ty, radius });
        EventBus.emit('floating-text-3d', { tileX: tx, tileY: ty, text: 'FOG REVEALED', color: '#6090cc' });
        break;
      }
      case 'relic': {
        EventBus.emit('bonus-draws', { count: 1, typeFilter: 'equipment' });
        EventBus.emit('floating-text-3d', { tileX: tx, tileY: ty, text: 'RELIC FOUND', color: '#a070cc' });
        break;
      }
    }
  }

  destroy(): void {
    this.pois = [];
  }
}
