import { Card } from './Card';
import { EntityManager } from '../systems/EntityManager';
import { EconomySystem } from '../systems/EconomySystem';
import { DoctrineManager } from './DoctrineManager';
import { HealthComponent } from '../components/HealthComponent';
import { CombatComponent } from '../components/CombatComponent';
import { MoverComponent } from '../components/MoverComponent';
import { IsoHelper } from '../map/IsoHelper';
import { Unit, UnitStats } from '../entities/Unit';
import { BuildingStats } from '../entities/Building';
import { applyTechTreeBonuses } from '../state/TechTreeEffects';
import { LevelBadgeComponent } from '../components/LevelBadgeComponent';
import { EquipmentComponent } from '../components/EquipmentComponent';
import { EventBus } from '../EventBus';
import { TimerManager } from '../utils/TimerManager';
import { getActiveModifiers } from '../state/PlayerState';
import { getMergedEffects } from '../state/DifficultyModifiers';

/** Per-model stats. Total HP/damage = per-model × squadSize. */
const UNIT_STATS: Record<string, UnitStats> = {
  servitor: { maxHp: 25, speed: 2, attackDamage: 3, attackRange: 1, attackCooldown: 1500, isRanged: false, gatherRate: 0.8, gatherCapacity: 6, squadSize: 1 },
  guardsman: { maxHp: 30, speed: 2.5, attackDamage: 5, attackRange: 3, attackCooldown: 1200, isRanged: true, squadSize: 6 },
  marine: { maxHp: 60, speed: 1.8, attackDamage: 10, attackRange: 1, attackCooldown: 1000, isRanged: false, squadSize: 4 },
  scout: { maxHp: 20, speed: 4, attackDamage: 3, attackRange: 1, attackCooldown: 1500, isRanged: false, squadSize: 3 },
  ogryn: { maxHp: 120, speed: 1.2, attackDamage: 15, attackRange: 1, attackCooldown: 1400, isRanged: false, squadSize: 1 },
  techmarine: { maxHp: 50, speed: 1.8, attackDamage: 7, attackRange: 1, attackCooldown: 1200, isRanged: false, squadSize: 1 },
  rhino: { maxHp: 150, speed: 3.5, attackDamage: 6, attackRange: 2, attackCooldown: 1200, isRanged: true, squadSize: 1 },
  leman_russ: { maxHp: 250, speed: 1.0, attackDamage: 25, attackRange: 5, attackCooldown: 2500, isRanged: true, squadSize: 1 },
  sentinel: { maxHp: 70, speed: 3.8, attackDamage: 8, attackRange: 4, attackCooldown: 1000, isRanged: true, squadSize: 1 },
};

const BUILDING_STATS: Record<string, BuildingStats> = {
  tarantula: { maxHp: 80, tileWidth: 1, tileHeight: 1, attackDamage: 8, attackRange: 4, attackCooldown: 1500 },
  aegis: { maxHp: 150, tileWidth: 1, tileHeight: 1 },
  barracks: { maxHp: 120, tileWidth: 2, tileHeight: 2 },
  drop_ship: { maxHp: 200, tileWidth: 2, tileHeight: 2 },
  sanctum: { maxHp: 80, tileWidth: 1, tileHeight: 1 },
};

export class CardEffects {
  private entityManager: EntityManager;
  private economy: EconomySystem;
  private doctrineManager: DoctrineManager;

  constructor(entityManager: EntityManager, economy: EconomySystem, doctrineManager: DoctrineManager) {
    this.entityManager = entityManager;
    this.economy = economy;
    this.doctrineManager = doctrineManager;
  }

  execute(card: Card, tileX: number, tileY: number): boolean {
    let vanguardFree = false;
    if (card.type === 'unit' && this.doctrineManager.isVanguardActive()) {
      vanguardFree = true;
    }

    if (!vanguardFree && !this.economy.canAfford(card.cost)) return false;

    let success = false;

    switch (card.type) {
      case 'unit':
        success = this.spawnUnit(card, tileX, tileY);
        break;
      case 'building':
        success = this.spawnBuilding(card, tileX, tileY);
        break;
      case 'ordnance':
        success = this.castOrdnance(card, tileX, tileY);
        break;
      case 'doctrine':
        success = this.activateDoctrine(card);
        break;
      case 'equipment':
        success = this.equipUnit(card, tileX, tileY);
        break;
    }

    if (success) {
      if (vanguardFree) {
        this.doctrineManager.consumeVanguard();
      } else {
        this.economy.spend(card.cost);
      }
    }

    return success;
  }

  private spawnUnit(card: Card, tileX: number, tileY: number): boolean {
    const baseStats = UNIT_STATS[card.entityType || ''];
    if (!baseStats) return false;

    // Scale total HP and damage by squad size
    const sq = baseStats.squadSize || 1;
    const effects = getMergedEffects(getActiveModifiers());
    const hpMult = effects.playerHpMult ?? 1;
    const stats: UnitStats = {
      ...baseStats,
      maxHp: Math.round(baseStats.maxHp * sq * hpMult),
      attackDamage: baseStats.attackDamage * sq,
    };

    const unit = this.entityManager.spawnUnit(
      tileX, tileY,
      card.texture || 'unit-default',
      card.entityType || 'unit',
      stats,
      'player'
    );

    this.doctrineManager.applyModifiers(unit);
    applyTechTreeBonuses(unit, this.entityManager);
    unit.addComponent('levelBadge', new LevelBadgeComponent(unit));

    // Drop Pod Assault — spawn invulnerability
    const invulnMs = this.doctrineManager.getSpawnInvulnerability();
    if (invulnMs > 0) {
      const health = unit.getComponent<HealthComponent>('health');
      if (health) {
        health.setInvulnerable(true);
        TimerManager.get().schedule(invulnMs, () => {
          if (unit.active) {
            health.setInvulnerable(false);
          }
        });
      }
    }

    return true;
  }

  private spawnBuilding(card: Card, tileX: number, tileY: number): boolean {
    const stats = BUILDING_STATS[card.entityType || ''];
    if (!stats) return false;

    const hpMult = this.doctrineManager.getBuildingHpMult();
    const modifiedStats = hpMult !== 1
      ? { ...stats, maxHp: Math.round(stats.maxHp * hpMult) }
      : stats;

    const building = this.entityManager.spawnBuilding(
      tileX, tileY,
      card.texture || 'building-default',
      card.entityType || 'building',
      modifiedStats,
      'player'
    );

    return building !== null;
  }

  private castOrdnance(card: Card, tileX: number, tileY: number): boolean {
    switch (card.ordnanceEffect) {
      case 'narthecium':
        return this.ordnanceHeal(tileX, tileY, card.ordnanceRadius || 5, card.ordnanceValue || 20);
      case 'lance_strike':
        return this.ordnanceBarrage(tileX, tileY, card.ordnanceRadius || 3, card.ordnanceValue || 30);
      case 'blessed_armour':
        return this.ordnanceReinforce(tileX, tileY, card.ordnanceValue || 5);
      case 'stasis':
        return this.ordnanceStasis(tileX, tileY, card.ordnanceRadius || 3, card.ordnanceValue || 4000);
      case 'vortex':
        return this.ordnanceVortex(tileX, tileY, card.ordnanceRadius || 4, card.ordnanceValue || 40);
      case 'rally':
        return this.ordnanceRally(tileX, tileY, card.ordnanceRadius || 4, card.ordnanceValue || 5000);
      case 'smoke':
        return this.ordnanceSmoke(tileX, tileY, card.ordnanceRadius || 3, card.ordnanceValue || 5000);
      default:
        return false;
    }
  }

  private ordnanceHeal(tileX: number, tileY: number, radius: number, value: number): boolean {
    const entities = this.entityManager.getEntitiesByTeam('player');
    let healed = false;
    for (const entity of entities) {
      if (IsoHelper.tileDistance(entity.tileX, entity.tileY, tileX, tileY) <= radius) {
        const health = entity.getComponent<HealthComponent>('health');
        if (health) {
          health.heal(value);
          healed = true;
        }
      }
    }
    if (healed) {
      EventBus.emit('ordnance-vfx-3d', { type: 'heal', tileX, tileY, radius });
    }
    return true;
  }

  private ordnanceBarrage(tileX: number, tileY: number, radius: number, value: number): boolean {
    const entities = this.entityManager.getEntitiesByTeam('enemy');
    for (const entity of entities) {
      if (IsoHelper.tileDistance(entity.tileX, entity.tileY, tileX, tileY) <= radius) {
        const health = entity.getComponent<HealthComponent>('health');
        if (health) {
          health.takeDamage(value);
        }
      }
    }
    EventBus.emit('ordnance-vfx-3d', { type: 'fireball', tileX, tileY, radius });
    return true;
  }

  private ordnanceReinforce(tileX: number, tileY: number, value: number): boolean {
    const entities = this.entityManager.getEntitiesAtTile(tileX, tileY);
    const playerUnit = entities.find((e) => e.team === 'player');
    if (!playerUnit) return false;

    const health = playerUnit.getComponent<HealthComponent>('health');
    if (health) {
      health.maxHp += value;
      health.heal(health.maxHp);
    }
    return true;
  }

  private ordnanceStasis(tileX: number, tileY: number, radius: number, durationMs: number): boolean {
    const entities = this.entityManager.getEntitiesByTeam('enemy');
    for (const entity of entities) {
      if (IsoHelper.tileDistance(entity.tileX, entity.tileY, tileX, tileY) <= radius) {
        const mover = entity.getComponent<MoverComponent>('mover');
        const combat = entity.getComponent<CombatComponent>('combat');
        if (mover) {
          const oldSpeed = mover.getSpeed();
          mover.setSpeed(0);
          mover.stop();
          const oldCd = combat ? combat.getCooldown() : 0;
          if (combat) combat.setCooldown(999999);
          TimerManager.get().schedule(durationMs, () => {
            if (entity.active) {
              mover.setSpeed(oldSpeed);
              if (combat) combat.setCooldown(oldCd);
            }
          });
        }
      }
    }
    EventBus.emit('ordnance-vfx-3d', { type: 'stasis', tileX, tileY, radius, durationMs });
    return true;
  }

  private ordnanceVortex(tileX: number, tileY: number, radius: number, damage: number): boolean {
    const entities = this.entityManager.getEntitiesByTeam('enemy');
    for (const entity of entities) {
      const dist = IsoHelper.tileDistance(entity.tileX, entity.tileY, tileX, tileY);
      if (dist <= radius) {
        const health = entity.getComponent<HealthComponent>('health');
        if (health) {
          health.takeDamage(damage);
        }
        if (dist > 0 && entity.active) {
          const dx = tileX - entity.tileX;
          const dy = tileY - entity.tileY;
          const len = Math.sqrt(dx * dx + dy * dy);
          const pullDist = Math.min(2, dist);
          const newX = Math.round(entity.tileX + (dx / len) * pullDist);
          const newY = Math.round(entity.tileY + (dy / len) * pullDist);
          if (IsoHelper.isInBounds(newX, newY)) {
            entity.tileX = newX;
            entity.tileY = newY;
            entity.updateScreenPosition();
          }
        }
      }
    }
    EventBus.emit('ordnance-vfx-3d', { type: 'vortex', tileX, tileY, radius });
    return true;
  }

  private ordnanceRally(tileX: number, tileY: number, radius: number, durationMs: number): boolean {
    const entities = this.entityManager.getEntitiesByTeam('player');
    for (const entity of entities) {
      if (IsoHelper.tileDistance(entity.tileX, entity.tileY, tileX, tileY) <= radius) {
        const mover = entity.getComponent<MoverComponent>('mover');
        if (mover) {
          const oldSpeed = mover.getSpeed();
          mover.setSpeed(oldSpeed * 1.5);
          TimerManager.get().schedule(durationMs, () => {
            if (entity.active) mover.setSpeed(oldSpeed);
          });
        }
      }
    }
    EventBus.emit('ordnance-vfx-3d', { type: 'heal', tileX, tileY, radius });
    return true;
  }

  private ordnanceSmoke(tileX: number, tileY: number, radius: number, durationMs: number): boolean {
    const entities = this.entityManager.getEntitiesByTeam('enemy');
    for (const entity of entities) {
      if (IsoHelper.tileDistance(entity.tileX, entity.tileY, tileX, tileY) <= radius) {
        const mover = entity.getComponent<MoverComponent>('mover');
        const combat = entity.getComponent<CombatComponent>('combat');
        if (mover) {
          const oldSpeed = mover.getSpeed();
          mover.setSpeed(oldSpeed * 0.3);
          const oldCd = combat ? combat.getCooldown() : 0;
          if (combat) combat.setCooldown(oldCd * 3);
          TimerManager.get().schedule(durationMs, () => {
            if (entity.active) {
              mover.setSpeed(oldSpeed);
              if (combat) combat.setCooldown(oldCd);
            }
          });
        }
      }
    }
    EventBus.emit('ordnance-vfx-3d', { type: 'stasis', tileX, tileY, radius, durationMs });
    return true;
  }

  private equipUnit(card: Card, tileX: number, tileY: number): boolean {
    const units = this.entityManager.getUnits('player');
    let best: Unit | null = null;
    let bestDist = Infinity;
    for (const u of units) {
      if (!u.active) continue;
      if (card.equipFilter) {
        const allowed = card.equipFilter.split(',').map(s => s.trim());
        if (!allowed.includes(u.unitType)) continue;
      }
      const d = Math.abs(u.tileX - tileX) + Math.abs(u.tileY - tileY);
      if (d <= 1 && d < bestDist) { best = u; bestDist = d; }
    }
    if (!best) return false;

    let equip = best.getComponent<EquipmentComponent>('equipment');
    if (!equip) {
      equip = new EquipmentComponent(best, this.entityManager);
      best.addComponent('equipment', equip);
    }
    return equip.equip(card);
  }

  private activateDoctrine(card: Card): boolean {
    const result = this.doctrineManager.addDoctrine(card);
    if (!result.added) return false;

    const units = this.entityManager.getUnits('player');
    for (const unit of units) {
      this.doctrineManager.applyModifiers(unit);
    }

    EventBus.emit('doctrines-changed', { doctrines: this.doctrineManager.getActiveDoctrines() });
    return true;
  }

  static getUnitStats(unitType: string): UnitStats | undefined {
    return UNIT_STATS[unitType];
  }

  static getBuildingStats(buildingType: string): BuildingStats | undefined {
    return BUILDING_STATS[buildingType];
  }
}
