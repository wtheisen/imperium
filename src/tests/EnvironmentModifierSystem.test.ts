import { describe, it, expect } from 'vitest';
import { resolveEnvironmentModifiers } from '../systems/EnvironmentModifierSystem';
import { EnvironmentModifier } from '../missions/MissionDefinition';

describe('resolveEnvironmentModifiers', () => {
  it('returns defaults when no modifiers provided', () => {
    const fx = resolveEnvironmentModifiers([]);
    expect(fx.fogRevealMult).toBe(1.0);
    expect(fx.enemyHpMult).toBe(1.0);
    expect(fx.noSupplyDrops).toBe(false);
    expect(fx.ironRain).toBe(false);
    expect(fx.toxicAtmosphere).toBe(false);
    expect(fx.killzone).toBe(false);
    expect(fx.ordnanceCostMult).toBe(1.0);
  });

  it('returns defaults when undefined', () => {
    const fx = resolveEnvironmentModifiers(undefined);
    expect(fx.fogRevealMult).toBe(1.0);
  });

  // ── Existing modifiers ──────────────────────────────

  it('applies dense_fog', () => {
    const fx = resolveEnvironmentModifiers(['dense_fog']);
    expect(fx.fogRevealMult).toBe(0.5);
  });

  it('applies ork_frenzy', () => {
    const fx = resolveEnvironmentModifiers(['ork_frenzy']);
    expect(fx.enemySpeedMult).toBe(1.3);
  });

  it('applies supply_shortage', () => {
    const fx = resolveEnvironmentModifiers(['supply_shortage']);
    expect(fx.noSupplyDrops).toBe(true);
  });

  it('applies armored_advance', () => {
    const fx = resolveEnvironmentModifiers(['armored_advance']);
    expect(fx.enemyHpMult).toBe(1.2);
  });

  it('applies night_raid', () => {
    const fx = resolveEnvironmentModifiers(['night_raid']);
    expect(fx.fogRevealMult).toBe(0.6);
    expect(fx.playerAttackBonus).toBe(1);
  });

  // ── New active mutators ─────────────────────────────

  it('applies iron_rain', () => {
    const fx = resolveEnvironmentModifiers(['iron_rain']);
    expect(fx.ironRain).toBe(true);
  });

  it('applies toxic_atmosphere', () => {
    const fx = resolveEnvironmentModifiers(['toxic_atmosphere']);
    expect(fx.toxicAtmosphere).toBe(true);
  });

  it('applies ambush_spawns', () => {
    const fx = resolveEnvironmentModifiers(['ambush_spawns']);
    expect(fx.ambushSpawns).toBe(true);
  });

  it('applies blood_tithe', () => {
    const fx = resolveEnvironmentModifiers(['blood_tithe']);
    expect(fx.bloodTithe).toBe(true);
  });

  it('applies killzone', () => {
    const fx = resolveEnvironmentModifiers(['killzone']);
    expect(fx.killzone).toBe(true);
  });

  it('applies elite_only with HP, damage, and count multipliers', () => {
    const fx = resolveEnvironmentModifiers(['elite_only']);
    expect(fx.eliteOnly).toBe(true);
    expect(fx.enemyHpMult).toBe(2.0);
    expect(fx.enemyDamageMult).toBe(2.0);
    expect(fx.enemyCountMult).toBe(0.5);
  });

  // ── Stub mutators ───────────────────────────────────

  it('applies scrapyard', () => {
    const fx = resolveEnvironmentModifiers(['scrapyard']);
    expect(fx.extraPackSpawns).toBe(3);
    expect(fx.goldMineCountMult).toBe(0.5);
  });

  it('applies reinforced_walls', () => {
    const fx = resolveEnvironmentModifiers(['reinforced_walls']);
    expect(fx.enemyBuildingHpMult).toBe(2.0);
  });

  it('applies warp_interference', () => {
    const fx = resolveEnvironmentModifiers(['warp_interference']);
    expect(fx.ordnanceCostMult).toBe(2.0);
  });

  it('applies rapid_deployment', () => {
    const fx = resolveEnvironmentModifiers(['rapid_deployment']);
    expect(fx.playerDeploySpeedMult).toBe(1.5);
    expect(fx.playerSpawnHpMult).toBe(0.75);
  });

  // ── Stacking / combining ────────────────────────────

  it('multiplicative fields stack correctly', () => {
    const fx = resolveEnvironmentModifiers(['armored_advance', 'elite_only']);
    // 1.2 * 2.0 = 2.4
    expect(fx.enemyHpMult).toBeCloseTo(2.4);
  });

  it('boolean flags OR together', () => {
    const fx = resolveEnvironmentModifiers(['iron_rain', 'killzone', 'supply_shortage']);
    expect(fx.ironRain).toBe(true);
    expect(fx.killzone).toBe(true);
    expect(fx.noSupplyDrops).toBe(true);
  });

  it('additive fields sum correctly', () => {
    const fx = resolveEnvironmentModifiers(['night_raid'] as EnvironmentModifier[]);
    expect(fx.playerAttackBonus).toBe(1);
  });

  it('fog multipliers stack', () => {
    const fx = resolveEnvironmentModifiers(['dense_fog', 'night_raid']);
    // 0.5 * 0.6 = 0.3
    expect(fx.fogRevealMult).toBeCloseTo(0.3);
  });
});
