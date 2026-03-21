import { describe, it, expect } from 'vitest';
import { generateMission } from '../missions/ProceduralMissionGenerator';
import { MapManager, TerrainType } from '../map/MapManager';
import { BIOME_CONFIGS, getBiomeIds } from '../map/BiomeConfig';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';
import { HealthComponent } from '../components/HealthComponent';
import { Entity } from '../entities/Entity';

describe('Biome terrain generation', () => {
  it('generated missions have a biome field in terrain params', () => {
    // Generate many missions; at least some should have non-temperate biomes
    const biomes = new Set<string>();
    for (let s = 1; s <= 50; s++) {
      const mission = generateMission(2, s);
      if (mission.terrain?.biome) {
        biomes.add(mission.terrain.biome);
      }
    }
    // With 5 biomes and 50 seeds, we should see at least 3 distinct biomes
    expect(biomes.size).toBeGreaterThanOrEqual(3);
  });

  it('space_hulk missions default to temperate biome', () => {
    const mission = generateMission(3, 42, undefined, 'deep_infiltration');
    // space_hulk doesn't set biome (it's only for outdoor)
    expect(mission.terrain?.biome).toBeUndefined();
  });

  it('outdoor missions have specialCoverage in terrain params', () => {
    let foundSpecial = false;
    for (let s = 1; s <= 50; s++) {
      const mission = generateMission(2, s);
      if (mission.terrain?.mapType !== 'space_hulk' && mission.terrain?.specialCoverage) {
        if (mission.terrain.specialCoverage > 0) {
          foundSpecial = true;
          break;
        }
      }
    }
    expect(foundSpecial).toBe(true);
  });

  describe('MapManager generates biome-specific terrain', () => {
    it('volcanic biome produces LAVA tiles', () => {
      const mission = generateMission(2, 42);
      // Override to volcanic
      mission.terrain = {
        ...mission.terrain,
        biome: 'volcanic',
        specialCoverage: 0.1,
        waterCoverage: 0.01,
        forestCoverage: 0.02,
      };
      const map = new MapManager();
      map.loadMissionTerrain(mission);

      const grid = map.getTerrainGrid();
      let lavaCount = 0;
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (grid[y][x] === TerrainType.LAVA) lavaCount++;
        }
      }
      expect(lavaCount).toBeGreaterThan(0);
    });

    it('tundra biome produces ICE tiles', () => {
      const mission = generateMission(2, 42);
      mission.terrain = {
        ...mission.terrain,
        biome: 'tundra',
        specialCoverage: 0.1,
        waterCoverage: 0.03,
        forestCoverage: 0.03,
      };
      const map = new MapManager();
      map.loadMissionTerrain(mission);

      const grid = map.getTerrainGrid();
      let iceCount = 0;
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (grid[y][x] === TerrainType.ICE) iceCount++;
        }
      }
      expect(iceCount).toBeGreaterThan(0);
    });

    it('desert biome uses SAND as floor type', () => {
      const mission = generateMission(2, 42);
      mission.terrain = {
        ...mission.terrain,
        biome: 'desert',
        specialCoverage: 0.05,
        waterCoverage: 0.01,
        forestCoverage: 0.01,
      };
      const map = new MapManager();
      map.loadMissionTerrain(mission);

      const grid = map.getTerrainGrid();
      let sandCount = 0;
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (grid[y][x] === TerrainType.SAND) sandCount++;
        }
      }
      // Sand should be the most common tile (floor type)
      expect(sandCount).toBeGreaterThan(MAP_WIDTH * MAP_HEIGHT * 0.3);
    });

    it('desert biome produces RUBBLE tiles', () => {
      const mission = generateMission(2, 42);
      mission.terrain = {
        ...mission.terrain,
        biome: 'desert',
        specialCoverage: 0.08,
        waterCoverage: 0.01,
        forestCoverage: 0.01,
      };
      const map = new MapManager();
      map.loadMissionTerrain(mission);

      const grid = map.getTerrainGrid();
      let rubbleCount = 0;
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (grid[y][x] === TerrainType.RUBBLE) rubbleCount++;
        }
      }
      expect(rubbleCount).toBeGreaterThan(0);
    });

    it('temperate biome produces no special terrain', () => {
      const mission = generateMission(2, 42);
      mission.terrain = {
        ...mission.terrain,
        biome: 'temperate',
        specialCoverage: 0,
      };
      const map = new MapManager();
      map.loadMissionTerrain(mission);

      const grid = map.getTerrainGrid();
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const t = grid[y][x];
          expect(t).not.toBe(TerrainType.LAVA);
          expect(t).not.toBe(TerrainType.ICE);
          expect(t).not.toBe(TerrainType.RUBBLE);
          expect(t).not.toBe(TerrainType.SAND);
        }
      }
    });
  });

  describe('walkability', () => {
    it('LAVA tiles are not walkable', () => {
      const map = new MapManager();
      const grid = map.getTerrainGrid();
      grid[5][5] = TerrainType.LAVA;
      expect(map.isWalkable(5, 5)).toBe(false);
    });

    it('ICE tiles are walkable', () => {
      const map = new MapManager();
      const grid = map.getTerrainGrid();
      grid[5][5] = TerrainType.ICE;
      expect(map.isWalkable(5, 5)).toBe(true);
    });

    it('SAND tiles are walkable', () => {
      const map = new MapManager();
      const grid = map.getTerrainGrid();
      grid[5][5] = TerrainType.SAND;
      expect(map.isWalkable(5, 5)).toBe(true);
    });

    it('RUBBLE tiles are walkable', () => {
      const map = new MapManager();
      const grid = map.getTerrainGrid();
      grid[5][5] = TerrainType.RUBBLE;
      expect(map.isWalkable(5, 5)).toBe(true);
    });
  });

  describe('damage reduction from rubble', () => {
    it('reduces incoming damage by the configured fraction', () => {
      const entity = new Entity(5, 5, 'player');
      const health = new HealthComponent(entity, 100);
      entity.addComponent('health', health);

      health.terrainDamageReduction = 0.25;
      health.takeDamage(20);

      // 20 damage - 0 armor = 20, then * (1 - 0.25) = 15
      expect(health.currentHp).toBe(85);
    });
  });

  describe('biome coverage values in generated missions', () => {
    it('biome terrain params match biome config ranges', () => {
      for (let s = 1; s <= 30; s++) {
        const mission = generateMission(2, s);
        const biome = mission.terrain?.biome;
        if (!biome || mission.terrain?.mapType === 'space_hulk') continue;

        const config = BIOME_CONFIGS[biome];
        const t = mission.terrain!;

        if (t.waterCoverage !== undefined) {
          expect(t.waterCoverage).toBeGreaterThanOrEqual(config.waterCoverage[0] - 0.001);
          expect(t.waterCoverage).toBeLessThanOrEqual(config.waterCoverage[1] + 0.001);
        }
        if (t.forestCoverage !== undefined) {
          expect(t.forestCoverage).toBeGreaterThanOrEqual(config.forestCoverage[0] - 0.001);
          expect(t.forestCoverage).toBeLessThanOrEqual(config.forestCoverage[1] + 0.001);
        }
      }
    });
  });
});
