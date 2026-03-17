import { Component, Entity } from '../entities/Entity';
import { Card } from '../cards/Card';
import { Unit } from '../entities/Unit';
import { HealthComponent } from './HealthComponent';
import { CombatComponent } from './CombatComponent';
import { MoverComponent } from './MoverComponent';
import { TechPassiveComponent } from './TechPassiveComponent';
import { AbilityComponent, AbilityDefinition } from './AbilityComponent';
import { IsoHelper } from '../map/IsoHelper';
import { EventBus } from '../EventBus';
import { EntityManager } from '../systems/EntityManager';

const MAX_SLOTS = 2;

interface AppliedEffects {
  card: Card;
  statReverts: Array<() => void>;
  passiveIds: string[];
  abilityId: string | null;
}

export class EquipmentComponent implements Component {
  private unit: Unit;
  private equipped: Card[] = [];
  private appliedEffects: AppliedEffects[] = [];
  private entityManager: EntityManager | null = null;

  constructor(unit: Unit, entityManager?: EntityManager) {
    this.unit = unit;
    this.entityManager = entityManager || null;
  }

  setEntityManager(em: EntityManager): void {
    this.entityManager = em;
  }

  canEquip(card: Card): boolean {
    if (this.equipped.length >= MAX_SLOTS) return false;
    if (card.equipFilter) {
      const allowed = card.equipFilter.split(',').map(s => s.trim());
      if (!allowed.includes(this.unit.unitType)) return false;
    }
    return true;
  }

  equip(card: Card): boolean {
    if (!this.canEquip(card)) return false;
    this.equipped.push(card);

    const effects: AppliedEffects = {
      card,
      statReverts: [],
      passiveIds: [],
      abilityId: null,
    };

    // Apply wargear data if present
    if (card.wargear) {
      this.applyWargear(card, effects);
    } else {
      // Legacy path for old equipment cards
      this.applyLegacyEffect(card, effects);
    }

    this.appliedEffects.push(effects);

    // VFX: gold sparkle text "+EQUIPPED"
    this.spawnFloatingText('+EQUIPPED', '#ffd700');

    return true;
  }

  unequip(slotIndex: number): Card | null {
    if (slotIndex < 0 || slotIndex >= this.equipped.length) return null;

    const card = this.equipped.splice(slotIndex, 1)[0];
    const effects = this.appliedEffects.splice(slotIndex, 1)[0];

    if (effects) {
      // Revert all stat changes
      for (const revert of effects.statReverts) {
        revert();
      }

      // Remove wargear passives
      const techPassive = this.unit.getComponent<TechPassiveComponent>('techPassive');
      if (techPassive) {
        for (const pid of effects.passiveIds) {
          techPassive.removePassive(pid);
        }
      }

      // Remove wargear ability
      if (effects.abilityId) {
        const abilityComp = this.unit.getComponent<AbilityComponent>('ability');
        if (abilityComp) {
          abilityComp.removeAbility(effects.abilityId);
        }
      }
    }

    // VFX
    this.spawnFloatingText('-UNEQUIPPED', '#aaaaaa');

    return card;
  }

  private applyWargear(card: Card, effects: AppliedEffects): void {
    const wg = card.wargear!;

    // Stat boosts
    if (wg.statBoosts) {
      for (const boost of wg.statBoosts) {
        this.applyStatBoost(boost.stat, boost.value, boost.mode, effects);
      }
    }

    // Passives
    if (wg.passives) {
      let techPassive = this.unit.getComponent<TechPassiveComponent>('techPassive');
      if (!techPassive) {
        techPassive = new TechPassiveComponent(this.unit, [], []);
        this.unit.addComponent('techPassive', techPassive);
      }
      for (const passive of wg.passives) {
        techPassive.addPassive(passive.id, passive.params);
        effects.passiveIds.push(passive.id);
      }
    }

    // Ability
    if (wg.ability) {
      const abDef: AbilityDefinition = {
        id: wg.ability.id,
        name: wg.ability.name,
        hotkey: wg.ability.hotkey,
        cooldown: wg.ability.cooldown,
        color: wg.ability.color,
        params: wg.ability.params,
      };

      let abilityComp = this.unit.getComponent<AbilityComponent>('ability');
      if (!abilityComp) {
        if (this.entityManager) {
          abilityComp = new AbilityComponent(this.unit, [], this.entityManager);
          this.unit.addComponent('ability', abilityComp);
        }
      }
      if (abilityComp) {
        abilityComp.addAbility(abDef);
        effects.abilityId = wg.ability.id;
      }
    }
  }

  private applyStatBoost(stat: string, value: number, mode: string, effects: AppliedEffects): void {
    switch (stat) {
      case 'damage': {
        const combat = this.unit.getComponent<CombatComponent>('combat');
        if (combat) {
          const old = combat.getDamage();
          const newVal = mode === 'multiplicative' ? old * value : old + value;
          combat.setDamage(newVal);
          effects.statReverts.push(() => {
            if (mode === 'multiplicative') {
              combat.setDamage(combat.getDamage() / value);
            } else {
              combat.setDamage(combat.getDamage() - value);
            }
          });
        }
        break;
      }
      case 'hp': {
        const health = this.unit.getComponent<HealthComponent>('health');
        if (health) {
          health.maxHp += value;
          health.heal(value);
          effects.statReverts.push(() => {
            health.maxHp -= value;
            health.currentHp = Math.min(health.currentHp, health.maxHp);
          });
        }
        break;
      }
      case 'speed': {
        const mover = this.unit.getComponent<MoverComponent>('mover');
        if (mover) {
          if (mode === 'multiplicative') {
            const oldSpeed = mover.getSpeed();
            mover.setSpeed(oldSpeed * value);
            effects.statReverts.push(() => {
              mover.setSpeed(mover.getSpeed() / value);
            });
          } else {
            mover.setSpeed(mover.getSpeed() + value);
            effects.statReverts.push(() => {
              mover.setSpeed(mover.getSpeed() - value);
            });
          }
        }
        break;
      }
      case 'range': {
        const combat = this.unit.getComponent<CombatComponent>('combat');
        if (combat) {
          combat.setRange(combat.getRange() + value);
          effects.statReverts.push(() => {
            combat.setRange(combat.getRange() - value);
          });
        }
        break;
      }
      case 'armor': {
        const health = this.unit.getComponent<HealthComponent>('health');
        if (health) {
          health.armor += value;
          effects.statReverts.push(() => {
            health.armor -= value;
          });
        }
        break;
      }
      case 'vision': {
        // Vision boost tracked via TechPassiveComponent wargear passives
        // Store as a stat revert for potential future use
        effects.statReverts.push(() => {});
        break;
      }
    }
  }

  private applyLegacyEffect(card: Card, effects: AppliedEffects): void {
    const value = card.equipValue || 0;
    switch (card.equipEffect) {
      case 'damage_boost': {
        const combat = this.unit.getComponent<CombatComponent>('combat');
        if (combat) {
          combat.setDamage(combat.getDamage() + value);
          effects.statReverts.push(() => combat.setDamage(combat.getDamage() - value));
        }
        break;
      }
      case 'hp_boost': {
        const health = this.unit.getComponent<HealthComponent>('health');
        if (health) {
          health.maxHp += value;
          health.heal(value);
          effects.statReverts.push(() => {
            health.maxHp -= value;
            health.currentHp = Math.min(health.currentHp, health.maxHp);
          });
        }
        break;
      }
      case 'speed_boost': {
        const mover = this.unit.getComponent<MoverComponent>('mover');
        if (mover) {
          const oldSpeed = mover.getSpeed();
          mover.setSpeed(oldSpeed * value);
          effects.statReverts.push(() => {
            mover.setSpeed(mover.getSpeed() / value);
          });
        }
        break;
      }
      case 'range_boost': {
        const combat = this.unit.getComponent<CombatComponent>('combat');
        if (combat) {
          combat.setRange(combat.getRange() + value);
          effects.statReverts.push(() => {
            combat.setRange(combat.getRange() - value);
          });
        }
        break;
      }
    }
  }

  private spawnFloatingText(label: string, color: string): void {
    EventBus.emit('floating-text-3d', { tileX: this.unit.tileX, tileY: this.unit.tileY, text: label, color });
  }

  getEquipped(): Card[] {
    return [...this.equipped];
  }

  hasSlot(): boolean {
    return this.equipped.length < MAX_SLOTS;
  }

  getSlotCount(): number {
    return this.equipped.length;
  }

  update(_delta: number): void {}

  destroy(): void {
    // Orphan equipped cards so they return to discard pile
    for (const card of this.equipped) {
      EventBus.emit('wargear-orphaned', { card });
    }
    this.equipped = [];
    this.appliedEffects = [];
  }
}
