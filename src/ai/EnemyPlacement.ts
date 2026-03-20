import { MissionDefinition, EnemyCampDefinition } from '../missions/MissionDefinition';
import { EntityManager } from '../systems/EntityManager';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';

export class EnemyPlacement {
  static populate(mission: MissionDefinition, entityManager: EntityManager): void {
    for (const camp of mission.enemyCamps) {
      // Spawn building if defined
      if (camp.building) {
        const building = entityManager.spawnBuilding(
          camp.tileX, camp.tileY,
          camp.building.buildingType,
          camp.building.stats,
          'enemy'
        );
        if (building) {
          (building as any).campId = camp.id;
        }
      }

      // Spawn units around the camp position
      for (const unitDef of camp.units) {
        for (let i = 0; i < unitDef.count; i++) {
          // Spread units around camp center with some randomization
          const offsetX = Math.floor(Math.random() * 5) - 2;
          const offsetY = Math.floor(Math.random() * 5) - 2;
          const spawnX = Math.max(0, Math.min(MAP_WIDTH - 1, camp.tileX + offsetX));
          const spawnY = Math.max(0, Math.min(MAP_HEIGHT - 1, camp.tileY + offsetY));

          const unit = entityManager.spawnUnit(
            spawnX, spawnY,
            unitDef.type,
            unitDef.stats,
            'enemy'
          );

          // Tag unit with camp info for AI behavior
          unit.campId = camp.id;
          unit.homeX = camp.tileX;
          unit.homeY = camp.tileY;
          unit.aggroRadius = camp.aggroRadius;
          if (camp.patrolPath) {
            unit.patrolPath = camp.patrolPath;
          }
        }
      }
    }
  }
}
