import { Entity, EntityTeam } from '../entities/Entity';
import { Unit, UnitStats } from '../entities/Unit';
import { Building, BuildingStats } from '../entities/Building';
import { HealthComponent } from '../components/HealthComponent';
import { MoverComponent } from '../components/MoverComponent';
import { CombatComponent } from '../components/CombatComponent';
import { GathererComponent } from '../components/GathererComponent';
import { AuraComponent } from '../components/AuraComponent';
import { ProductionComponent } from '../components/ProductionComponent';
import { EventBus } from '../EventBus';
import { PlacementValidator } from '../map/PlacementValidator';
import { applyTechTreeBonuses } from '../state/TechTreeEffects';
import { LevelBadgeComponent } from '../components/LevelBadgeComponent';

export class EntityManager {
  private entities: Map<string, Entity> = new Map();
  private validator: PlacementValidator;

  constructor(validator: PlacementValidator) {
    this.validator = validator;

    EventBus.on('entity-died', this.handleEntityDeath, this);
    EventBus.on('unit-trained', this.handleUnitTrained, this);
  }

  spawnUnit(
    tileX: number,
    tileY: number,
    _texture: string,
    unitType: string,
    stats: UnitStats,
    team: EntityTeam = 'player'
  ): Unit {
    const unit = new Unit(tileX, tileY, unitType, stats, team);

    unit.addComponent('health', new HealthComponent(unit, stats.maxHp));
    unit.addComponent('mover', new MoverComponent(unit, stats.speed));

    if (stats.attackDamage > 0) {
      unit.addComponent(
        'combat',
        new CombatComponent(unit, stats.attackDamage, stats.attackRange, stats.attackCooldown, stats.isRanged)
      );
    }

    if (stats.gatherRate && stats.gatherCapacity) {
      unit.addComponent('gatherer', new GathererComponent(unit, stats.gatherRate, stats.gatherCapacity));
    }

    this.entities.set(unit.entityId, unit);
    return unit;
  }

  spawnBuilding(
    tileX: number,
    tileY: number,
    _texture: string,
    buildingType: string,
    stats: BuildingStats,
    team: EntityTeam = 'player'
  ): Building | null {
    if (!this.validator.canPlace(tileX, tileY, stats.tileWidth, stats.tileHeight)) {
      return null;
    }

    const building = new Building(tileX, tileY, buildingType, stats, team);
    building.addComponent('health', new HealthComponent(building, stats.maxHp));

    if (stats.attackDamage && stats.attackRange && stats.attackCooldown) {
      building.addComponent(
        'combat',
        new CombatComponent(building, stats.attackDamage, stats.attackRange, stats.attackCooldown, true)
      );
    }

    const getAllEntities = () => this.getAllEntities();

    if (buildingType === 'drop_ship') {
      building.addComponent('aura', new AuraComponent(building, {
        healPerTick: 2,
        healRadius: 4,
        healInterval: 5000,
        goldPerTick: 1,
        goldInterval: 15000,
      }, getAllEntities));
      building.addComponent('production', new ProductionComponent(building));
    } else if (buildingType === 'barracks') {
      building.addComponent('aura', new AuraComponent(building, {
        damageBoost: 2,
        boostRadius: 4,
        extraCardDraw: 1,
      }, getAllEntities));
      building.addComponent('production', new ProductionComponent(building));
    } else if (buildingType === 'sanctum') {
      building.addComponent('aura', new AuraComponent(building, {
        healPerTick: 1,
        healRadius: 3,
        healInterval: 1000,
      }, getAllEntities));
    } else if (buildingType === 'aegis') {
      const health = building.getComponent<HealthComponent>('health');
      if (health) health.armor = 5;
    }

    this.validator.occupyTiles(tileX, tileY, stats.tileWidth, stats.tileHeight);
    this.entities.set(building.entityId, building);

    EventBus.emit('building-placed', { building, tiles: this.getTilesForBuilding(tileX, tileY, stats.tileWidth, stats.tileHeight) });

    return building;
  }

  private getTilesForBuilding(x: number, y: number, w: number, h: number): { x: number; y: number }[] {
    const tiles: { x: number; y: number }[] = [];
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        tiles.push({ x: x + dx, y: y + dy });
      }
    }
    return tiles;
  }

  private handleUnitTrained({ unitType, texture, stats, tileX, tileY }: {
    unitType: string; texture: string; stats: UnitStats;
    tileX: number; tileY: number;
  }): void {
    const unit = this.spawnUnit(tileX, tileY, texture, unitType, stats, 'player');
    applyTechTreeBonuses(unit, this);
    unit.addComponent('levelBadge', new LevelBadgeComponent(unit));
  }

  private handleEntityDeath({ entity }: { entity: Entity }): void {
    if (entity instanceof Building) {
      this.validator.freeTiles(entity.tileX, entity.tileY, entity.tileWidth, entity.tileHeight);
    }
    this.entities.delete(entity.entityId);
    entity.destroyEntity();
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  getUnits(team?: EntityTeam): Unit[] {
    return this.getAllEntities().filter(
      (e): e is Unit => e instanceof Unit && (!team || e.team === team)
    );
  }

  getBuildings(team?: EntityTeam): Building[] {
    return this.getAllEntities().filter(
      (e): e is Building => e instanceof Building && (!team || e.team === team)
    );
  }

  getEntitiesByTeam(team: EntityTeam): Entity[] {
    return this.getAllEntities().filter((e) => e.team === team);
  }

  getEntitiesAtTile(tileX: number, tileY: number): Entity[] {
    return this.getAllEntities().filter((e) => e.tileX === tileX && e.tileY === tileY);
  }

  getNearestEnemy(entity: Entity): Entity | null {
    const enemies = this.getAllEntities().filter(
      (e) => e.team !== entity.team && e.active
    );
    if (enemies.length === 0) return null;

    let nearest: Entity | null = null;
    let minDist = Infinity;
    for (const enemy of enemies) {
      const dist = Math.abs(entity.tileX - enemy.tileX) + Math.abs(entity.tileY - enemy.tileY);
      if (dist < minDist) {
        minDist = dist;
        nearest = enemy;
      }
    }
    return nearest;
  }

  update(delta: number): void {
    for (const entity of this.entities.values()) {
      if (entity.active) {
        entity.updateComponents(delta);
      }
    }
  }

  destroy(): void {
    EventBus.off('entity-died', this.handleEntityDeath, this);
    EventBus.off('unit-trained', this.handleUnitTrained, this);
    for (const entity of this.entities.values()) {
      entity.destroyEntity();
    }
    this.entities.clear();
  }
}
