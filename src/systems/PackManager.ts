import { EventBus } from '../EventBus';
import { EntityManager } from './EntityManager';
import { PACK_PICKUP_RADIUS } from '../config';
import { generatePack } from '../packs/PackGenerator';
import { PackDefinition } from '../packs/PackTypes';

interface ActivePack {
  definition: PackDefinition;
  collected: boolean;
}

export class PackManager {
  private packs: ActivePack[] = [];
  private entityManager: EntityManager;

  constructor(entityManager: EntityManager, definitions?: PackDefinition[]) {
    this.entityManager = entityManager;
    if (definitions) {
      for (const def of definitions) {
        this.packs.push({ definition: def, collected: false });
        EventBus.emit('pack-marker-3d', {
          id: def.id,
          type: def.type,
          tileX: def.tileX,
          tileY: def.tileY,
        });
      }
    }
  }

  update(): void {
    const playerUnits = this.entityManager.getUnits('player');
    for (const pack of this.packs) {
      if (pack.collected) continue;
      for (const unit of playerUnits) {
        const dx = Math.abs(unit.tileX - pack.definition.tileX);
        const dy = Math.abs(unit.tileY - pack.definition.tileY);
        if (dx + dy <= PACK_PICKUP_RADIUS) {
          pack.collected = true;
          const cards = generatePack(pack.definition.type);
          EventBus.emit('pack-collected', {
            packId: pack.definition.id,
            type: pack.definition.type,
            cards,
          });
          EventBus.emit('pack-opened-3d', { id: pack.definition.id });
          break;
        }
      }
    }
  }

  destroy(): void {
    this.packs = [];
  }
}
