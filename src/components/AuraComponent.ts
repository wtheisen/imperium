import { Component, Entity } from '../entities/Entity';
import { HealthComponent } from './HealthComponent';
import { CombatComponent } from './CombatComponent';
import { MoverComponent } from './MoverComponent';
import { EventBus } from '../EventBus';
import { IsoHelper } from '../map/IsoHelper';

export interface AuraConfig {
  healPerTick?: number;       // HP healed to nearby friendlies per tick
  healRadius?: number;        // tile radius for heal aura
  healInterval?: number;      // ms between heals
  goldPerTick?: number;       // gold generated per tick
  goldInterval?: number;      // ms between gold ticks
  damageBoost?: number;       // +ATK to nearby friendlies
  boostRadius?: number;       // tile radius for damage boost
  extraCardDraw?: number;     // extra cards drawn per wave completion
  slowPercent?: number;        // % speed reduction on enemies in radius
  slowRadius?: number;
  armorBoost?: number;         // +armor to nearby friendlies
  armorRadius?: number;
  selfRepairPerTick?: number;  // HP self-repair per tick
  selfRepairInterval?: number;
}

export class AuraComponent implements Component {
  private entity: Entity;
  private config: AuraConfig;
  private healTimer: number = 0;
  private goldTimer: number = 0;
  private boostedEntities: Set<string> = new Set();
  private slowedEntities: Map<string, number> = new Map(); // entityId → original speed
  private armorBoostedEntities: Set<string> = new Set();
  private repairTimer: number = 0;
  private auraTimer: number = 0;
  private static readonly AURA_INTERVAL = 500; // ms between boost/slow/armor recalcs
  private getEntitiesFn: () => Entity[];

  constructor(entity: Entity, config: AuraConfig, getEntitiesFn: () => Entity[]) {
    this.entity = entity;
    this.config = config;
    this.getEntitiesFn = getEntitiesFn;

  }

  update(delta: number): void {
    if (!this.entity.active) return;

    // Heal aura
    if (this.config.healPerTick && this.config.healRadius) {
      this.healTimer += delta;
      const interval = this.config.healInterval || 5000;
      if (this.healTimer >= interval) {
        this.healTimer = 0;
        this.tickHeal();
      }
    }

    // Passive gold
    if (this.config.goldPerTick) {
      this.goldTimer += delta;
      const interval = this.config.goldInterval || 10000;
      if (this.goldTimer >= interval) {
        this.goldTimer = 0;
        EventBus.emit('gold-gathered', { amount: this.config.goldPerTick });
        this.showGoldPopup();
      }
    }

    // Throttled aura effects (boost/slow/armor)
    this.auraTimer += delta;
    if (this.auraTimer >= AuraComponent.AURA_INTERVAL) {
      this.auraTimer = 0;

      // Damage boost aura
      if (this.config.damageBoost && this.config.boostRadius) {
        this.tickDamageBoost();
      }

      // Slow aura (enemies)
      if (this.config.slowPercent && this.config.slowRadius) {
        this.tickSlow();
      }

      // Armor boost aura (friendlies)
      if (this.config.armorBoost && this.config.armorRadius) {
        this.tickArmorBoost();
      }
    }

    // Self-repair
    if (this.config.selfRepairPerTick) {
      this.repairTimer += delta;
      if (this.repairTimer >= (this.config.selfRepairInterval || 8000)) {
        this.repairTimer = 0;
        const health = this.entity.getComponent<HealthComponent>('health');
        if (health && health.currentHp < health.maxHp) {
          health.heal(this.config.selfRepairPerTick);
        }
      }
    }
  }

  private tickHeal(): void {
    const entities = this.getEntitiesFn();
    const radius = this.config.healRadius!;

    for (const e of entities) {
      if (e.team !== this.entity.team || e === this.entity) continue;
      if (!e.active) continue;

      const dist = IsoHelper.tileDistance(this.entity.tileX, this.entity.tileY, e.tileX, e.tileY);
      if (dist <= radius) {
        const health = e.getComponent<HealthComponent>('health');
        if (health && health.currentHp < health.maxHp) {
          health.heal(this.config.healPerTick!);
        }
      }
    }
  }

  private tickDamageBoost(): void {
    const entities = this.getEntitiesFn();
    const radius = this.config.boostRadius!;
    const boost = this.config.damageBoost!;
    const currentNearby = new Set<string>();

    for (const e of entities) {
      if (e.team !== this.entity.team || e === this.entity) continue;
      if (!e.active) continue;

      const dist = IsoHelper.tileDistance(this.entity.tileX, this.entity.tileY, e.tileX, e.tileY);
      const combat = e.getComponent<CombatComponent>('combat');
      if (!combat) continue;

      if (dist <= radius) {
        currentNearby.add(e.entityId);
        if (!this.boostedEntities.has(e.entityId)) {
          combat.setDamage(combat.getDamage() + boost);
          this.boostedEntities.add(e.entityId);
        }
      } else if (this.boostedEntities.has(e.entityId)) {
        combat.setDamage(Math.max(1, combat.getDamage() - boost));
        this.boostedEntities.delete(e.entityId);
      }
    }

    // Remove boost from entities no longer present (dead/despawned)
    if (this.boostedEntities.size > currentNearby.size) {
      for (const id of this.boostedEntities) {
        if (!currentNearby.has(id)) {
          // Entity is gone — boost was already on a now-dead entity, just drop tracking
          this.boostedEntities.delete(id);
        }
      }
    }
  }

  private tickSlow(): void {
    const entities = this.getEntitiesFn();
    const radius = this.config.slowRadius!;
    const slowFraction = this.config.slowPercent! / 100;
    const currentNearby = new Set<string>();

    for (const e of entities) {
      if (e.team === this.entity.team || e === this.entity) continue;
      if (!e.active) continue;

      const dist = IsoHelper.tileDistance(this.entity.tileX, this.entity.tileY, e.tileX, e.tileY);
      const mover = e.getComponent<MoverComponent>('mover');
      if (!mover) continue;

      if (dist <= radius) {
        currentNearby.add(e.entityId);
        if (!this.slowedEntities.has(e.entityId)) {
          const originalSpeed = mover.getSpeed();
          this.slowedEntities.set(e.entityId, originalSpeed);
          mover.setSpeed(originalSpeed * (1 - slowFraction));
        }
      } else if (this.slowedEntities.has(e.entityId)) {
        mover.setSpeed(this.slowedEntities.get(e.entityId)!);
        this.slowedEntities.delete(e.entityId);
      }
    }

    // Drop tracking for entities no longer present (dead/despawned)
    for (const [id] of this.slowedEntities) {
      if (!currentNearby.has(id)) {
        this.slowedEntities.delete(id);
      }
    }
  }

  private tickArmorBoost(): void {
    const entities = this.getEntitiesFn();
    const radius = this.config.armorRadius!;
    const boost = this.config.armorBoost!;
    const currentNearby = new Set<string>();

    for (const e of entities) {
      if (e.team !== this.entity.team || e === this.entity) continue;
      if (!e.active) continue;

      const dist = IsoHelper.tileDistance(this.entity.tileX, this.entity.tileY, e.tileX, e.tileY);
      const health = e.getComponent<HealthComponent>('health');
      if (!health) continue;

      if (dist <= radius) {
        currentNearby.add(e.entityId);
        if (!this.armorBoostedEntities.has(e.entityId)) {
          health.armor += boost;
          this.armorBoostedEntities.add(e.entityId);
        }
      } else if (this.armorBoostedEntities.has(e.entityId)) {
        health.armor = Math.max(0, health.armor - boost);
        this.armorBoostedEntities.delete(e.entityId);
      }
    }

    // Drop tracking for entities no longer present (dead/despawned)
    for (const id of this.armorBoostedEntities) {
      if (!currentNearby.has(id)) {
        this.armorBoostedEntities.delete(id);
      }
    }
  }

  private showGoldPopup(): void {
    EventBus.emit('floating-text-3d', { tileX: this.entity.tileX, tileY: this.entity.tileY, text: `+${this.config.goldPerTick}`, color: '#ffd700' });
  }

  getConfig(): AuraConfig {
    return this.config;
  }

  destroy(): void {
    try {
      const entities = this.getEntitiesFn();
      // Build id→entity map for O(1) lookups
      const entityMap = new Map<string, Entity>();
      for (const e of entities) entityMap.set(e.entityId, e);

      // Remove damage boosts
      if (this.config.damageBoost) {
        for (const id of this.boostedEntities) {
          const e = entityMap.get(id);
          if (e) {
            const combat = e.getComponent<CombatComponent>('combat');
            if (combat) combat.setDamage(Math.max(1, combat.getDamage() - this.config.damageBoost));
          }
        }
      }

      // Restore slowed entities
      if (this.config.slowPercent) {
        for (const [id, originalSpeed] of this.slowedEntities) {
          const e = entityMap.get(id);
          if (e) {
            const mover = e.getComponent<MoverComponent>('mover');
            if (mover) mover.setSpeed(originalSpeed);
          }
        }
      }

      // Remove armor boosts
      if (this.config.armorBoost) {
        for (const id of this.armorBoostedEntities) {
          const e = entityMap.get(id);
          if (e) {
            const health = e.getComponent<HealthComponent>('health');
            if (health) health.armor = Math.max(0, health.armor - this.config.armorBoost);
          }
        }
      }
    } catch (_e) {
      // Entity manager may be destroyed already
    }

    this.boostedEntities.clear();
    this.slowedEntities.clear();
    this.armorBoostedEntities.clear();
  }
}
