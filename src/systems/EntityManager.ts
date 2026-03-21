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
import { getActiveModifiers } from '../state/PlayerState';
import { getCachedMergedEffects } from '../state/DifficultyModifiers';
import { EnvironmentEffects } from './EnvironmentModifierSystem';

export class EntityManager {
  private entities: Map<string, Entity> = new Map();
  private validator: PlacementValidator;
  private envEffects: EnvironmentEffects | null = null;
  /** Cached array of all entities, invalidated on add/remove. */
  private cachedAll: Entity[] | null = null;
  /** Team-partitioned caches, invalidated alongside cachedAll. */
  private cachedPlayerUnits: Unit[] | null = null;
  private cachedEnemyUnits: Unit[] | null = null;
  private cachedPlayerBuildings: Building[] | null = null;
  private cachedEnemyBuildings: Building[] | null = null;
  private cachedPlayerEntities: Entity[] | null = null;
  private cachedEnemyEntities: Entity[] | null = null;

  private invalidateCaches(): void {
    this.cachedAll = null;
    this.cachedPlayerUnits = null;
    this.cachedEnemyUnits = null;
    this.cachedPlayerBuildings = null;
    this.cachedEnemyBuildings = null;
    this.cachedPlayerEntities = null;
    this.cachedEnemyEntities = null;
  }

  constructor(validator: PlacementValidator) {
    this.validator = validator;

    EventBus.on('entity-died', this.handleEntityDeath, this);
    EventBus.on('unit-trained', this.handleUnitTrained, this);
  }

  setEnvironmentEffects(effects: EnvironmentEffects): void {
    this.envEffects = effects;
  }

  spawnUnit(
    tileX: number,
    tileY: number,
    unitType: string,
    stats: UnitStats,
    team: EntityTeam = 'player'
  ): Unit {
    // Apply difficulty modifiers to enemy stats
    let effectiveStats = stats;
    if (team === 'enemy') {
      const effects = getCachedMergedEffects(getActiveModifiers);
      const envHpMult = this.envEffects?.enemyHpMult ?? 1;
      const envDmgMult = this.envEffects?.enemyDamageMult ?? 1;
      const envSpdMult = this.envEffects?.enemySpeedMult ?? 1;
      const skullHp = effects.enemyHpMult ?? 1;
      const skullDmg = effects.enemyDamageMult ?? 1;
      const skullSpd = effects.enemySpeedMult ?? 1;
      const totalHp = skullHp * envHpMult;
      const totalDmg = skullDmg * envDmgMult;
      const totalSpd = skullSpd * envSpdMult;
      if (totalHp !== 1 || totalDmg !== 1 || totalSpd !== 1) {
        effectiveStats = { ...stats };
        if (totalHp !== 1) effectiveStats.maxHp = Math.round(stats.maxHp * totalHp);
        if (totalDmg !== 1) effectiveStats.attackDamage = Math.round(stats.attackDamage * totalDmg);
        if (totalSpd !== 1) effectiveStats.speed = stats.speed * totalSpd;
      }
    }

    const unit = new Unit(tileX, tileY, unitType, effectiveStats, team);

    unit.addComponent('health', new HealthComponent(unit, effectiveStats.maxHp));
    unit.addComponent('mover', new MoverComponent(unit, effectiveStats.speed));

    if (effectiveStats.attackDamage > 0) {
      unit.addComponent(
        'combat',
        new CombatComponent(unit, effectiveStats.attackDamage, effectiveStats.attackRange, effectiveStats.attackCooldown, effectiveStats.isRanged)
      );
    }

    if (stats.gatherRate && stats.gatherCapacity) {
      unit.addComponent('gatherer', new GathererComponent(unit, stats.gatherRate, stats.gatherCapacity));
    }

    this.entities.set(unit.entityId, unit);
    this.invalidateCaches();
    return unit;
  }

  spawnBuilding(
    tileX: number,
    tileY: number,
    buildingType: string,
    stats: BuildingStats,
    team: EntityTeam = 'player'
  ): Building | null {
    if (!this.validator.canPlace(tileX, tileY, stats.tileWidth, stats.tileHeight)) {
      return null;
    }

    // Apply reinforced_walls multiplier to enemy buildings
    let effectiveHp = stats.maxHp;
    if (team === 'enemy' && this.envEffects) {
      effectiveHp = Math.round(stats.maxHp * this.envEffects.enemyBuildingHpMult);
    }

    const building = new Building(tileX, tileY, buildingType, stats, team);
    building.addComponent('health', new HealthComponent(building, effectiveHp));

    if (stats.attackDamage && stats.attackRange && stats.attackCooldown) {
      building.addComponent(
        'combat',
        new CombatComponent(building, stats.attackDamage, stats.attackRange, stats.attackCooldown, true)
      );
    }

    const getAllEntities = () => this.getAllEntities();

    if (buildingType === 'drop_ship') {
      building.addComponent('aura', new AuraComponent(building, {
        healPerTick: 1,
        healRadius: 3,
        healInterval: 6000,
        goldPerTick: 1,
        goldInterval: 30000,
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
    } else if (buildingType === 'tarantula') {
      building.addComponent('aura', new AuraComponent(building, {
        slowPercent: 30,
        slowRadius: 4,
      }, getAllEntities));
    } else if (buildingType === 'aegis') {
      const health = building.getComponent<HealthComponent>('health');
      if (health) health.armor = 5;
      building.addComponent('aura', new AuraComponent(building, {
        armorBoost: 2,
        armorRadius: 3,
        selfRepairPerTick: 3,
        selfRepairInterval: 8000,
      }, getAllEntities));
    }

    this.validator.occupyTiles(tileX, tileY, stats.tileWidth, stats.tileHeight);
    this.entities.set(building.entityId, building);
    this.invalidateCaches();

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

  private handleUnitTrained({ unitType, stats, tileX, tileY, rallyX, rallyY }: {
    unitType: string; stats: UnitStats;
    tileX: number; tileY: number; rallyX?: number; rallyY?: number;
  }): void {
    const unit = this.spawnUnit(tileX, tileY, unitType, stats, 'player');
    // Move to rally point if set
    if (rallyX != null && rallyY != null) {
      EventBus.emit('request-path', { unit, targetX: rallyX, targetY: rallyY });
    }
  }

  private handleEntityDeath({ entity }: { entity: Entity }): void {
    if (entity instanceof Building) {
      this.validator.freeTiles(entity.tileX, entity.tileY, entity.tileWidth, entity.tileHeight);
    }
    this.entities.delete(entity.entityId);
    this.invalidateCaches();
    entity.destroyEntity();
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  getAllEntities(): Entity[] {
    if (!this.cachedAll) {
      this.cachedAll = Array.from(this.entities.values());
    }
    return this.cachedAll;
  }

  getUnits(team?: EntityTeam): Unit[] {
    if (!team) {
      return this.getAllEntities().filter((e): e is Unit => e instanceof Unit);
    }
    if (team === 'player') {
      if (!this.cachedPlayerUnits) {
        this.cachedPlayerUnits = this.getAllEntities().filter(
          (e): e is Unit => e instanceof Unit && e.team === 'player'
        );
      }
      return this.cachedPlayerUnits;
    }
    if (!this.cachedEnemyUnits) {
      this.cachedEnemyUnits = this.getAllEntities().filter(
        (e): e is Unit => e instanceof Unit && e.team === 'enemy'
      );
    }
    return this.cachedEnemyUnits;
  }

  getBuildings(team?: EntityTeam): Building[] {
    if (!team) {
      return this.getAllEntities().filter((e): e is Building => e instanceof Building);
    }
    if (team === 'player') {
      if (!this.cachedPlayerBuildings) {
        this.cachedPlayerBuildings = this.getAllEntities().filter(
          (e): e is Building => e instanceof Building && e.team === 'player'
        );
      }
      return this.cachedPlayerBuildings;
    }
    if (!this.cachedEnemyBuildings) {
      this.cachedEnemyBuildings = this.getAllEntities().filter(
        (e): e is Building => e instanceof Building && e.team === 'enemy'
      );
    }
    return this.cachedEnemyBuildings;
  }

  getEntitiesByTeam(team: EntityTeam): Entity[] {
    if (team === 'player') {
      if (!this.cachedPlayerEntities) {
        this.cachedPlayerEntities = this.getAllEntities().filter((e) => e.team === 'player');
      }
      return this.cachedPlayerEntities;
    }
    if (!this.cachedEnemyEntities) {
      this.cachedEnemyEntities = this.getAllEntities().filter((e) => e.team === 'enemy');
    }
    return this.cachedEnemyEntities;
  }

  getEntitiesAtTile(tileX: number, tileY: number): Entity[] {
    return this.getAllEntities().filter((e) => e.tileX === tileX && e.tileY === tileY);
  }

  getNearestEnemy(entity: Entity): Entity | null {
    const enemyTeam: EntityTeam = entity.team === 'player' ? 'enemy' : 'player';
    const enemies = this.getEntitiesByTeam(enemyTeam);

    let nearest: Entity | null = null;
    let minDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dist = Math.abs(entity.tileX - enemy.tileX) + Math.abs(entity.tileY - enemy.tileY);
      if (dist < minDist) {
        minDist = dist;
        nearest = enemy;
      }
    }
    return nearest;
  }

  /** Like getNearestEnemy but returns null if no enemy is within maxRange (Manhattan distance). */
  getNearestEnemyInRange(entity: Entity, maxRange: number): Entity | null {
    const enemyTeam: EntityTeam = entity.team === 'player' ? 'enemy' : 'player';
    const enemies = this.getEntitiesByTeam(enemyTeam);

    let nearest: Entity | null = null;
    let minDist = maxRange + 1;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
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
    this.invalidateCaches();
  }
}
