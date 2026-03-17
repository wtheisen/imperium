import { Unit } from '../entities/Unit';
import { getPlayerState } from './PlayerState';
import { TECH_TREES } from './TechTreeData';
import { TechNode, TechNodeEffect } from './TechTree';
import { HealthComponent } from '../components/HealthComponent';
import { CombatComponent } from '../components/CombatComponent';
import { MoverComponent } from '../components/MoverComponent';
import { GathererComponent } from '../components/GathererComponent';
import { TechPassiveComponent } from '../components/TechPassiveComponent';
import { attachAbilities } from '../components/AbilityComponent';
import { EntityManager } from '../systems/EntityManager';

export function applyTechTreeBonuses(unit: Unit, entityManager?: EntityManager): void {
  const state = getPlayerState();
  const tree = TECH_TREES[unit.unitType] || [];
  const unlocked = tree.filter(n => state.unlockedNodes.has(n.id));

  if (unlocked.length === 0) return;

  const passiveIds: string[] = [];
  const triggeredIds: { id: string; trigger: string }[] = [];

  for (const node of unlocked) {
    applyNodeEffect(unit, node);

    // Collect passives/triggered from primary effect
    if (node.effect.type === 'passive') {
      passiveIds.push(node.effect.id);
    } else if (node.effect.type === 'triggered') {
      triggeredIds.push({ id: node.effect.id, trigger: node.effect.trigger });
    }

    // Process bonusEffects (merged tier 3 effects)
    if (node.bonusEffects) {
      for (const bonus of node.bonusEffects) {
        applyBonusEffect(unit, bonus);
        if (bonus.type === 'passive') {
          passiveIds.push(bonus.id);
        } else if (bonus.type === 'triggered') {
          triggeredIds.push({ id: bonus.id, trigger: bonus.trigger });
        }
      }
    }
  }

  if (passiveIds.length > 0 || triggeredIds.length > 0) {
    unit.addComponent('techPassive', new TechPassiveComponent(unit, passiveIds, triggeredIds));
  }

  // Attach active abilities if entityManager provided
  if (entityManager) {
    attachAbilities(unit, entityManager);
  }
}

function applyBonusEffect(unit: Unit, eff: TechNodeEffect): void {
  if (eff.type !== 'stat_boost') return;
  applyStatBoost(unit, eff);
}

function applyNodeEffect(unit: Unit, node: TechNode): void {
  const eff = node.effect;
  if (eff.type !== 'stat_boost') return;
  applyStatBoost(unit, eff);
}

function applyStatBoost(unit: Unit, eff: { type: 'stat_boost'; stat: string; value: number; mode: 'flat' | 'percent' }): void {
  const health = unit.getComponent<HealthComponent>('health');
  const combat = unit.getComponent<CombatComponent>('combat');
  const mover = unit.getComponent<MoverComponent>('mover');
  const gatherer = unit.getComponent<GathererComponent>('gatherer');

  switch (eff.stat) {
    case 'maxHp':
      if (health) {
        if (eff.mode === 'flat') {
          health.maxHp += eff.value;
          health.currentHp += eff.value;
        } else {
          const bonus = Math.floor(health.maxHp * eff.value / 100);
          health.maxHp += bonus;
          health.currentHp += bonus;
        }
      }
      break;
    case 'armor':
      if (health) {
        health.armor += eff.value;
      }
      break;
    case 'attackDamage':
      if (combat) {
        combat.setDamage(combat.getDamage() + eff.value);
      }
      break;
    case 'attackRange':
      if (combat) {
        combat.setRange(combat.getRange() + eff.value);
      }
      break;
    case 'attackCooldown':
      if (combat) {
        if (eff.mode === 'percent') {
          const reduction = Math.floor(combat.getCooldown() * eff.value / 100);
          combat.setCooldown(combat.getCooldown() - reduction);
        } else {
          combat.setCooldown(Math.max(100, combat.getCooldown() - eff.value));
        }
      }
      break;
    case 'speed':
      if (mover) {
        mover.setSpeed(mover.getSpeed() + eff.value);
      }
      break;
    case 'gatherRate':
      if (gatherer) {
        gatherer.setGatherRate(gatherer.getGatherRate() + eff.value);
      }
      break;
    case 'gatherCapacity':
      if (gatherer) {
        gatherer.setCapacity(gatherer.getCapacity() + eff.value);
      }
      break;
  }
}
