import { Component, Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { HealthComponent } from './HealthComponent';
import { CombatComponent } from './CombatComponent';
import { EventBus } from '../EventBus';
import { TimerManager } from '../utils/TimerManager';

export class TechPassiveComponent implements Component {
  private unit: Unit;
  private passiveIds: string[];
  private triggeredIds: { id: string; trigger: string }[];

  // marine_fortress: out-of-combat regen
  private lastDamageTime: number = 0;
  private fortressRegenTimer: number = 0;

  // servitor_resilient: unconditional regen
  private resilientTimer: number = 0;

  // scout_backstab: track last target
  private lastTargetId: string = '';

  // Bound handlers for cleanup
  private boundOnDamageDealt: ((data: any) => void) | null = null;
  private boundOnEntityDied: ((data: any) => void) | null = null;
  private boundOnGoldGathered: ((data: any) => void) | null = null;
  private boundOnDamageTaken: ((data: any) => void) | null = null;

  // Wargear dynamic passives
  private wargearPassives: Map<string, Record<string, number>> = new Map();
  private wargearHandlers: Map<string, (data: any) => void> = new Map();

  // armor_debuff_aura tracking
  private auraDebuffedEntities: Set<string> = new Set();
  private auraCheckTimer: number = 0;

  // damage_shield tracking
  private damageShieldReady: boolean = true;
  private damageShieldCooldownTimer: number = 0;

  constructor(unit: Unit, passiveIds: string[], triggeredIds: { id: string; trigger: string }[]) {
    this.unit = unit;
    this.passiveIds = passiveIds;
    this.triggeredIds = triggeredIds;

    // Register event handlers for triggered effects
    if (this.hasTriggered('marine_cleave')) {
      this.boundOnEntityDied = this.onEntityDiedCleave.bind(this);
      EventBus.on('entity-died', this.boundOnEntityDied);
    }

    if (this.hasPassive('servitor_golden')) {
      this.boundOnGoldGathered = this.onGoldGatheredGolden.bind(this);
      EventBus.on('gold-gathered', this.boundOnGoldGathered);
    }

    if (this.hasPassive('marine_fortress')) {
      this.boundOnDamageTaken = this.onDamageTaken.bind(this);
      EventBus.on('damage-dealt', this.boundOnDamageTaken);
    }

    if (this.hasPassive('scout_evasion')) {
      // Evasion handled by hooking into HealthComponent — checked at damage time
    }
  }

  private hasPassive(id: string): boolean {
    return this.passiveIds.includes(id);
  }

  private hasTriggered(id: string): boolean {
    return this.triggeredIds.some(t => t.id === id);
  }

  // --- Marine Fortress: track when this unit last took damage ---
  private onDamageTaken(data: { target: Entity }): void {
    if (data.target === this.unit) {
      this.lastDamageTime = 0; // reset timer
    }
  }

  // --- Marine Cleave: on-kill AoE ---
  private onEntityDiedCleave({ entity, killer }: { entity: Entity; killer?: Entity }): void {
    if (killer !== this.unit) return;
    if (!this.unit.active) return;

    EventBus.emit('tech-cleave', {
      tileX: entity.tileX,
      tileY: entity.tileY,
      damage: 5,
      source: this.unit,
    });
  }

  // --- Servitor Golden: bonus gold ---
  private onGoldGatheredGolden(data: { amount: number; unit?: Unit }): void {
    if (data.unit !== this.unit) return;
    // Add 2 bonus gold by emitting another gold-gathered with no unit (prevents infinite loop)
    EventBus.emit('gold-gathered', { amount: 2 });
  }

  // --- Guardsman Headshot: 15% crit (checked by CombatComponent via this component) ---
  shouldCrit(): boolean {
    if (!this.hasTriggered('guardsman_headshot')) return false;
    return Math.random() < 0.15;
  }

  // --- Scout Backstab: first hit on new target = 2x ---
  getBackstabMultiplier(targetId: string): number {
    if (!this.hasTriggered('scout_backstab')) return 1;
    if (targetId !== this.lastTargetId) {
      this.lastTargetId = targetId;
      return 2;
    }
    return 1;
  }

  // --- Scout Evasion: 20% dodge ---
  shouldDodge(): boolean {
    if (!this.hasPassive('scout_evasion')) return false;
    return Math.random() < 0.20;
  }

  // --- Wargear: Block Chance (Storm Shield) ---
  shouldBlock(): boolean {
    const params = this.wargearPassives.get('block_chance');
    if (!params) return false;
    return Math.random() < (params.chance || 0);
  }

  // --- Wargear: Damage Shield (Iron Halo) ---
  hasDamageShield(): boolean {
    if (!this.wargearPassives.has('damage_shield')) return false;
    return this.damageShieldReady;
  }

  consumeDamageShield(): void {
    this.damageShieldReady = false;
    const params = this.wargearPassives.get('damage_shield');
    this.damageShieldCooldownTimer = params?.recharge || 30000;
  }

  // --- Wargear: Vision Bonus from auspex ---
  getWargearVisionBonus(): number {
    // Check wargear stat boosts tracked as passives
    return 0; // Vision is handled via stat boosts on EquipmentComponent
  }

  hasWargearPassive(id: string): boolean {
    return this.wargearPassives.has(id);
  }

  addPassive(id: string, params: Record<string, number>): void {
    this.wargearPassives.set(id, params);

    // Register event handlers for specific passives
    if (id === 'stun_on_hit') {
      const handler = (data: { attacker: any; target: any }) => {
        if (data.attacker !== this.unit) return;
        if (!data.target || !data.target.active) return;
        const mover = data.target.getComponent?.('mover') as any;
        if (mover) {
          const oldSpeed = mover.getSpeed();
          mover.setSpeed(0);
          mover.stop();
          const duration = params.duration || 500;
          TimerManager.get().schedule(duration, () => {
            if (data.target.active) {
              mover.setSpeed(oldSpeed);
            }
          });
        }
      };
      this.wargearHandlers.set(id, handler);
      EventBus.on('damage-dealt', handler);
    }
  }

  removePassive(id: string): void {
    this.wargearPassives.delete(id);

    // Unregister event handler
    const handler = this.wargearHandlers.get(id);
    if (handler) {
      EventBus.off('damage-dealt', handler);
      this.wargearHandlers.delete(id);
    }

    // Clean up aura debuffs if removing armor_debuff_aura
    if (id === 'armor_debuff_aura') {
      this.cleanupAuraDebuffs();
    }

    // Reset damage shield state
    if (id === 'damage_shield') {
      this.damageShieldReady = true;
      this.damageShieldCooldownTimer = 0;
    }
  }

  private cleanupAuraDebuffs(): void {
    // We can't easily get references back to debuffed entities,
    // but the aura check will stop applying and debuffs naturally clear
    this.auraDebuffedEntities.clear();
  }

  // --- Guardsman Piercing: armor ignore ---
  getArmorPiercing(): number {
    if (!this.hasPassive('guardsman_piercing')) return 0;
    return 3;
  }

  // --- Scout Eyes: vision bonus ---
  getVisionBonus(): number {
    if (!this.hasPassive('scout_eyes')) return 0;
    return 3;
  }

  update(delta: number): void {
    if (!this.unit.active) return;

    const health = this.unit.getComponent<HealthComponent>('health');
    if (!health || health.isDead()) return;

    // Marine Fortress: regen when out of combat for 3s
    if (this.hasPassive('marine_fortress')) {
      this.lastDamageTime += delta;
      if (this.lastDamageTime >= 3000) {
        this.fortressRegenTimer += delta;
        if (this.fortressRegenTimer >= 1000) {
          this.fortressRegenTimer -= 1000;
          health.heal(1);
        }
      } else {
        this.fortressRegenTimer = 0;
      }
    }

    // Servitor Resilient: unconditional regen 1 HP / 2s
    if (this.hasPassive('servitor_resilient')) {
      this.resilientTimer += delta;
      if (this.resilientTimer >= 2000) {
        this.resilientTimer -= 2000;
        health.heal(1);
      }
    }

    // Wargear: Damage Shield recharge
    if (this.wargearPassives.has('damage_shield') && !this.damageShieldReady) {
      this.damageShieldCooldownTimer -= delta;
      if (this.damageShieldCooldownTimer <= 0) {
        this.damageShieldReady = true;
        this.damageShieldCooldownTimer = 0;
      }
    }

    // Wargear: Armor Debuff Aura - check every 1s
    const auraParams = this.wargearPassives.get('armor_debuff_aura');
    if (auraParams) {
      this.auraCheckTimer += delta;
      if (this.auraCheckTimer >= 1000) {
        this.auraCheckTimer -= 1000;
        this.updateArmorDebuffAura(auraParams);
      }
    }
  }

  private updateArmorDebuffAura(params: Record<string, number>): void {
    const radius = params.radius || 3;
    const debuffValue = params.value || 2;

    // Find enemies via EventBus query pattern
    // We emit a query event that EntityManager can handle
    EventBus.emit('aura-debuff-update', {
      source: this.unit,
      radius,
      debuffValue,
      previousTargets: this.auraDebuffedEntities,
    });
  }

  destroy(): void {
    if (this.boundOnEntityDied) {
      EventBus.off('entity-died', this.boundOnEntityDied);
    }
    if (this.boundOnGoldGathered) {
      EventBus.off('gold-gathered', this.boundOnGoldGathered);
    }
    if (this.boundOnDamageTaken) {
      EventBus.off('damage-dealt', this.boundOnDamageTaken);
    }

    // Clean up wargear passive handlers
    for (const [_id, handler] of this.wargearHandlers) {
      EventBus.off('damage-dealt', handler);
    }
    this.wargearHandlers.clear();
    this.wargearPassives.clear();
    this.auraDebuffedEntities.clear();
  }
}
