import * as THREE from 'three';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';
import { TerrainType } from '../map/MapManager';
import { createRng } from '../utils/MathUtils';
import { BiomeType } from '../map/BiomeConfig';

interface ProtectedZone {
  x: number;
  y: number;
  radius: number;
}

interface PropInstance {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotY: number;
}

/** Prop type definition */
interface PropDef {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  maxCount: number;
}

/** Biome-specific color palettes for decoration props */
const BIOME_PALETTES: Record<string, { ruin: number; rock: number; bush: number; grass: number; tree: number }> = {
  temperate: { ruin: 0x6a6a5e, rock: 0x888880, bush: 0x3a6630, grass: 0x557744, tree: 0x4a3520 },
  volcanic:  { ruin: 0x5a3030, rock: 0x4a3838, bush: 0x4a4020, grass: 0x605030, tree: 0x3a2a18 },
  tundra:    { ruin: 0x7a7a80, rock: 0x99999a, bush: 0x556660, grass: 0x667766, tree: 0x5a4a3a },
  jungle:    { ruin: 0x5a6a50, rock: 0x6a7a60, bush: 0x1a5520, grass: 0x2a6630, tree: 0x3a2a15 },
  desert:    { ruin: 0x8a8070, rock: 0x9a9080, bush: 0x6a7a30, grass: 0x8a8a50, tree: 0x6a5030 },
};

/**
 * Places decorative props (ruins, rocks, bushes, trees, etc.) on the terrain
 * using InstancedMesh for performance.
 */
export class TerrainDecorations {
  readonly group = new THREE.Group();
  private instancedMeshes: THREE.InstancedMesh[] = [];
  private instanceColors: Float32Array[] = [];
  /** Maps tile coord "x,y" → list of (meshIndex, instanceIndex) for fog tinting */
  private tileToInstances = new Map<string, { meshIdx: number; instIdx: number }[]>();

  constructor(
    terrainGrid: TerrainType[][],
    heightMap: number[][],
    protectedPositions: ProtectedZone[],
    seed: number = 12345,
    biome?: BiomeType
  ) {
    this.build(terrainGrid, heightMap, protectedPositions, seed, biome);
  }

  private isProtected(x: number, y: number, zones: ProtectedZone[]): boolean {
    for (const z of zones) {
      if (Math.abs(x - z.x) <= z.radius && Math.abs(y - z.y) <= z.radius) return true;
    }
    return false;
  }

  private build(
    terrain: TerrainType[][],
    heightMap: number[][],
    protectedZones: ProtectedZone[],
    seed: number,
    biome?: BiomeType
  ): void {
    const rng = createRng(seed);
    const b = biome ?? 'temperate';

    // Collect placement candidates per prop type
    const ruinPositions: PropInstance[] = [];
    const rockPositions: PropInstance[] = [];
    const bushPositions: PropInstance[] = [];
    const grassTuftPositions: PropInstance[] = [];
    const treePositions: PropInstance[] = [];
    const reedPositions: PropInstance[] = [];
    const skullPositions: PropInstance[] = [];

    const pipePositions: PropInstance[] = [];
    const controlPanelPositions: PropInstance[] = [];
    const gratingPositions: PropInstance[] = [];

    // Biome-specific prop positions
    const lavaPillarPositions: PropInstance[] = [];
    const iceShardPositions: PropInstance[] = [];
    const cactusPositions: PropInstance[] = [];
    const vinePositions: PropInstance[] = [];

    // Track which tiles have ruins (for skull placement)
    const ruinTiles = new Set<string>();

    // Detect if this is a Space Hulk map
    const isSpaceHulk = terrain.some(row => row?.some(t => t === TerrainType.METAL_FLOOR));

    // Pass 1: Place ruins on Dirt/Stone tiles
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const t = terrain[y]?.[x] ?? TerrainType.GRASS;
        if (this.isProtected(x, y, protectedZones)) continue;
        const h = heightMap[y]?.[x] ?? 0;

        if (t === TerrainType.DIRT || t === TerrainType.STONE) {
          if (rng() < 0.18) {
            ruinPositions.push({
              x, y: h, z: y,
              scaleX: 0.7 + rng() * 0.6,
              scaleY: 0.6 + rng() * 0.8,
              scaleZ: 0.7 + rng() * 0.6,
              rotY: rng() * Math.PI * 2,
            });
            ruinTiles.add(`${x},${y}`);
          }
        }
      }
    }

    // Pass 2: Natural props
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const t = terrain[y]?.[x] ?? TerrainType.GRASS;
        if (this.isProtected(x, y, protectedZones)) continue;
        const h = heightMap[y]?.[x] ?? 0;

        switch (t) {
          case TerrainType.STONE:
          case TerrainType.DIRT:
            // Rocks: 1-3 per tile, ~40% chance
            if (rng() < 0.4) {
              const count = 1 + Math.floor(rng() * 3);
              for (let i = 0; i < count; i++) {
                rockPositions.push({
                  x: x + (rng() - 0.5) * 0.7,
                  y: h,
                  z: y + (rng() - 0.5) * 0.7,
                  scaleX: 0.3 + rng() * 0.5,
                  scaleY: 0.3 + rng() * 0.4,
                  scaleZ: 0.3 + rng() * 0.5,
                  rotY: rng() * Math.PI * 2,
                });
              }
            }
            break;

          case TerrainType.GRASS:
            // Bushes: sparse (~12%)
            if (rng() < 0.12) {
              bushPositions.push({
                x: x + (rng() - 0.5) * 0.5,
                y: h,
                z: y + (rng() - 0.5) * 0.5,
                scaleX: 0.5 + rng() * 0.5,
                scaleY: 0.4 + rng() * 0.4,
                scaleZ: 0.5 + rng() * 0.5,
                rotY: rng() * Math.PI * 2,
              });
            }
            // Grass tufts: ~25%
            if (rng() < 0.25) {
              grassTuftPositions.push({
                x: x + (rng() - 0.5) * 0.6,
                y: h,
                z: y + (rng() - 0.5) * 0.6,
                scaleX: 0.4 + rng() * 0.4,
                scaleY: 0.5 + rng() * 0.6,
                scaleZ: 0.4 + rng() * 0.4,
                rotY: rng() * Math.PI * 2,
              });
            }
            // Reeds near water
            if (this.hasAdjacentTerrain(terrain, x, y, TerrainType.WATER) && rng() < 0.4) {
              reedPositions.push({
                x: x + (rng() - 0.5) * 0.4,
                y: h,
                z: y + (rng() - 0.5) * 0.4,
                scaleX: 0.3 + rng() * 0.2,
                scaleY: 0.8 + rng() * 0.6,
                scaleZ: 0.3 + rng() * 0.2,
                rotY: rng() * Math.PI * 2,
              });
            }
            break;

          case TerrainType.FOREST:
            // Tree trunks: 1-2 per tile
            {
              const treeCount = 1 + Math.floor(rng() * 2);
              for (let i = 0; i < treeCount; i++) {
                treePositions.push({
                  x: x + (rng() - 0.5) * 0.5,
                  y: h,
                  z: y + (rng() - 0.5) * 0.5,
                  scaleX: 0.6 + rng() * 0.4,
                  scaleY: 0.7 + rng() * 0.6,
                  scaleZ: 0.6 + rng() * 0.4,
                  rotY: rng() * Math.PI * 2,
                });
              }
              // Jungle: add vines hanging from trees
              if (b === 'jungle' && rng() < 0.3) {
                vinePositions.push({
                  x: x + (rng() - 0.5) * 0.3,
                  y: h + 0.3,
                  z: y + (rng() - 0.5) * 0.3,
                  scaleX: 0.3 + rng() * 0.2,
                  scaleY: 0.6 + rng() * 0.4,
                  scaleZ: 0.3 + rng() * 0.2,
                  rotY: rng() * Math.PI * 2,
                });
              }
            }
            break;

          case TerrainType.LAVA:
            // Obsidian pillars near lava
            if (rng() < 0.15) {
              lavaPillarPositions.push({
                x: x + (rng() - 0.5) * 0.4,
                y: h,
                z: y + (rng() - 0.5) * 0.4,
                scaleX: 0.4 + rng() * 0.3,
                scaleY: 0.5 + rng() * 0.8,
                scaleZ: 0.4 + rng() * 0.3,
                rotY: rng() * Math.PI * 2,
              });
            }
            break;

          case TerrainType.ICE:
            // Ice shards sticking up
            if (rng() < 0.12) {
              iceShardPositions.push({
                x: x + (rng() - 0.5) * 0.5,
                y: h,
                z: y + (rng() - 0.5) * 0.5,
                scaleX: 0.2 + rng() * 0.2,
                scaleY: 0.4 + rng() * 0.6,
                scaleZ: 0.2 + rng() * 0.2,
                rotY: rng() * Math.PI * 2,
              });
            }
            break;

          case TerrainType.SAND:
            // Cacti on sand (desert only)
            if (b === 'desert' && rng() < 0.04) {
              cactusPositions.push({
                x: x + (rng() - 0.5) * 0.4,
                y: h,
                z: y + (rng() - 0.5) * 0.4,
                scaleX: 0.3 + rng() * 0.2,
                scaleY: 0.5 + rng() * 0.5,
                scaleZ: 0.3 + rng() * 0.2,
                rotY: rng() * Math.PI * 2,
              });
            }
            break;

          case TerrainType.RUBBLE:
            // Extra rock debris on rubble
            if (rng() < 0.5) {
              const count = 1 + Math.floor(rng() * 3);
              for (let i = 0; i < count; i++) {
                rockPositions.push({
                  x: x + (rng() - 0.5) * 0.7,
                  y: h,
                  z: y + (rng() - 0.5) * 0.7,
                  scaleX: 0.2 + rng() * 0.4,
                  scaleY: 0.2 + rng() * 0.3,
                  scaleZ: 0.2 + rng() * 0.4,
                  rotY: rng() * Math.PI * 2,
                });
              }
            }
            break;
        }

        // Space Hulk props on METAL_FLOOR tiles
        if (isSpaceHulk && t === TerrainType.METAL_FLOOR) {
          const adjacentToWall = this.hasAdjacentTerrain(terrain, x, y, TerrainType.HULL_WALL);
          if (adjacentToWall) {
            // Pipes: ~20%
            if (rng() < 0.20) {
              pipePositions.push({
                x: x + (rng() - 0.5) * 0.3,
                y: h,
                z: y + (rng() - 0.5) * 0.3,
                scaleX: 0.8 + rng() * 0.4,
                scaleY: 0.8 + rng() * 0.4,
                scaleZ: 0.8 + rng() * 0.4,
                rotY: rng() * Math.PI * 2,
              });
            }
            // Control panels: ~5%
            if (rng() < 0.05) {
              controlPanelPositions.push({
                x: x + (rng() - 0.5) * 0.3,
                y: h,
                z: y + (rng() - 0.5) * 0.3,
                scaleX: 0.6 + rng() * 0.3,
                scaleY: 0.6 + rng() * 0.3,
                scaleZ: 0.6 + rng() * 0.3,
                rotY: Math.floor(rng() * 4) * (Math.PI / 2),
              });
            }
            // Skull piles near walls: ~3%
            if (rng() < 0.03) {
              skullPositions.push({
                x: x + (rng() - 0.5) * 0.4,
                y: h,
                z: y + (rng() - 0.5) * 0.4,
                scaleX: 0.3 + rng() * 0.2,
                scaleY: 0.3 + rng() * 0.2,
                scaleZ: 0.3 + rng() * 0.2,
                rotY: rng() * Math.PI * 2,
              });
            }
          } else {
            // Floor grating on open floor: ~10%
            if (rng() < 0.10) {
              gratingPositions.push({
                x,
                y: h,
                z: y,
                scaleX: 0.8 + rng() * 0.3,
                scaleY: 1,
                scaleZ: 0.8 + rng() * 0.3,
                rotY: Math.floor(rng() * 2) * (Math.PI / 2),
              });
            }
          }
        }

        // Skulls near ruins (~8% of tiles adjacent to ruins)
        if (ruinTiles.has(`${x},${y}`) || this.hasAdjacentKey(ruinTiles, x, y)) {
          if (rng() < 0.08) {
            skullPositions.push({
              x: x + (rng() - 0.5) * 0.5,
              y: h,
              z: y + (rng() - 0.5) * 0.5,
              scaleX: 0.3 + rng() * 0.2,
              scaleY: 0.3 + rng() * 0.2,
              scaleZ: 0.3 + rng() * 0.2,
              rotY: rng() * Math.PI * 2,
            });
          }
        }
      }
    }

    // Biome palette shifts for existing props
    const biomePalette = BIOME_PALETTES[b];

    // Build instanced meshes for each prop type
    const propDefs: { instances: PropInstance[]; def: PropDef }[] = [
      {
        instances: ruinPositions,
        def: {
          geometry: this.makeRuinGeometry(),
          material: new THREE.MeshStandardMaterial({ color: biomePalette.ruin, roughness: 0.93 }),
          maxCount: ruinPositions.length,
        },
      },
      {
        instances: rockPositions,
        def: {
          geometry: new THREE.DodecahedronGeometry(0.08, 0),
          material: new THREE.MeshStandardMaterial({ color: biomePalette.rock, roughness: 0.92 }),
          maxCount: rockPositions.length,
        },
      },
      {
        instances: bushPositions,
        def: {
          geometry: new THREE.SphereGeometry(0.12, 6, 4),
          material: new THREE.MeshStandardMaterial({ color: biomePalette.bush, roughness: 0.9 }),
          maxCount: bushPositions.length,
        },
      },
      {
        instances: grassTuftPositions,
        def: {
          geometry: this.makeGrassTuftGeometry(),
          material: new THREE.MeshStandardMaterial({ color: biomePalette.grass, roughness: 0.95 }),
          maxCount: grassTuftPositions.length,
        },
      },
      {
        instances: treePositions,
        def: {
          geometry: this.makeTreeGeometry(),
          material: new THREE.MeshStandardMaterial({ color: biomePalette.tree, roughness: 0.9 }),
          maxCount: treePositions.length,
        },
      },
      {
        instances: reedPositions,
        def: {
          geometry: new THREE.CylinderGeometry(0.01, 0.015, 0.3, 4),
          material: new THREE.MeshStandardMaterial({ color: 0x6a7a44, roughness: 0.9 }),
          maxCount: reedPositions.length,
        },
      },
      {
        instances: skullPositions,
        def: {
          geometry: this.makeSkullPileGeometry(),
          material: new THREE.MeshStandardMaterial({ color: 0xccbb99, roughness: 0.85 }),
          maxCount: skullPositions.length,
        },
      },
      {
        instances: pipePositions,
        def: {
          geometry: this.makePipeGeometry(),
          material: new THREE.MeshStandardMaterial({ color: 0x555560, roughness: 0.5, metalness: 0.5 }),
          maxCount: pipePositions.length,
        },
      },
      {
        instances: controlPanelPositions,
        def: {
          geometry: this.makeControlPanelGeometry(),
          material: new THREE.MeshStandardMaterial({ color: 0x444450, roughness: 0.4, metalness: 0.5 }),
          maxCount: controlPanelPositions.length,
        },
      },
      {
        instances: gratingPositions,
        def: {
          geometry: this.makeGratingGeometry(),
          material: new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.6, metalness: 0.4 }),
          maxCount: gratingPositions.length,
        },
      },
      // Biome-specific props
      {
        instances: lavaPillarPositions,
        def: {
          geometry: this.makeLavaPillarGeometry(),
          material: new THREE.MeshStandardMaterial({ color: 0x2a2020, roughness: 0.95 }),
          maxCount: lavaPillarPositions.length,
        },
      },
      {
        instances: iceShardPositions,
        def: {
          geometry: this.makeIceShardGeometry(),
          material: new THREE.MeshStandardMaterial({ color: 0xaabbdd, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.8 }),
          maxCount: iceShardPositions.length,
        },
      },
      {
        instances: cactusPositions,
        def: {
          geometry: this.makeCactusGeometry(),
          material: new THREE.MeshStandardMaterial({ color: 0x3a6a30, roughness: 0.85 }),
          maxCount: cactusPositions.length,
        },
      },
      {
        instances: vinePositions,
        def: {
          geometry: new THREE.CylinderGeometry(0.01, 0.015, 0.4, 4),
          material: new THREE.MeshStandardMaterial({ color: 0x2a5520, roughness: 0.9 }),
          maxCount: vinePositions.length,
        },
      },
    ];

    const dummy = new THREE.Object3D();

    for (let mi = 0; mi < propDefs.length; mi++) {
      const { instances, def } = propDefs[mi];
      if (instances.length === 0) continue;

      const im = new THREE.InstancedMesh(def.geometry, def.material, instances.length);
      im.frustumCulled = false;

      // Enable instance colors for fog tinting
      const colorArr = new Float32Array(instances.length * 3);
      colorArr.fill(1.0); // white = no tint

      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        dummy.position.set(inst.x, inst.y, inst.z);
        dummy.scale.set(inst.scaleX, inst.scaleY, inst.scaleZ);
        dummy.rotation.set(0, inst.rotY, 0);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);

        // Map tile coord to this instance for fog
        const tileX = Math.round(inst.x);
        const tileZ = Math.round(inst.z);
        const key = `${tileX},${tileZ}`;
        if (!this.tileToInstances.has(key)) {
          this.tileToInstances.set(key, []);
        }
        this.tileToInstances.get(key)!.push({ meshIdx: this.instancedMeshes.length, instIdx: i });
      }

      im.instanceMatrix.needsUpdate = true;

      // Set up instanceColor attribute
      const colorAttr = new THREE.InstancedBufferAttribute(colorArr, 3);
      im.instanceColor = colorAttr;

      this.instancedMeshes.push(im);
      this.instanceColors.push(colorArr);
      this.group.add(im);
    }
  }

  /** Update fog tinting on decorations */
  updateFog(fogGrid: number[][]): void {
    const color = new THREE.Color();

    for (const [key, entries] of this.tileToInstances) {
      const [tx, ty] = key.split(',').map(Number);
      const state = fogGrid[ty]?.[tx] ?? 0;
      let mult: number;
      switch (state) {
        case 0:  mult = 0.15; break; // HIDDEN
        case 1:  mult = 0.8;  break; // EXPLORED
        case 2:  mult = 1.0;  break; // VISIBLE
        default: mult = 0.15;
      }
      color.setRGB(mult, mult, mult);

      for (const { meshIdx, instIdx } of entries) {
        const im = this.instancedMeshes[meshIdx];
        if (im) {
          im.setColorAt(instIdx, color);
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  private hasAdjacentTerrain(terrain: TerrainType[][], x: number, y: number, type: TerrainType): boolean {
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
        if (terrain[ny][nx] === type) return true;
      }
    }
    return false;
  }

  private hasAdjacentKey(set: Set<string>, x: number, y: number): boolean {
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      if (set.has(`${x+dx},${y+dy}`)) return true;
    }
    return false;
  }

  // ── Geometry helpers ──

  /** Simple ruin geometry: a broken wall box */
  private makeRuinGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BoxGeometry(0.5, 0.4, 0.12);
    // Shift up so it sits on ground
    geo.translate(0, 0.2, 0);
    return geo;
  }

  /** Thin box cluster for grass tuft */
  private makeGrassTuftGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BoxGeometry(0.04, 0.15, 0.04);
    geo.translate(0, 0.075, 0);
    return geo;
  }

  /** Cylinder trunk + cone canopy */
  private makeTreeGeometry(): THREE.BufferGeometry {
    // Merge trunk and canopy into one geometry
    const trunk = new THREE.CylinderGeometry(0.04, 0.06, 0.4, 6);
    trunk.translate(0, 0.2, 0);
    const canopy = new THREE.ConeGeometry(0.2, 0.35, 6);
    canopy.translate(0, 0.55, 0);

    // Merge by creating a single buffer geometry
    const merged = new THREE.BufferGeometry();
    const trunkNI = trunk.toNonIndexed();
    const canopyNI = canopy.toNonIndexed();
    const mergedGeo = this.mergeBufferGeometries([trunkNI, canopyNI]);
    trunk.dispose();
    canopy.dispose();
    trunkNI.dispose();
    canopyNI.dispose();
    return mergedGeo;
  }

  /** Small cluster of spheres for skull pile */
  private makeSkullPileGeometry(): THREE.BufferGeometry {
    const s1 = new THREE.SphereGeometry(0.035, 4, 3);
    const s2 = new THREE.SphereGeometry(0.03, 4, 3);
    s2.translate(0.04, 0, 0.02);
    const s3 = new THREE.SphereGeometry(0.025, 4, 3);
    s3.translate(-0.02, 0.03, -0.01);
    const ni1 = s1.toNonIndexed();
    const ni2 = s2.toNonIndexed();
    const ni3 = s3.toNonIndexed();
    const merged = this.mergeBufferGeometries([ni1, ni2, ni3]);
    s1.dispose(); s2.dispose(); s3.dispose();
    ni1.dispose(); ni2.dispose(); ni3.dispose();
    return merged;
  }

  /** Horizontal pipe along a wall */
  private makePipeGeometry(): THREE.BufferGeometry {
    const geo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6);
    geo.rotateZ(Math.PI / 2);
    geo.translate(0, 0.08, 0);
    return geo;
  }

  /** Small box with an emissive-colored top face (control panel) */
  private makeControlPanelGeometry(): THREE.BufferGeometry {
    const box = new THREE.BoxGeometry(0.15, 0.2, 0.08);
    box.translate(0, 0.1, 0);
    return box;
  }

  /** Flat grating on the floor */
  private makeGratingGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BoxGeometry(0.6, 0.02, 0.6);
    geo.translate(0, 0.01, 0);
    return geo;
  }

  /** Obsidian pillar for volcanic biome */
  private makeLavaPillarGeometry(): THREE.BufferGeometry {
    const geo = new THREE.CylinderGeometry(0.06, 0.1, 0.5, 5);
    geo.translate(0, 0.25, 0);
    return geo;
  }

  /** Ice shard crystal for tundra biome */
  private makeIceShardGeometry(): THREE.BufferGeometry {
    const geo = new THREE.ConeGeometry(0.06, 0.35, 4);
    geo.translate(0, 0.175, 0);
    return geo;
  }

  /** Simple cactus for desert biome */
  private makeCactusGeometry(): THREE.BufferGeometry {
    const trunk = new THREE.CylinderGeometry(0.03, 0.04, 0.3, 5);
    trunk.translate(0, 0.15, 0);
    const arm = new THREE.CylinderGeometry(0.02, 0.025, 0.12, 4);
    arm.rotateZ(Math.PI / 2);
    arm.translate(0.06, 0.22, 0);
    const trunkNI = trunk.toNonIndexed();
    const armNI = arm.toNonIndexed();
    const merged = this.mergeBufferGeometries([trunkNI, armNI]);
    trunk.dispose(); arm.dispose(); trunkNI.dispose(); armNI.dispose();
    return merged;
  }

  /** Simple geometry merge for non-indexed geometries */
  private mergeBufferGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    let totalVerts = 0;
    for (const g of geos) totalVerts += g.getAttribute('position').count;

    const pos = new Float32Array(totalVerts * 3);
    const norm = new Float32Array(totalVerts * 3);
    let offset = 0;

    for (const g of geos) {
      const gPos = g.getAttribute('position').array as Float32Array;
      const gNorm = g.getAttribute('normal')?.array as Float32Array | undefined;
      pos.set(gPos, offset * 3);
      if (gNorm) norm.set(gNorm, offset * 3);
      offset += g.getAttribute('position').count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    return merged;
  }

  dispose(): void {
    for (const im of this.instancedMeshes) {
      im.geometry.dispose();
      (im.material as THREE.Material).dispose();
      im.dispose();
    }
    this.instancedMeshes.length = 0;
  }
}
