import * as THREE from 'three';
import { Entity } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { EntityMeshFactory } from './EntityMeshFactory';
import { TileMapMesh } from './TileMapMesh';
import { EventBus } from '../EventBus';
import { HealthComponent } from '../components/HealthComponent';
import { MoverComponent } from '../components/MoverComponent';
import { CombatComponent } from '../components/CombatComponent';
import { CameraController } from './CameraController';
import { SPRITE_UNIT_TYPES, facingToDirection8 } from './sprites/SpriteSheetConfig';
import { SpriteSheetManager } from './sprites/SpriteSheetManager';
import { SpriteBillboard } from './sprites/SpriteBillboard';
import { SpriteAnimator } from './sprites/SpriteAnimator';

interface FlashState {
  timer: number;
  originals: Map<THREE.Mesh, { color: THREE.Color; intensity: number }>;
  /** For sprite flashes, store original tint color */
  spriteOrigColor?: THREE.Color;
}

interface ShakeState {
  timer: number;
  intensity: number;
  baseX: number;
  baseZ: number;
}

interface AttackAnimState {
  timer: number;
  duration: number;
  phase: 'lunge' | 'return';
  offsetX: number;
  offsetZ: number;
  baseX: number;
  baseZ: number;
}

/**
 * Bridges Entity objects to 3D meshes or 2D sprite billboards.
 * Infantry units use billboarded sprites; buildings and vehicles use 3D meshes.
 */
export class EntityRenderer {
  private meshes = new Map<string, THREE.Object3D>();
  private factory: EntityMeshFactory;
  private scene: THREE.Scene;
  private tileMap: TileMapMesh | null = null;
  private cameraController: CameraController | null = null;

  /** Set of entity IDs that are currently selected (rendered with highlight) */
  private selectedIds = new Set<string>();

  // Sprite state
  private spriteSheetManager: SpriteSheetManager | null = null;
  private sprites = new Map<string, SpriteBillboard[]>();
  private animators = new Map<string, SpriteAnimator[]>();
  /** Track which entities use sprites vs 3D meshes */
  private spriteEntities = new Set<string>();

  // VFX state
  private activeFlashes = new Map<string, FlashState>();
  private selectionRings = new Map<string, THREE.Mesh>();
  private shakes = new Map<string, ShakeState>();
  private attackAnims = new Map<string, AttackAnimState>();

  constructor(scene: THREE.Scene, cameraController?: CameraController) {
    this.scene = scene;
    this.factory = new EntityMeshFactory();
    this.cameraController = cameraController ?? null;

    // Listen for combat events
    EventBus.on('damage-dealt', this.onDamageDealt, this);
    EventBus.on('attack-fired', this.onAttackFired, this);
  }

  /** Set the camera controller reference for sprite billboarding. */
  setCameraController(cc: CameraController): void {
    this.cameraController = cc;
  }

  /** Set the sprite sheet manager for sprite rendering. */
  setSpriteSheetManager(manager: SpriteSheetManager): void {
    this.spriteSheetManager = manager;
  }

  /** Set the tile map reference for height-aware positioning */
  setTileMap(tileMap: TileMapMesh): void {
    this.tileMap = tileMap;
  }

  /** Called each frame — syncs all entities to 3D meshes or sprite billboards. */
  syncAll(entities: Entity[]): void {
    const activeIds = new Set<string>();
    const cameraPos = this.cameraController?.camera.position;
    const cameraAzimuth = this.cameraController?.azimuth ?? 0;

    for (const entity of entities) {
      if (!entity.active) continue;
      activeIds.add(entity.entityId);

      let mesh = this.meshes.get(entity.entityId);

      // Create mesh if missing
      if (!mesh) {
        const isSprite = this.shouldUseSprite(entity);

        if (isSprite) {
          mesh = this.createSpriteEntity(entity);
        } else {
          const meshType = this.getMeshType(entity);
          const squadSize = (entity instanceof Unit) ? (entity.stats.squadSize || 1) : 1;

          if (squadSize > 1) {
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
        }

        mesh.userData.entityId = entity.entityId;
        mesh.userData.team = entity.team;
        mesh.userData.squadSize = (entity instanceof Unit) ? (entity.stats.squadSize || 1) : 1;
        this.scene.add(mesh);
        this.meshes.set(entity.entityId, mesh);
      }

      // Position: tile coords map 1:1 to world XZ, height from tile map
      {
        let px = entity.tileX;
        let pz = entity.tileY;

        // For units with Mover, use fractional tile position for smooth movement
        if (entity instanceof Unit) {
          const mover = entity.getComponent<MoverComponent>('mover');
          if (mover) {
            px = mover.fracTileX;
            pz = mover.fracTileY;
          }
        }

        const py = this.tileMap ? this.tileMap.getHeightAt(px, pz) : 0;

        // Apply shake offset if active
        const shake = this.shakes.get(entity.entityId);
        if (shake) {
          mesh.position.set(px + Math.sin(shake.timer * 30) * shake.intensity, py, pz);
        } else {
          mesh.position.set(px, py, pz);
        }

        // Apply attack anim offset (only for 3D entities, sprites handle attack via anim frames)
        if (!this.spriteEntities.has(entity.entityId)) {
          const anim = this.attackAnims.get(entity.entityId);
          if (anim) {
            const progress = anim.phase === 'lunge'
              ? 1 - (anim.timer / anim.duration)
              : anim.timer / anim.duration;
            const t = anim.phase === 'lunge' ? progress : (1 - progress);
            mesh.position.x += anim.offsetX * t;
            mesh.position.z += anim.offsetZ * t;
          }
        }
      }

      // Visibility (fog of war controlled via entity.visible)
      mesh.visible = entity.visible;

      // Update sprites per frame (animation, billboarding, direction)
      if (this.spriteEntities.has(entity.entityId) && entity instanceof Unit) {
        this.updateSpriteEntity(entity, mesh, cameraPos, cameraAzimuth);
      }

      // Squad casualty visuals — hide models as HP drops
      if (entity instanceof Unit && mesh.userData.squadSize > 1) {
        this.updateSquadCasualties(entity, mesh);
      }

      // Sync selection ring position
      const ring = this.selectionRings.get(entity.entityId);
      if (ring) {
        ring.position.set(mesh.position.x, (this.tileMap ? this.tileMap.getHeightAt(entity.tileX, entity.tileY) : 0) + 0.02, mesh.position.z);
        ring.visible = entity.visible;
      }
    }

    // Remove meshes for dead/despawned entities
    for (const [id, mesh] of this.meshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
        // Clean up sprite state
        if (this.spriteEntities.has(id)) {
          const spriteBillboards = this.sprites.get(id);
          if (spriteBillboards) {
            for (const sb of spriteBillboards) sb.dispose();
          }
          this.sprites.delete(id);
          this.animators.delete(id);
          this.spriteEntities.delete(id);
        }
        // Clean up selection ring
        const ring = this.selectionRings.get(id);
        if (ring) {
          this.scene.remove(ring);
          ring.geometry.dispose();
          (ring.material as THREE.Material).dispose();
          this.selectionRings.delete(id);
        }
        // Clean up VFX state
        this.activeFlashes.delete(id);
        this.shakes.delete(id);
        this.attackAnims.delete(id);
      }
    }
  }

  /** Determine if an entity should use sprite rendering. */
  private shouldUseSprite(entity: Entity): boolean {
    if (!(entity instanceof Unit)) return false;
    return this.spriteSheetManager != null && SPRITE_UNIT_TYPES.has(entity.unitType);
  }

  /** Create a sprite entity (single or squad). Returns the root Object3D. */
  private createSpriteEntity(entity: Entity): THREE.Object3D {
    const unit = entity as Unit;
    const config = this.spriteSheetManager!.getConfig(unit.unitType);
    if (!config) {
      // Fallback to 3D mesh
      return this.factory.create(this.getMeshType(entity));
    }

    const squadSize = unit.stats.squadSize || 1;
    this.spriteEntities.add(entity.entityId);

    if (squadSize > 1) {
      return this.createSpriteSquad(entity, config, squadSize);
    }

    // Single sprite
    const billboard = new SpriteBillboard(config);
    const animator = new SpriteAnimator();

    this.sprites.set(entity.entityId, [billboard]);
    this.animators.set(entity.entityId, [animator]);

    // Add shadow blob
    this.addShadowBlob(billboard.mesh);

    return billboard.mesh;
  }

  /** Create a squad of sprite billboards in formation. */
  private createSpriteSquad(entity: Entity, config: import('./sprites/SpriteSheetConfig').SpriteSheetConfig, squadSize: number): THREE.Group {
    const squad = new THREE.Group();
    const billboards: SpriteBillboard[] = [];
    const animators: SpriteAnimator[] = [];

    const formations: Record<number, { x: number; z: number }[]> = {
      2: [{ x: -0.25, z: 0 }, { x: 0.25, z: 0 }],
      3: [{ x: 0, z: -0.25 }, { x: -0.28, z: 0.18 }, { x: 0.28, z: 0.18 }],
      4: [{ x: -0.25, z: -0.25 }, { x: 0.25, z: -0.25 }, { x: -0.25, z: 0.25 }, { x: 0.25, z: 0.25 }],
      5: [{ x: 0, z: -0.3 }, { x: -0.3, z: -0.05 }, { x: 0.3, z: -0.05 }, { x: -0.18, z: 0.28 }, { x: 0.18, z: 0.28 }],
      6: [{ x: -0.22, z: -0.3 }, { x: 0.22, z: -0.3 }, { x: -0.35, z: 0 }, { x: 0.35, z: 0 }, { x: -0.22, z: 0.3 }, { x: 0.22, z: 0.3 }],
    };

    const positions = formations[squadSize] || formations[4]!;
    const spriteScale = squadSize <= 3 ? 0.7 : squadSize <= 4 ? 0.6 : 0.5;

    for (let i = 0; i < squadSize; i++) {
      const billboard = new SpriteBillboard(config);
      // Stagger idle start times for variety
      const animator = new SpriteAnimator(i * 120);

      const pos = positions[i] || { x: (Math.random() - 0.5) * 0.3, z: (Math.random() - 0.5) * 0.3 };
      billboard.mesh.position.set(pos.x, 0, pos.z);
      billboard.mesh.scale.setScalar(spriteScale);
      billboard.mesh.userData.squadIndex = i;

      // Add shadow blob per squad member
      this.addShadowBlob(billboard.mesh);

      squad.add(billboard.mesh);
      billboards.push(billboard);
      animators.push(animator);
    }

    this.sprites.set(entity.entityId, billboards);
    this.animators.set(entity.entityId, animators);

    return squad;
  }

  /** Add a flat dark ellipse shadow under a sprite mesh. */
  private addShadowBlob(parentMesh: THREE.Mesh): void {
    const shadowGeo = new THREE.CircleGeometry(0.25, 12);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.01; // Just above ground
    shadow.scale.set(1, 1, 0.6); // Ellipse shape
    parentMesh.add(shadow);
  }

  /** Per-frame update for sprite entities: animation state, direction, billboarding. */
  private updateSpriteEntity(
    unit: Unit,
    mesh: THREE.Object3D,
    cameraPos: THREE.Vector3 | undefined,
    cameraAzimuth: number
  ): void {
    const billboards = this.sprites.get(unit.entityId);
    const animatorList = this.animators.get(unit.entityId);
    if (!billboards || !animatorList) return;

    const config = this.spriteSheetManager?.getConfig(unit.unitType);
    if (!config) return;

    // Determine animation state
    const mover = unit.getComponent<MoverComponent>('mover');
    const combat = unit.getComponent<CombatComponent>('combat');
    const health = unit.getComponent<HealthComponent>('health');

    let targetAnim: 'idle' | 'walk' | 'attack' | 'death' = 'idle';
    if (health && health.currentHp <= 0) {
      targetAnim = 'death';
    } else if (combat?.target?.active) {
      targetAnim = 'attack';
    } else if (mover?.isMoving()) {
      targetAnim = 'walk';
    }

    const direction = facingToDirection8(unit.facing, cameraAzimuth);

    // Update each billboard (single or squad members)
    // deltaMs approximation: use 16ms (~60fps) since we don't get delta here.
    // The actual delta is applied via updateEffects().
    for (let i = 0; i < billboards.length; i++) {
      const billboard = billboards[i];
      const animator = animatorList[i];

      animator.play(targetAnim);
      animator.update(16, config);

      const { offsetX, offsetY } = animator.getUVOffset(direction, config);
      billboard.setFrame(offsetX, offsetY);

      // Y-axis billboarding
      if (cameraPos) {
        billboard.faceCamera(cameraPos);
      }
    }
  }

  /** Set which entities are selected (for highlight rendering + selection rings). */
  setSelected(entityIds: string[]): void {
    // Reset previously selected
    for (const id of this.selectedIds) {
      const mesh = this.meshes.get(id);
      if (mesh) this.setHighlight(mesh, false, id);
      // Remove ring
      const ring = this.selectionRings.get(id);
      if (ring) {
        this.scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
        this.selectionRings.delete(id);
      }
    }
    this.selectedIds.clear();

    for (const id of entityIds) {
      this.selectedIds.add(id);
      const mesh = this.meshes.get(id);
      if (mesh) {
        this.setHighlight(mesh, true, id);
        // Add selection ring
        this.addSelectionRing(id, mesh);
      }
    }
  }

  private addSelectionRing(entityId: string, parentMesh: THREE.Object3D): void {
    const team = parentMesh.userData.team as string;
    const color = team === 'player' ? 0x44ff88 : 0xff4444;
    const isSprite = this.spriteEntities.has(entityId);

    let selectionMesh: THREE.Mesh;

    if (isSprite) {
      // Ground square highlight for sprite units
      const size = parentMesh.userData.squadSize > 1 ? 1.2 : 0.8;
      const geometry = new THREE.PlaneGeometry(size, size);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      selectionMesh = new THREE.Mesh(geometry, material);

      // Add a brighter border edge using a slightly larger wireframe square
      const borderGeo = new THREE.PlaneGeometry(size + 0.06, size + 0.06);
      borderGeo.rotateX(-Math.PI / 2);
      const borderMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
        wireframe: true,
      });
      const border = new THREE.Mesh(borderGeo, borderMat);
      border.position.y = -0.005;
      selectionMesh.add(border);
    } else {
      // Circle ring for 3D mesh units/buildings
      const geometry = new THREE.RingGeometry(0.35, 0.45, 24);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      selectionMesh = new THREE.Mesh(geometry, material);
    }

    selectionMesh.position.copy(parentMesh.position);
    selectionMesh.position.y += 0.02;
    this.scene.add(selectionMesh);
    this.selectionRings.set(entityId, selectionMesh);
  }

  private setHighlight(obj: THREE.Object3D, on: boolean, entityId?: string): void {
    // Sprite path: no tinting, selection is shown via ground square only
    if (entityId && this.spriteEntities.has(entityId)) {
      return;
    }

    // 3D mesh path
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive.set(on ? 0x44ff88 : 0x000000);
        child.material.emissiveIntensity = on ? 0.4 : 0;
      }
    });
  }

  // ── VFX: Hit Flash ──────────────────────────────────────────

  private onDamageDealt = (data: { attacker: Entity; target: Entity; amount: number }): void => {
    const targetId = data.target.entityId;
    this.flashEntity(targetId, 0xff4444, 120);

    // Heavy hit shake: >20% of max HP
    const health = data.target.getComponent<HealthComponent>('health');
    if (health && data.amount / health.maxHp > 0.2) {
      this.shakes.set(targetId, { timer: 200, intensity: 0.08, baseX: 0, baseZ: 0 });
    }
  };

  flashEntity(entityId: string, color: number = 0xff4444, duration: number = 120): void {
    const mesh = this.meshes.get(entityId);
    if (!mesh) return;

    // Sprite flash path
    if (this.spriteEntities.has(entityId)) {
      const billboards = this.sprites.get(entityId);
      if (billboards) {
        const origColor = billboards[0]?.mesh.material.color.clone();
        for (const bb of billboards) {
          bb.setTint(color);
        }
        this.activeFlashes.set(entityId, {
          timer: duration,
          originals: new Map(),
          spriteOrigColor: origColor,
        });
      }
      return;
    }

    // 3D mesh flash path
    const originals = new Map<THREE.Mesh, { color: THREE.Color; intensity: number }>();
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        originals.set(child, {
          color: child.material.emissive.clone(),
          intensity: child.material.emissiveIntensity,
        });
        child.material.emissive.set(color);
        child.material.emissiveIntensity = 0.8;
      }
    });

    this.activeFlashes.set(entityId, { timer: duration, originals });
  }

  // ── VFX: Attack Animation ───────────────────────────────────

  private onAttackFired = (data: {
    attackerId: string; targetId: string; isRanged: boolean;
    fromX: number; fromY: number; toX: number; toY: number;
  }): void => {
    // Skip lunge/recoil for sprite entities — they use sprite attack animation
    if (this.spriteEntities.has(data.attackerId)) return;

    const dx = data.toX - data.fromX;
    const dz = data.toY - data.fromY;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;

    if (data.isRanged) {
      // Recoil: offset away from target
      const dist = 0.05;
      this.attackAnims.set(data.attackerId, {
        timer: 60, duration: 60,
        phase: 'lunge',
        offsetX: -(dx / len) * dist,
        offsetZ: -(dz / len) * dist,
        baseX: 0, baseZ: 0,
      });
    } else {
      // Lunge: offset toward target
      const dist = 0.15;
      this.attackAnims.set(data.attackerId, {
        timer: 80, duration: 80,
        phase: 'lunge',
        offsetX: (dx / len) * dist,
        offsetZ: (dz / len) * dist,
        baseX: 0, baseZ: 0,
      });
    }
  };

  // ── VFX Update (called from GameRenderer) ───────────────────

  updateEffects(deltaMs: number): void {
    // Flashes
    for (const [id, flash] of this.activeFlashes) {
      flash.timer -= deltaMs;
      if (flash.timer <= 0) {
        // Sprite flash restore
        if (this.spriteEntities.has(id)) {
          const billboards = this.sprites.get(id);
          if (billboards) {
            if (flash.spriteOrigColor) {
              for (const bb of billboards) {
                bb.mesh.material.color.copy(flash.spriteOrigColor);
              }
            } else {
              for (const bb of billboards) bb.clearTint();
            }
          }
        } else {
          // 3D mesh flash restore
          for (const [child, orig] of flash.originals) {
            if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.emissive.copy(orig.color);
              child.material.emissiveIntensity = orig.intensity;
            }
          }
        }
        this.activeFlashes.delete(id);
      }
    }

    // Shakes
    for (const [id, shake] of this.shakes) {
      shake.timer -= deltaMs;
      if (shake.timer <= 0) {
        this.shakes.delete(id);
      }
    }

    // Attack anims
    for (const [id, anim] of this.attackAnims) {
      anim.timer -= deltaMs;
      if (anim.timer <= 0) {
        if (anim.phase === 'lunge') {
          // Switch to return phase
          anim.phase = 'return';
          anim.timer = anim.duration;
        } else {
          this.attackAnims.delete(id);
        }
      }
    }
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

  /** Create a group of 3D model clones arranged in a tight formation within a tile. */
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
    const health = unit.getComponent<HealthComponent>('health');
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
    EventBus.off('damage-dealt', this.onDamageDealt, this);
    EventBus.off('attack-fired', this.onAttackFired, this);

    // Clean up sprites
    for (const [, billboards] of this.sprites) {
      for (const bb of billboards) bb.dispose();
    }
    this.sprites.clear();
    this.animators.clear();
    this.spriteEntities.clear();

    // Clean up selection rings
    for (const ring of this.selectionRings.values()) {
      this.scene.remove(ring);
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    }
    this.selectionRings.clear();

    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
    }
    this.meshes.clear();
    this.factory.dispose();
  }
}
