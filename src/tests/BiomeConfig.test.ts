import { describe, it, expect } from 'vitest';
import { BIOME_CONFIGS, getBiomeIds, BiomeType } from '../map/BiomeConfig';

describe('BiomeConfig', () => {
  it('defines exactly 5 biomes', () => {
    expect(getBiomeIds()).toHaveLength(5);
  });

  it('includes expected biome IDs', () => {
    const ids = getBiomeIds();
    expect(ids).toContain('temperate');
    expect(ids).toContain('volcanic');
    expect(ids).toContain('tundra');
    expect(ids).toContain('jungle');
    expect(ids).toContain('desert');
  });

  describe('coverage ranges are valid', () => {
    for (const biomeId of getBiomeIds()) {
      it(`${biomeId} has valid coverage ranges`, () => {
        const config = BIOME_CONFIGS[biomeId];
        // All ranges should be [min, max] with min <= max
        expect(config.waterCoverage[0]).toBeLessThanOrEqual(config.waterCoverage[1]);
        expect(config.forestCoverage[0]).toBeLessThanOrEqual(config.forestCoverage[1]);
        expect(config.stoneCoverage[0]).toBeLessThanOrEqual(config.stoneCoverage[1]);
        expect(config.specialCoverage[0]).toBeLessThanOrEqual(config.specialCoverage[1]);
        expect(config.riverCount[0]).toBeLessThanOrEqual(config.riverCount[1]);
        expect(config.goldMineCount[0]).toBeLessThanOrEqual(config.goldMineCount[1]);
        // Coverage values should be reasonable fractions (0–0.5)
        expect(config.waterCoverage[1]).toBeLessThanOrEqual(0.5);
        expect(config.forestCoverage[1]).toBeLessThanOrEqual(0.5);
        expect(config.stoneCoverage[1]).toBeLessThanOrEqual(0.5);
      });
    }
  });

  it('volcanic has LAVA as special terrain', () => {
    expect(BIOME_CONFIGS.volcanic.specialTerrain).toBe('LAVA');
    expect(BIOME_CONFIGS.volcanic.specialCoverage[1]).toBeGreaterThan(0);
  });

  it('tundra has ICE as special terrain', () => {
    expect(BIOME_CONFIGS.tundra.specialTerrain).toBe('ICE');
    expect(BIOME_CONFIGS.tundra.specialCoverage[1]).toBeGreaterThan(0);
  });

  it('desert has RUBBLE as special terrain', () => {
    expect(BIOME_CONFIGS.desert.specialTerrain).toBe('RUBBLE');
    expect(BIOME_CONFIGS.desert.specialCoverage[1]).toBeGreaterThan(0);
  });

  it('temperate has no special terrain', () => {
    expect(BIOME_CONFIGS.temperate.specialTerrain).toBeUndefined();
    expect(BIOME_CONFIGS.temperate.specialCoverage[0]).toBe(0);
    expect(BIOME_CONFIGS.temperate.specialCoverage[1]).toBe(0);
  });

  it('jungle has high forest coverage', () => {
    expect(BIOME_CONFIGS.jungle.forestCoverage[0]).toBeGreaterThanOrEqual(0.3);
  });

  it('desert has SAND as floor type', () => {
    expect(BIOME_CONFIGS.desert.floorType).toBe('SAND');
  });

  it('volcanic has DIRT as floor type', () => {
    expect(BIOME_CONFIGS.volcanic.floorType).toBe('DIRT');
  });

  describe('lighting values are positive', () => {
    for (const biomeId of getBiomeIds()) {
      it(`${biomeId} has valid lighting`, () => {
        const config = BIOME_CONFIGS[biomeId];
        expect(config.ambientIntensity).toBeGreaterThan(0);
        expect(config.sunIntensity).toBeGreaterThan(0);
      });
    }
  });
});
