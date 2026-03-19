import { Component, Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { HealthComponent } from './HealthComponent';
import { CombatComponent } from './CombatComponent';
import { MoverComponent } from './MoverComponent';
import { IsoHelper } from '../map/IsoHelper';
import { TimerManager } from '../utils/TimerManager';
import { EntityManager } from '../systems/EntityManager';
import { getPlayerState } from '../state/PlayerState';
import { TECH_TREES } from '../state/TechTreeData';
import { EventBus } from '../EventBus';

// ── Data types ──────────────────────────────────────────────────────────

export interface AbilityDefinition {
  id: string;        // matches tech node id
  name: string;
  hotkey: string;    // 'Q' or 'W' or 'E' or 'R'
  cooldown: number;  // ms
  color: number;     // button border color
  params?: Record<string, number>;  // wargear ability parameters
}

interface AbilityState {
  definition: AbilityDefinition;
  cooldownRemaining: number;  // 0 = ready
}

interface ActiveBuff {
  id: string;
  remainingMs: number;
  revert: () => void;
}

// ── Ability definitions per unit type ───────────────────────────────────

export const ABILITY_DEFINITIONS: Record<string, AbilityDefinition[]> = {
  marine: [
    { id: 'marine_shieldwall_active', name: 'Shield Wall', hotkey: 'Q', cooldown: 30000, color: 0xffcc00 },
    { id: 'marine_warcry_active', name: 'War Cry', hotkey: 'W', cooldown: 25000, color: 0xff6622 },
  ],
  guardsman: [
    { id: 'guardsman_volley_active', name: 'Volley', hotkey: 'Q', cooldown: 15000, color: 0x44aaff },
    { id: 'guardsman_kite_active', name: 'Kite', hotkey: 'W', cooldown: 20000, color: 0x88ff44 },
  ],
  servitor: [
    { id: 'servitor_repair_active', name: 'Repair', hotkey: 'Q', cooldown: 20000, color: 0x44ff88 },
    { id: 'servitor_fortify_active', name: 'Fortify', hotkey: 'W', cooldown: 25000, color: 0xaaaaaa },
  ],
  scout: [
    { id: 'scout_sprint_active', name: 'Sprint', hotkey: 'Q', cooldown: 15000, color: 0x00ccff },
    { id: 'scout_smoke_active', name: 'Smoke Bomb', hotkey: 'W', cooldown: 25000, color: 0x9944cc },
  ],
};

// ── AbilityComponent ────────────────────────────────────────────────────

export class AbilityComponent implements Component {
  private unit: Unit;
  private entityManager: EntityManager;
  public abilities: AbilityState[];
  private activeBuffs: ActiveBuff[] = [];
  private smokeBombData: { tileX: number; tileY: number; remainingMs: number } | null = null;

  constructor(unit: Unit, definitions: AbilityDefinition[], entityManager: EntityManager) {
    this.unit = unit;
    this.entityManager = entityManager;
    this.abilities = definitions.map(def => ({
      definition: def,
      cooldownRemaining: 0,
    }));
  }

  getAbilities(): AbilityState[] {
    return this.abilities;
  }

  addAbility(def: AbilityDefinition): number {
    const state: AbilityState = {
      definition: def,
      cooldownRemaining: 0,
    };
    this.abilities.push(state);
    return this.abilities.length - 1;
  }

  removeAbility(defId: string): void {
    const index = this.abilities.findIndex(a => a.definition.id === defId);
    if (index !== -1) {
      this.abilities.splice(index, 1);
    }
  }

  canActivate(index: number): boolean {
    if (index < 0 || index >= this.abilities.length) return false;
    return this.abilities[index].cooldownRemaining <= 0;
  }

  activate(index: number): boolean {
    if (!this.canActivate(index)) return false;
    const ability = this.abilities[index];
    const success = this.executeAbility(ability.definition);
    if (success) {
      ability.cooldownRemaining = ability.definition.cooldown;
    }
    return success;
  }

  private executeAbility(def: AbilityDefinition): boolean {
    switch (def.id) {
      case 'marine_shieldwall_active': return this.shieldWall();
      case 'marine_warcry_active': return this.warCry();
      case 'guardsman_volley_active': return this.volley();
      case 'guardsman_kite_active': return this.kite();
      case 'servitor_repair_active': return this.emergencyRepair();
      case 'servitor_fortify_active': return this.fortify();
      case 'scout_sprint_active': return this.sprint();
      case 'scout_smoke_active': return this.smokeBomb();
      // Wargear abilities
      case 'jump_pack_leap': return this.jumpPackLeap(def);
      case 'frag_grenade_throw': return this.fragGrenadeThrow(def);
      case 'reductor_heal': return this.reductorHeal(def);
      default: return false;
    }
  }

  // ── Shield Wall: +50 armor for 5s, speed → 0 ──

  private shieldWall(): boolean {
    const health = this.unit.getComponent<HealthComponent>('health');
    const mover = this.unit.getComponent<MoverComponent>('mover');
    if (!health || !mover) return false;

    const oldArmor = health.armor;
    const oldSpeed = mover.getSpeed();
    health.armor += 50;
    mover.setSpeed(0);
    mover.stop();

    this.addBuff('shield_wall', 5000, () => {
      health.armor = oldArmor;
      mover.setSpeed(oldSpeed);
    });

    this.spawnVfxCircle(0xffcc00, 1.2);
    return true;
  }

  // ── War Cry: friendlies in 3 tiles +3 ATK 6s, enemies in 3 tiles cooldown doubled 6s ──

  private warCry(): boolean {
    const radius = 3;
    const duration = 6000;

    // Buff friendlies
    const allies = this.entityManager.getEntitiesByTeam(this.unit.team);
    for (const ally of allies) {
      if (ally === this.unit) continue;
      if (!ally.active) continue;
      if (IsoHelper.tileDistance(this.unit.tileX, this.unit.tileY, ally.tileX, ally.tileY) > radius) continue;
      const combat = ally.getComponent<CombatComponent>('combat');
      if (combat) {
        const oldDmg = combat.getDamage();
        combat.setDamage(oldDmg + 3);
        this.addBuff(`warcry_ally_${(ally as Entity & { entityId: string }).entityId}`, duration, () => {
          if (ally.active) combat.setDamage(oldDmg);
        });
      }
    }

    // Debuff enemies
    const enemies = this.entityManager.getEntitiesByTeam(this.unit.team === 'player' ? 'enemy' : 'player');
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (IsoHelper.tileDistance(this.unit.tileX, this.unit.tileY, enemy.tileX, enemy.tileY) > radius) continue;
      const combat = enemy.getComponent<CombatComponent>('combat');
      if (combat) {
        const oldCd = combat.getCooldown();
        combat.setCooldown(oldCd * 2);
        this.addBuff(`warcry_enemy_${(enemy as Entity & { entityId: string }).entityId}`, duration, () => {
          if (enemy.active) combat.setCooldown(oldCd);
        });
      }
    }

    this.spawnVfxCircle(0xff6622, 2.0);
    return true;
  }

  // ── Volley: fire 3 projectiles at enemies in range, each 50% dmg ──

  private volley(): boolean {
    const combat = this.unit.getComponent<CombatComponent>('combat');
    if (!combat) return false;

    const range = combat.getRange();
    const dmg = Math.floor(combat.getDamage() * 0.5);
    const enemies = this.entityManager.getEntitiesByTeam(this.unit.team === 'player' ? 'enemy' : 'player');

    const targets: Entity[] = [];
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (IsoHelper.tileDistance(this.unit.tileX, this.unit.tileY, enemy.tileX, enemy.tileY) <= range) {
        targets.push(enemy);
        if (targets.length >= 3) break;
      }
    }

    if (targets.length === 0) return false;

    const duration = 300;
    for (const target of targets) {
      EventBus.emit('projectile-spawned', {
        fromTileX: this.unit.tileX, fromTileY: this.unit.tileY,
        toTileX: target.tileX, toTileY: target.tileY, duration,
      });
      const targetId = target.entityId;
      const attackerId = this.unit.entityId;
      TimerManager.get().schedule(duration, () => {
        EventBus.emit('projectile-hit', { targetId, attackerId, damage: dmg });
      });
    }

    return true;
  }

  // ── Kite: teleport 3 tiles away from nearest enemy, +2 speed 3s ──

  private kite(): boolean {
    const mover = this.unit.getComponent<MoverComponent>('mover');
    if (!mover) return false;

    const nearest = this.entityManager.getNearestEnemy(this.unit);
    if (!nearest) return false;

    // Calculate direction away from enemy
    const dx = this.unit.tileX - nearest.tileX;
    const dy = this.unit.tileY - nearest.tileY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ndx = dx / len;
    const ndy = dy / len;

    // Try 3 tiles away, then 2, then 1
    let targetX = 0;
    let targetY = 0;
    let found = false;
    for (let dist = 3; dist >= 1; dist--) {
      targetX = Math.round(this.unit.tileX + ndx * dist);
      targetY = Math.round(this.unit.tileY + ndy * dist);
      if (IsoHelper.isInBounds(targetX, targetY)) {
        found = true;
        break;
      }
    }

    if (!found) return false;

    // Teleport
    this.unit.tileX = targetX;
    this.unit.tileY = targetY;
    this.unit.updateScreenPosition();
    this.unit.updateDepth();
    mover.stop();

    // Speed buff
    const oldSpeed = mover.getSpeed();
    mover.setSpeed(oldSpeed + 2);
    this.addBuff('kite_speed', 3000, () => {
      mover.setSpeed(oldSpeed);
    });

    this.spawnVfxCircle(0x88ff44, 1.0);
    return true;
  }

  // ── Emergency Repair: heal self + friendlies in 2 tiles for 10 HP ──

  private emergencyRepair(): boolean {
    const radius = 2;
    const healAmount = 10;
    const allies = this.entityManager.getEntitiesByTeam(this.unit.team);
    let healed = false;

    for (const ally of allies) {
      if (!ally.active) continue;
      if (IsoHelper.tileDistance(this.unit.tileX, this.unit.tileY, ally.tileX, ally.tileY) > radius) continue;
      const health = ally.getComponent<HealthComponent>('health');
      if (health) {
        health.heal(healAmount);
        healed = true;
      }
    }

    if (healed) {
      this.spawnVfxCircle(0x44ff88, 1.5);
    }
    return true;
  }

  // ── Fortify: +5 armor for 5s, speed → 0 ──

  private fortify(): boolean {
    const health = this.unit.getComponent<HealthComponent>('health');
    const mover = this.unit.getComponent<MoverComponent>('mover');
    if (!health || !mover) return false;

    const oldArmor = health.armor;
    const oldSpeed = mover.getSpeed();
    health.armor += 5;
    mover.setSpeed(0);
    mover.stop();

    this.addBuff('fortify', 5000, () => {
      health.armor = oldArmor;
      mover.setSpeed(oldSpeed);
    });

    this.spawnVfxCircle(0xaaaaaa, 1.0);
    return true;
  }

  // ── Sprint: double speed for 4s ──

  private sprint(): boolean {
    const mover = this.unit.getComponent<MoverComponent>('mover');
    if (!mover) return false;

    const oldSpeed = mover.getSpeed();
    mover.setSpeed(oldSpeed * 2);

    this.addBuff('sprint', 4000, () => {
      mover.setSpeed(oldSpeed);
    });

    this.spawnVfxCircle(0x00ccff, 0.8);
    return true;
  }

  // ── Smoke Bomb: enemies in 2 tiles lose target, re-null for 3s ──

  private smokeBomb(): boolean {
    this.smokeBombData = {
      tileX: this.unit.tileX,
      tileY: this.unit.tileY,
      remainingMs: 3000,
    };

    // Immediately clear enemy targets
    this.clearEnemyTargetsInSmoke();

    this.spawnVfxCircle(0x9944cc, 1.8);
    return true;
  }

  private clearEnemyTargetsInSmoke(): void {
    if (!this.smokeBombData) return;
    const radius = 2;
    const enemies = this.entityManager.getEntitiesByTeam(this.unit.team === 'player' ? 'enemy' : 'player');
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (IsoHelper.tileDistance(this.smokeBombData.tileX, this.smokeBombData.tileY, enemy.tileX, enemy.tileY) <= radius) {
        const combat = enemy.getComponent<CombatComponent>('combat');
        if (combat) {
          combat.setTarget(null);
        }
      }
    }
  }

  // ── Jump Pack Leap: teleport 4 tiles toward nearest enemy + AoE damage ──

  private jumpPackLeap(def: AbilityDefinition): boolean {
    const params = def.params || {};
    const leapDist = params.distance || 4;
    const aoeDmg = params.damage || 10;
    const aoeRadius = params.radius || 1;

    const nearest = this.entityManager.getNearestEnemy(this.unit);
    if (!nearest) return false;

    // Calculate direction toward nearest enemy
    const dx = nearest.tileX - this.unit.tileX;
    const dy = nearest.tileY - this.unit.tileY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ndx = dx / len;
    const ndy = dy / len;

    // Find landing tile
    let targetX = 0;
    let targetY = 0;
    let found = false;
    for (let dist = leapDist; dist >= 1; dist--) {
      targetX = Math.round(this.unit.tileX + ndx * dist);
      targetY = Math.round(this.unit.tileY + ndy * dist);
      if (IsoHelper.isInBounds(targetX, targetY)) {
        found = true;
        break;
      }
    }
    if (!found) return false;

    // Teleport
    this.unit.tileX = targetX;
    this.unit.tileY = targetY;
    this.unit.updateScreenPosition();
    this.unit.updateDepth();
    const mover = this.unit.getComponent<MoverComponent>('mover');
    if (mover) mover.stop();

    // AoE damage at landing
    const enemies = this.entityManager.getEntitiesByTeam(this.unit.team === 'player' ? 'enemy' : 'player');
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (IsoHelper.tileDistance(targetX, targetY, enemy.tileX, enemy.tileY) <= aoeRadius) {
        const health = enemy.getComponent<HealthComponent>('health');
        if (health) health.takeDamage(aoeDmg, this.unit);
      }
    }

    this.spawnVfxCircle(0x4488ff, 1.5);
    return true;
  }

  // ── Frag Grenade: projectile AoE damage ──

  private fragGrenadeThrow(def: AbilityDefinition): boolean {
    const params = def.params || {};
    const dmg = params.damage || 15;
    const radius = params.radius || 2;
    const range = params.range || 3;

    // Target nearest enemy within range
    const enemies = this.entityManager.getEntitiesByTeam(this.unit.team === 'player' ? 'enemy' : 'player');
    let target: Entity | null = null;
    let bestDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dist = IsoHelper.tileDistance(this.unit.tileX, this.unit.tileY, enemy.tileX, enemy.tileY);
      if (dist <= range && dist < bestDist) {
        target = enemy;
        bestDist = dist;
      }
    }

    if (!target) return false;

    const targetX = target.tileX;
    const targetY = target.tileY;

    // Fire projectile
    const duration = 300;
    EventBus.emit('projectile-spawned', {
      fromTileX: this.unit.tileX, fromTileY: this.unit.tileY,
      toTileX: targetX, toTileY: targetY, duration,
    });
    const attackerId = this.unit.entityId;
    const enemyTeam = this.unit.team === 'player' ? 'enemy' : 'player';
    TimerManager.get().schedule(duration, () => {
      EventBus.emit('projectile-hit-aoe', {
        attackerId, tileX: targetX, tileY: targetY,
        radius, damage: dmg, enemyTeam,
      });
      EventBus.emit('ordnance-vfx-3d', { type: 'ability', tileX: targetX, tileY: targetY, radius });
    });

    return true;
  }

  // ── Reductor Heal: heal nearest damaged ally ──

  private reductorHeal(def: AbilityDefinition): boolean {
    const params = def.params || {};
    const healAmount = params.amount || 20;
    const range = params.range || 2;

    const allies = this.entityManager.getEntitiesByTeam(this.unit.team);
    let bestAlly: Entity | null = null;
    let bestDist = Infinity;

    for (const ally of allies) {
      if (!ally.active) continue;
      if (ally === this.unit) continue;
      const health = ally.getComponent<HealthComponent>('health');
      if (!health || health.currentHp >= health.maxHp) continue;
      const dist = IsoHelper.tileDistance(this.unit.tileX, this.unit.tileY, ally.tileX, ally.tileY);
      if (dist <= range && dist < bestDist) {
        bestAlly = ally;
        bestDist = dist;
      }
    }

    if (!bestAlly) return false;

    const health = bestAlly.getComponent<HealthComponent>('health');
    if (health) health.heal(healAmount);

    this.spawnVfxCircle(0x44ff88, 1.0);
    return true;
  }

  // ── Buff management ───────────────────────────────────────────────────

  private addBuff(id: string, durationMs: number, revert: () => void): void {
    this.activeBuffs.push({ id, remainingMs: durationMs, revert });
  }

  // ── VFX helper ────────────────────────────────────────────────────────

  private spawnVfxCircle(_color: number, scale: number): void {
    EventBus.emit('ordnance-vfx-3d', { type: 'ability', tileX: this.unit.tileX, tileY: this.unit.tileY, radius: scale });
  }

  // ── Component interface ───────────────────────────────────────────────

  update(delta: number): void {
    if (!this.unit.active) return;

    // Tick cooldowns
    for (const ability of this.abilities) {
      if (ability.cooldownRemaining > 0) {
        ability.cooldownRemaining = Math.max(0, ability.cooldownRemaining - delta);
      }
    }

    // Tick active buffs
    for (let i = this.activeBuffs.length - 1; i >= 0; i--) {
      this.activeBuffs[i].remainingMs -= delta;
      if (this.activeBuffs[i].remainingMs <= 0) {
        this.activeBuffs[i].revert();
        this.activeBuffs.splice(i, 1);
      }
    }

    // Tick smoke bomb
    if (this.smokeBombData) {
      this.smokeBombData.remainingMs -= delta;
      if (this.smokeBombData.remainingMs <= 0) {
        this.smokeBombData = null;
      } else {
        this.clearEnemyTargetsInSmoke();
      }
    }
  }

  destroy(): void {
    // Revert all active buffs
    for (const buff of this.activeBuffs) {
      buff.revert();
    }
    this.activeBuffs = [];
    this.smokeBombData = null;
  }
}

// ── attachAbilities helper ──────────────────────────────────────────────

export function attachAbilities(unit: Unit, entityManager: EntityManager): void {
  const state = getPlayerState();
  const allDefs = ABILITY_DEFINITIONS[unit.unitType];
  if (!allDefs) return;

  const tree = TECH_TREES[unit.unitType] || [];
  const unlockedDefs: AbilityDefinition[] = [];

  for (const def of allDefs) {
    // Check if the corresponding active tech node is unlocked
    const node = tree.find(n => n.id === def.id);
    if (node && state.unlockedNodes.has(node.id)) {
      unlockedDefs.push(def);
    }
  }

  if (unlockedDefs.length === 0) return;

  unit.addComponent('ability', new AbilityComponent(unit, unlockedDefs, entityManager));
}
