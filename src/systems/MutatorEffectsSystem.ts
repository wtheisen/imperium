import { EventBus } from '../EventBus';
import { EntityManager } from './EntityManager';
import { HealthComponent } from '../components/HealthComponent';
import { EnvironmentEffects } from './EnvironmentModifierSystem';
import { Entity } from '../entities/Entity';
import { IsoHelper } from '../map/IsoHelper';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';
import {
  IRON_RAIN_INTERVAL_MS,
  IRON_RAIN_DAMAGE,
  IRON_RAIN_RADIUS,
  IRON_RAIN_WARNING_MS,
  TOXIC_ATMOSPHERE_TICK_MS,
  TOXIC_ATMOSPHERE_DAMAGE,
  TOXIC_ATMOSPHERE_SAFE_RADIUS,
  AMBUSH_SPAWN_INTERVAL_MS,
  AMBUSH_SPAWN_COUNT,
  AMBUSH_SPAWN_OFFSET,
  BLOOD_TITHE_KILL_GOLD,
  BLOOD_TITHE_DEATH_GOLD_LOSS,
} from '../config';
import { ENEMY_GRUNT } from '../ai/EnemyStats';

/**
 * Drives active environment mutator effects during gameplay.
 * Created by GameScene after resolving environment modifiers.
 */
export class MutatorEffectsSystem {
  private entityManager: EntityManager;
  private effects: EnvironmentEffects;

  // Iron Rain state
  private ironRainTimer = 0;
  private ironRainPending: { tileX: number; tileY: number; countdown: number } | null = null;

  // Toxic Atmosphere state
  private toxicTimer = 0;

  // Ambush Spawns state
  private ambushTimer = 0;

  constructor(entityManager: EntityManager, effects: EnvironmentEffects) {
    this.entityManager = entityManager;
    this.effects = effects;

    if (effects.bloodTithe) {
      EventBus.on('entity-died', this.onEntityDiedBloodTithe, this);
    }
    if (effects.killzone) {
      EventBus.on('entity-heal-attempt', this.onHealAttempt, this);
    }
  }

  update(delta: number): void {
    if (this.effects.ironRain) this.updateIronRain(delta);
    if (this.effects.toxicAtmosphere) this.updateToxicAtmosphere(delta);
    if (this.effects.ambushSpawns) this.updateAmbushSpawns(delta);
  }

  // ── Iron Rain ─────────────────────────────────────────────────────

  private updateIronRain(delta: number): void {
    // Handle pending strike countdown
    if (this.ironRainPending) {
      this.ironRainPending.countdown -= delta;
      if (this.ironRainPending.countdown <= 0) {
        this.executeIronRainStrike(this.ironRainPending.tileX, this.ironRainPending.tileY);
        this.ironRainPending = null;
      }
      return;
    }

    this.ironRainTimer += delta;
    if (this.ironRainTimer >= IRON_RAIN_INTERVAL_MS) {
      this.ironRainTimer = 0;
      // Pick random target on map
      const tileX = Math.floor(Math.random() * (MAP_WIDTH - 8)) + 4;
      const tileY = Math.floor(Math.random() * (MAP_HEIGHT - 8)) + 4;
      // Emit warning VFX
      EventBus.emit('mutator-vfx', { type: 'iron_rain_warning', tileX, tileY, radius: IRON_RAIN_RADIUS });
      this.ironRainPending = { tileX, tileY, countdown: IRON_RAIN_WARNING_MS };
    }
  }

  private executeIronRainStrike(tileX: number, tileY: number): void {
    // Damage ALL units in radius (both teams — artillery doesn't discriminate)
    const allEntities = this.entityManager.getAllEntities();
    for (const entity of allEntities) {
      if (!entity.active) continue;
      if (IsoHelper.tileDistance(entity.tileX, entity.tileY, tileX, tileY) <= IRON_RAIN_RADIUS) {
        const health = entity.getComponent<HealthComponent>('health');
        if (health) health.takeDamage(IRON_RAIN_DAMAGE);
      }
    }
    EventBus.emit('mutator-vfx', { type: 'iron_rain_impact', tileX, tileY, radius: IRON_RAIN_RADIUS });
  }

  // ── Toxic Atmosphere ──────────────────────────────────────────────

  private updateToxicAtmosphere(delta: number): void {
    this.toxicTimer += delta;
    if (this.toxicTimer < TOXIC_ATMOSPHERE_TICK_MS) return;
    this.toxicTimer = 0;

    const playerBuildings = this.entityManager.getBuildings('player');
    const allUnits = [
      ...this.entityManager.getUnits('player'),
      ...this.entityManager.getUnits('enemy'),
    ];

    for (const unit of allUnits) {
      if (!unit.active) continue;
      const nearBuilding = playerBuildings.some(b =>
        b.active && IsoHelper.tileDistance(unit.tileX, unit.tileY, b.tileX, b.tileY) <= TOXIC_ATMOSPHERE_SAFE_RADIUS
      );
      if (!nearBuilding) {
        const health = unit.getComponent<HealthComponent>('health');
        if (health) {
          health.takeDamage(TOXIC_ATMOSPHERE_DAMAGE);
          EventBus.emit('mutator-vfx', { type: 'toxic_tick', tileX: unit.tileX, tileY: unit.tileY });
        }
      }
    }
  }

  // ── Ambush Spawns ─────────────────────────────────────────────────

  private updateAmbushSpawns(delta: number): void {
    this.ambushTimer += delta;
    if (this.ambushTimer < AMBUSH_SPAWN_INTERVAL_MS) return;
    this.ambushTimer = 0;

    const playerUnits = this.entityManager.getUnits('player');
    if (playerUnits.length === 0) return;

    // Pick a random player unit to ambush near
    const target = playerUnits[Math.floor(Math.random() * playerUnits.length)];
    const angle = Math.random() * Math.PI * 2;
    const sx = Math.max(0, Math.min(MAP_WIDTH - 1, Math.round(target.tileX + Math.cos(angle) * AMBUSH_SPAWN_OFFSET)));
    const sy = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.round(target.tileY + Math.sin(angle) * AMBUSH_SPAWN_OFFSET)));

    EventBus.emit('mutator-vfx', { type: 'ambush_warp_in', tileX: sx, tileY: sy });

    for (let i = 0; i < AMBUSH_SPAWN_COUNT; i++) {
      const ox = Math.floor(Math.random() * 3) - 1;
      const oy = Math.floor(Math.random() * 3) - 1;
      const ux = Math.max(0, Math.min(MAP_WIDTH - 1, sx + ox));
      const uy = Math.max(0, Math.min(MAP_HEIGHT - 1, sy + oy));
      const unit = this.entityManager.spawnUnit(ux, uy, 'enemy_grunt', ENEMY_GRUNT, 'enemy');
      unit.homeX = target.tileX;
      unit.homeY = target.tileY;
      unit.aggroRadius = 10;
    }
  }

  // ── Blood Tithe ───────────────────────────────────────────────────

  private onEntityDiedBloodTithe = ({ entity, killer }: { entity: Entity; killer?: Entity }): void => {
    if (entity.team === 'enemy' && killer && killer.team === 'player') {
      EventBus.emit('mutator-gold', { amount: BLOOD_TITHE_KILL_GOLD, reason: 'blood_tithe_kill' });
      EventBus.emit('mutator-vfx', { type: 'blood_tithe_gain', tileX: entity.tileX, tileY: entity.tileY });
    }
    if (entity.team === 'player') {
      EventBus.emit('mutator-gold', { amount: -BLOOD_TITHE_DEATH_GOLD_LOSS, reason: 'blood_tithe_death' });
      EventBus.emit('mutator-vfx', { type: 'blood_tithe_loss', tileX: entity.tileX, tileY: entity.tileY });
    }
  };

  // ── Killzone ──────────────────────────────────────────────────────

  private onHealAttempt = (data: { entity: Entity; amount: number; cancel: { cancelled: boolean } }): void => {
    data.cancel.cancelled = true;
    EventBus.emit('floating-text-3d', {
      tileX: data.entity.tileX,
      tileY: data.entity.tileY,
      text: 'NO HEALING',
      color: '#ff2222',
    });
  };

  destroy(): void {
    if (this.effects.bloodTithe) {
      EventBus.off('entity-died', this.onEntityDiedBloodTithe, this);
    }
    if (this.effects.killzone) {
      EventBus.off('entity-heal-attempt', this.onHealAttempt, this);
    }
  }
}
