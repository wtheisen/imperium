import { Card } from './Card';
import { Unit } from '../entities/Unit';
import { CombatComponent } from '../components/CombatComponent';
import { GathererComponent } from '../components/GathererComponent';
import { MAX_ACTIVE_DOCTRINES } from '../config';
import { EventBus } from '../EventBus';

export class DoctrineManager {
  private activeDoctrines: Card[] = [];
  private vanguardUsedThisObjective: boolean = false;

  addDoctrine(card: Card): { added: boolean; replaced?: Card } {
    if (card.type !== 'doctrine') return { added: false };

    if (this.activeDoctrines.length >= MAX_ACTIVE_DOCTRINES) {
      // Emit event asking which doctrine to replace
      EventBus.emit('doctrine-replace-needed', { newDoctrine: card });
      return { added: false };
    }

    this.activeDoctrines.push(card);
    return { added: true };
  }

  replaceDoctrine(index: number, newCard: Card): Card | null {
    if (index < 0 || index >= this.activeDoctrines.length) return null;
    const removed = this.activeDoctrines[index];
    this.activeDoctrines[index] = newCard;
    return removed;
  }

  removeDoctrine(cardId: string): void {
    this.activeDoctrines = this.activeDoctrines.filter((d) => d.id !== cardId);
  }

  getActiveDoctrines(): Card[] {
    return [...this.activeDoctrines];
  }

  applyModifiers(unit: Unit): void {
    for (const doctrine of this.activeDoctrines) {
      if (doctrine.doctrineFilter && doctrine.doctrineFilter !== 'all' && doctrine.doctrineFilter !== unit.unitType) {
        continue;
      }

      switch (doctrine.doctrineEffect) {
        case 'damage_boost': {
          const combat = unit.getComponent<CombatComponent>('combat');
          if (combat) {
            combat.setDamage(combat.getDamage() + (doctrine.doctrineValue || 0));
          }
          break;
        }
        case 'gather_speed': {
          const gatherer = unit.getComponent<GathererComponent>('gatherer');
          if (gatherer) {
            gatherer.setGatherRate(gatherer.getGatherRate() * (doctrine.doctrineValue || 1));
          }
          break;
        }
        case 'armor_boost': {
          // Shield of Faith — +1 armor to all units
          // Applied via HealthComponent if it supports armor, or skip if not
          break;
        }
        case 'attack_speed': {
          const combat = unit.getComponent<CombatComponent>('combat');
          if (combat) {
            const currentCd = combat.getCooldown();
            combat.setCooldown(currentCd * (1 - (doctrine.doctrineValue || 0)));
          }
          break;
        }
      }
    }
  }

  getDamageBonus(unitType: string): number {
    let bonus = 0;
    for (const doctrine of this.activeDoctrines) {
      if (doctrine.doctrineEffect === 'damage_boost') {
        if (!doctrine.doctrineFilter || doctrine.doctrineFilter === 'all' || doctrine.doctrineFilter === unitType) {
          bonus += doctrine.doctrineValue || 0;
        }
      }
    }
    return bonus;
  }

  getGatherMultiplier(unitType: string): number {
    let multiplier = 1;
    for (const doctrine of this.activeDoctrines) {
      if (doctrine.doctrineEffect === 'gather_speed') {
        if (!doctrine.doctrineFilter || doctrine.doctrineFilter === 'all' || doctrine.doctrineFilter === unitType) {
          multiplier *= doctrine.doctrineValue || 1;
        }
      }
    }
    return multiplier;
  }

  // --- Doctrine-specific queries ---

  /** Tithe Collector — gold per card played */
  getOnCardPlayedGold(): number {
    let gold = 0;
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'tithe_collector') {
        gold += d.doctrineValue || 0;
      }
    }
    return gold;
  }

  /** Scavenger Rites — bonus gold per enemy killed */
  getOnEnemyKilledGold(): number {
    let gold = 0;
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'scavenger_rites') {
        gold += d.doctrineValue || 0;
      }
    }
    return gold;
  }

  /** War Spoils — objective gold reward multiplier */
  getObjectiveGoldMultiplier(): number {
    let mult = 1;
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'war_spoils') {
        mult *= d.doctrineValue || 1;
      }
    }
    return mult;
  }

  /** Overwatch Protocol — building attack speed multiplier */
  getBuildingAttackSpeedMult(): number {
    let mult = 1;
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'overwatch_protocol') {
        mult *= d.doctrineValue || 1;
      }
    }
    return mult;
  }

  /** Fortification Doctrine — building HP multiplier */
  getBuildingHpMult(): number {
    let mult = 1;
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'fortification') {
        mult *= d.doctrineValue || 1;
      }
    }
    return mult;
  }

  /** Requisition Officer — hand size bonus */
  getHandSizeBonus(): number {
    let bonus = 0;
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'requisition_officer') {
        bonus += d.doctrineValue || 0;
      }
    }
    return bonus;
  }

  /** Combat Resupply — discard bonus per objective */
  getDiscardBonus(): number {
    let bonus = 0;
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'combat_resupply') {
        bonus += d.doctrineValue || 0;
      }
    }
    return bonus;
  }

  /** Vanguard Deployment — first unit free this objective? */
  isVanguardActive(): boolean {
    if (this.vanguardUsedThisObjective) return false;
    return this.activeDoctrines.some((d) => d.doctrineEffect === 'vanguard_deployment');
  }

  consumeVanguard(): void {
    this.vanguardUsedThisObjective = true;
  }

  /** Drop Pod Assault — invulnerability duration for spawned units */
  getSpawnInvulnerability(): number {
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'drop_pod_assault') {
        return d.doctrineValue || 0;
      }
    }
    return 0;
  }

  /** Combined Arms — bonus damage when ranged + melee near each other */
  getCombinedArmsBonus(): number {
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'combined_arms') {
        return d.doctrineValue || 0;
      }
    }
    return 0;
  }

  /** Apothecary Protocols — out-of-combat heal per tick */
  getPassiveHealRate(): { hpPerTick: number; intervalMs: number } | null {
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'apothecary_protocols') {
        return { hpPerTick: d.doctrineValue || 1, intervalMs: 5000 };
      }
    }
    return null;
  }

  /** Fall Back! — speed boost threshold and amount */
  getFallBackBoost(): { threshold: number; speedMult: number } | null {
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'fall_back') {
        return { threshold: 0.25, speedMult: d.doctrineValue || 1.3 };
      }
    }
    return null;
  }

  /** Gene Seed — respawn chance for marines */
  getRespawnChance(): number {
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'gene_seed') {
        return d.doctrineValue || 0;
      }
    }
    return 0;
  }

  /** Suppressing Fire — slow chance for ranged units */
  getSuppressingFireChance(): number {
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'suppressing_fire') {
        return d.doctrineValue || 0;
      }
    }
    return 0;
  }

  /** Auspex Sweep — vision radius bonus */
  getVisionBonus(): number {
    let bonus = 0;
    for (const d of this.activeDoctrines) {
      if (d.doctrineEffect === 'auspex_sweep') {
        bonus += d.doctrineValue || 0;
      }
    }
    return bonus;
  }

  /** Called on objective start/completion to reset per-objective state */
  onObjectiveStart(): void {
    this.vanguardUsedThisObjective = false;
  }

  /** Check if a specific doctrine effect is active */
  hasEffect(effectId: string): boolean {
    return this.activeDoctrines.some((d) => d.doctrineEffect === effectId);
  }
}
