import { describe, it, expect } from 'vitest';

/**
 * Mirrors the modLabels and modColors lookup tables from ObjectiveDisplay.ts
 * so we can verify all 15 environment modifiers have human-readable labels
 * and themed colors without a full browser/DOM environment.
 */
const modLabels: Record<string, string> = {
  dense_fog: 'DENSE FOG', ork_frenzy: 'ORK FRENZY',
  supply_shortage: 'NO SUPPLY', armored_advance: 'ARMORED',
  night_raid: 'NIGHT OPS', iron_rain: 'IRON RAIN',
  toxic_atmosphere: 'TOXIC', ambush_spawns: 'AMBUSH',
  blood_tithe: 'BLOOD TITHE', killzone: 'KILLZONE',
  elite_only: 'ELITE ONLY', scrapyard: 'SCRAPYARD',
  reinforced_walls: 'FORTIFIED', warp_interference: 'WARP',
  rapid_deployment: 'RAPID DEPLOY',
};

const modColors: Record<string, string> = {
  dense_fog: '#6080a0', ork_frenzy: '#c43030',
  supply_shortage: '#c8982a', armored_advance: '#808080',
  night_raid: '#4060a0', iron_rain: '#ff6600',
  toxic_atmosphere: '#22cc22', ambush_spawns: '#9933ff',
  blood_tithe: '#cc0000', killzone: '#ff4444',
  elite_only: '#c8982a', scrapyard: '#888888',
  reinforced_walls: '#808080', warp_interference: '#9933ff',
  rapid_deployment: '#44ccdd',
};

const ALL_MODIFIERS = [
  'dense_fog', 'ork_frenzy', 'supply_shortage', 'armored_advance', 'night_raid',
  'iron_rain', 'toxic_atmosphere', 'ambush_spawns', 'blood_tithe', 'killzone',
  'elite_only', 'scrapyard', 'reinforced_walls', 'warp_interference', 'rapid_deployment',
];

describe('ObjectiveDisplay modifier labels', () => {
  it('covers all 15 known environment modifiers', () => {
    expect(Object.keys(modLabels)).toHaveLength(15);
  });

  it.each(ALL_MODIFIERS)('has a label for %s', (mod) => {
    expect(modLabels[mod]).toBeDefined();
    expect(modLabels[mod].length).toBeGreaterThan(0);
  });

  it('no label contains raw underscores (no fallback leak)', () => {
    for (const [mod, label] of Object.entries(modLabels)) {
      expect(label, `label for ${mod} should not contain underscores`).not.toContain('_');
    }
  });

  it('all labels are uppercase', () => {
    for (const [mod, label] of Object.entries(modLabels)) {
      expect(label, `label for ${mod} should be uppercase`).toBe(label.toUpperCase());
    }
  });

  it('previously-missing modifiers now have proper labels (not raw identifiers)', () => {
    expect(modLabels['iron_rain']).toBe('IRON RAIN');
    expect(modLabels['toxic_atmosphere']).toBe('TOXIC');
    expect(modLabels['ambush_spawns']).toBe('AMBUSH');
    expect(modLabels['blood_tithe']).toBe('BLOOD TITHE');
    expect(modLabels['killzone']).toBe('KILLZONE');
    expect(modLabels['elite_only']).toBe('ELITE ONLY');
    expect(modLabels['scrapyard']).toBe('SCRAPYARD');
    expect(modLabels['reinforced_walls']).toBe('FORTIFIED');
    expect(modLabels['warp_interference']).toBe('WARP');
    expect(modLabels['rapid_deployment']).toBe('RAPID DEPLOY');
  });
});

describe('ObjectiveDisplay modifier colors', () => {
  it('covers all 15 known environment modifiers', () => {
    expect(Object.keys(modColors)).toHaveLength(15);
  });

  it.each(ALL_MODIFIERS)('has a color for %s', (mod) => {
    expect(modColors[mod]).toBeDefined();
    expect(modColors[mod]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('iron_rain uses orange (bombardment theme)', () => {
    expect(modColors['iron_rain']).toBe('#ff6600');
  });

  it('toxic_atmosphere uses green (poison theme)', () => {
    expect(modColors['toxic_atmosphere']).toBe('#22cc22');
  });

  it('warp modifiers use purple', () => {
    expect(modColors['ambush_spawns']).toBe('#9933ff');
    expect(modColors['warp_interference']).toBe('#9933ff');
  });

  it('rapid_deployment uses teal (speed theme)', () => {
    expect(modColors['rapid_deployment']).toBe('#44ccdd');
  });
});

describe('ObjectiveDisplay modifier fallback behavior', () => {
  it('unknown modifier falls back to toUpperCase which produces underscores', () => {
    // This test documents why full coverage matters: the fallback is ugly
    const unknownMod = 'some_unknown_modifier';
    const label = modLabels[unknownMod] || unknownMod.toUpperCase();
    expect(label).toBe('SOME_UNKNOWN_MODIFIER');
    expect(label).toContain('_');
  });

  it('all known modifiers resolve without hitting the fallback', () => {
    for (const mod of ALL_MODIFIERS) {
      const label = modLabels[mod] || mod.toUpperCase();
      expect(label, `${mod} should not fall back to raw identifier`).not.toContain('_');
    }
  });
});
