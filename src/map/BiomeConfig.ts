/** Biome types for procedural mission generation */
export type BiomeType = 'temperate' | 'volcanic' | 'tundra' | 'jungle' | 'desert';

/** Per-biome terrain coverage presets */
export interface BiomeConfig {
  id: BiomeType;
  /** Default floor terrain type name (maps to TerrainType enum) */
  floorType: 'GRASS' | 'DIRT' | 'SAND';
  /** Terrain coverage ranges [min, max] */
  waterCoverage: [number, number];
  forestCoverage: [number, number];
  stoneCoverage: [number, number];
  /** Coverage for biome-specific terrain (lava, ice, rubble) */
  specialCoverage: [number, number];
  /** Special terrain type name (if any) */
  specialTerrain?: 'LAVA' | 'ICE' | 'RUBBLE';
  riverCount: [number, number];
  goldMineCount: [number, number];
  /** Ambient light color (hex) */
  ambientColor: number;
  /** Ambient light intensity */
  ambientIntensity: number;
  /** Directional (sun) light color (hex) */
  sunColor: number;
  /** Directional light intensity */
  sunIntensity: number;
  /** Scene clear/background color (hex) */
  clearColor: number;
}

export const BIOME_CONFIGS: Record<BiomeType, BiomeConfig> = {
  temperate: {
    id: 'temperate',
    floorType: 'GRASS',
    waterCoverage: [0.04, 0.10],
    forestCoverage: [0.04, 0.10],
    stoneCoverage: [0.03, 0.07],
    specialCoverage: [0, 0],
    riverCount: [0, 2],
    goldMineCount: [5, 8],
    ambientColor: 0xffffff,
    ambientIntensity: 0.5,
    sunColor: 0xffeedd,
    sunIntensity: 0.8,
    clearColor: 0x0d0d15,
  },
  volcanic: {
    id: 'volcanic',
    floorType: 'DIRT',
    waterCoverage: [0.00, 0.02],
    forestCoverage: [0.02, 0.04],
    stoneCoverage: [0.08, 0.12],
    specialCoverage: [0.08, 0.12],
    specialTerrain: 'LAVA',
    riverCount: [0, 0],
    goldMineCount: [5, 8],
    ambientColor: 0xffccaa,
    ambientIntensity: 0.45,
    sunColor: 0xff9944,
    sunIntensity: 0.7,
    clearColor: 0x1a0a05,
  },
  tundra: {
    id: 'tundra',
    floorType: 'GRASS',
    waterCoverage: [0.03, 0.06],
    forestCoverage: [0.03, 0.05],
    stoneCoverage: [0.05, 0.08],
    specialCoverage: [0.10, 0.15],
    specialTerrain: 'ICE',
    riverCount: [0, 1],
    goldMineCount: [5, 7],
    ambientColor: 0xccddff,
    ambientIntensity: 0.55,
    sunColor: 0xaabbee,
    sunIntensity: 0.7,
    clearColor: 0x0a0d18,
  },
  jungle: {
    id: 'jungle',
    floorType: 'GRASS',
    waterCoverage: [0.05, 0.08],
    forestCoverage: [0.35, 0.45],
    stoneCoverage: [0.02, 0.04],
    specialCoverage: [0, 0],
    riverCount: [1, 2],
    goldMineCount: [5, 7],
    ambientColor: 0xbbddaa,
    ambientIntensity: 0.45,
    sunColor: 0xddeeaa,
    sunIntensity: 0.65,
    clearColor: 0x050d08,
  },
  desert: {
    id: 'desert',
    floorType: 'SAND',
    waterCoverage: [0.01, 0.03],
    forestCoverage: [0.01, 0.02],
    stoneCoverage: [0.03, 0.05],
    specialCoverage: [0.05, 0.08],
    specialTerrain: 'RUBBLE',
    riverCount: [0, 0],
    goldMineCount: [4, 7],
    ambientColor: 0xffeebb,
    ambientIntensity: 0.6,
    sunColor: 0xffddaa,
    sunIntensity: 0.9,
    clearColor: 0x15120a,
  },
};

/** Get all biome IDs */
export function getBiomeIds(): BiomeType[] {
  return Object.keys(BIOME_CONFIGS) as BiomeType[];
}
