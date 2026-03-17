import { Component, Entity } from '../entities/Entity';
import { HealthComponent } from './HealthComponent';
import { CombatComponent } from './CombatComponent';
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
}

export class AuraComponent implements Component {
  private entity: Entity;
  private config: AuraConfig;
  private healTimer: number = 0;
  private goldTimer: number = 0;
  private boostedEntities: Set<string> = new Set();
  private getEntitiesFn: () => Entity[];

  constructor(entity: Entity, config: AuraConfig, getEntitiesFn: () => Entity[]) {
    this.entity = entity;
    this.config = config;
    this.getEntitiesFn = getEntitiesFn;

    if (this.config.extraCardDraw) {
      EventBus.on('wave-completed', this.onWaveCompleted, this);
    }
  }

  private onWaveCompleted(): void {
    if (this.config.extraCardDraw && this.entity.active) {
      EventBus.emit('bonus-draws', { count: this.config.extraCardDraw });
    }
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

    // Damage boost aura
    if (this.config.damageBoost && this.config.boostRadius) {
      this.tickDamageBoost();
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

    // Remove boost from entities no longer present
    for (const id of this.boostedEntities) {
      if (!currentNearby.has(id)) {
        const e = entities.find(en => en.entityId === id);
        if (e) {
          const combat = e.getComponent<CombatComponent>('combat');
          if (combat) combat.setDamage(Math.max(1, combat.getDamage() - boost));
        }
        this.boostedEntities.delete(id);
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
    // Remove boosts from all entities
    if (this.config.damageBoost) {
      try {
        const entities = this.getEntitiesFn();
        for (const id of this.boostedEntities) {
          const e = entities.find(en => en.entityId === id);
          if (e) {
            const combat = e.getComponent<CombatComponent>('combat');
            if (combat) combat.setDamage(Math.max(1, combat.getDamage() - this.config.damageBoost));
          }
        }
      } catch (_e) {
        // Entity manager may be destroyed already
      }
    }
    this.boostedEntities.clear();

    if (this.config.extraCardDraw) {
      EventBus.off('wave-completed', this.onWaveCompleted, this);
    }
  }
}
