import * as THREE from 'three';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { EntityMeshFactory } from './EntityMeshFactory';
import { TileMapMesh } from './TileMapMesh';

/**
 * Bridges Entity objects to 3D meshes.
 * Maintains a map of entityId → THREE.Object3D and syncs positions each frame.
 */
export class EntityRenderer {
  private meshes = new Map<string, THREE.Object3D>();
  private factory: EntityMeshFactory;
  private scene: THREE.Scene;
  private tileMap: TileMapMesh | null = null;

  /** Set of entity IDs that are currently selected (rendered with highlight) */
  private selectedIds = new Set<string>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.factory = new EntityMeshFactory();
  }

  /** Set the tile map reference for height-aware positioning */
  setTileMap(tileMap: TileMapMesh): void {
    this.tileMap = tileMap;
  }

  /** Called each frame — syncs all entities to 3D meshes. */
  syncAll(entities: Entity[]): void {
    const activeIds = new Set<string>();

    for (const entity of entities) {
      if (!entity.active) continue;
      activeIds.add(entity.entityId);

      let mesh = this.meshes.get(entity.entityId);

      // Create mesh if missing
      if (!mesh) {
        const meshType = this.getMeshType(entity);
        const squadSize = (entity instanceof Unit) ? (entity.stats.squadSize || 1) : 1;

        if (squadSize > 1) {
          // Squad: create a group with multiple model clones arranged in formation
          mesh = this.createSquadMesh(meshType, squadSize);
        } else {
          mesh = this.factory.create(meshType);
        }

        // Deep-clone materials so each entity has independent emissive/highlight state
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            child.material = (child.material as THREE.Material).clone();
          }
        });
        mesh.userData.entityId = entity.entityId;
        mesh.userData.team = entity.team;
        mesh.userData.squadSize = squadSize;
        this.scene.add(mesh);
        this.meshes.set(entity.entityId, mesh);
      }

      // Position: tile coords map 1:1 to world XZ, height from tile map
      {
        let px = entity.tileX;
        let pz = entity.tileY;

        // For units with Mover, use fractional tile position for smooth movement
        if (entity instanceof Unit) {
          const mover = entity.getComponent<import('../components/MoverComponent').MoverComponent>('mover');
          if (mover) {
            px = mover.fracTileX;
            pz = mover.fracTileY;
          }
        }

        const py = this.tileMap ? this.tileMap.getHeightAt(px, pz) : 0;
        mesh.position.set(px, py, pz);
      }

      // Visibility (fog of war controlled via entity.visible)
      mesh.visible = entity.visible;

      // Squad casualty visuals — hide models as HP drops
      if (entity instanceof Unit && mesh.userData.squadSize > 1) {
        this.updateSquadCasualties(entity, mesh);
      }
    }

    // Remove meshes for dead/despawned entities
    for (const [id, mesh] of this.meshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
  }

  /** Set which entities are selected (for highlight rendering). */
  setSelected(entityIds: string[]): void {
    // Reset previously selected
    for (const id of this.selectedIds) {
      const mesh = this.meshes.get(id);
      if (mesh) this.setHighlight(mesh, false);
    }
    this.selectedIds.clear();

    for (const id of entityIds) {
      this.selectedIds.add(id);
      const mesh = this.meshes.get(id);
      if (mesh) this.setHighlight(mesh, true);
    }
  }

  private setHighlight(obj: THREE.Object3D, on: boolean): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive.set(on ? 0x44ff88 : 0x000000);
        child.material.emissiveIntensity = on ? 0.4 : 0;
      }
    });
  }

  /** Get mesh for an entity (used by InputBridge for raycasting). */
  getMesh(entityId: string): THREE.Object3D | undefined {
    return this.meshes.get(entityId);
  }

  /** Get all meshes (for raycasting). */
  getAllMeshes(): THREE.Object3D[] {
    return Array.from(this.meshes.values());
  }

  /** Find entity ID from a 3D object (walks up to find userData.entityId). */
  findEntityId(object: THREE.Object3D): string | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current.userData.entityId) return current.userData.entityId;
      current = current.parent;
    }
    return null;
  }

  private getMeshType(entity: Entity): string {
    if (entity instanceof Building) {
      return `building-${(entity as Building).buildingType}`;
    }
    if (entity instanceof Unit) {
      return `unit-${(entity as Unit).unitType}`;
    }
    return 'default';
  }

  /** Create a group of model clones arranged in a tight formation within a tile. */
  private createSquadMesh(meshType: string, squadSize: number): THREE.Group {
    const squad = new THREE.Group();

    // Formation offsets — spread models across the tile with clear gaps
    const formations: Record<number, { x: number; z: number }[]> = {
      2: [{ x: -0.25, z: 0 }, { x: 0.25, z: 0 }],
      3: [{ x: 0, z: -0.25 }, { x: -0.28, z: 0.18 }, { x: 0.28, z: 0.18 }],
      4: [{ x: -0.25, z: -0.25 }, { x: 0.25, z: -0.25 }, { x: -0.25, z: 0.25 }, { x: 0.25, z: 0.25 }],
      5: [{ x: 0, z: -0.3 }, { x: -0.3, z: -0.05 }, { x: 0.3, z: -0.05 }, { x: -0.18, z: 0.28 }, { x: 0.18, z: 0.28 }],
      6: [{ x: -0.22, z: -0.3 }, { x: 0.22, z: -0.3 }, { x: -0.35, z: 0 }, { x: 0.35, z: 0 }, { x: -0.22, z: 0.3 }, { x: 0.22, z: 0.3 }],
    };

    const positions = formations[squadSize] || formations[4]!;

    // Scale models down so they fit with spacing
    const modelScale = squadSize <= 3 ? 0.55 : squadSize <= 4 ? 0.5 : 0.42;

    for (let i = 0; i < squadSize; i++) {
      const model = this.factory.create(meshType);
      const pos = positions[i] || { x: (Math.random() - 0.5) * 0.3, z: (Math.random() - 0.5) * 0.3 };
      model.position.set(pos.x, 0, pos.z);
      model.scale.setScalar(modelScale);
      model.userData.squadIndex = i;
      squad.add(model);
    }

    return squad;
  }

  /** Hide squad models as HP drops — models disappear from last to first. */
  private updateSquadCasualties(unit: Unit, mesh: THREE.Object3D): void {
    const health = unit.getComponent<import('../components/HealthComponent').HealthComponent>('health');
    if (!health) return;

    const squadSize = unit.stats.squadSize || 1;
    const hpRatio = health.currentHp / health.maxHp;
    // How many models should still be alive (at least 1 while entity is active)
    const aliveCount = Math.max(1, Math.ceil(hpRatio * squadSize));

    // Squad models are direct children of the group
    const models = mesh.children.filter(c => c.userData.squadIndex !== undefined);
    for (let i = 0; i < models.length; i++) {
      // Kill from the back (highest index first)
      models[i].visible = i < aliveCount;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
    }
    this.meshes.clear();
    this.factory.dispose();
  }
}
