import * as THREE from 'three';
import { CameraController } from './CameraController';
import { TileMapMesh } from './TileMapMesh';
import { EntityRenderer } from './EntityRenderer';
import { InputBridge } from './InputBridge';
import { FogRenderer } from './FogRenderer';
import { VFXRenderer } from './VFXRenderer';
import { TerrainDecorations } from './TerrainDecorations';
import { TerrainType } from '../map/MapManager';
import { Entity } from '../entities/Entity';
import { EventBus } from '../EventBus';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';
import { SpriteSheetManager } from './sprites/SpriteSheetManager';

/**
 * Top-level three.js renderer. Owns the WebGL canvas, scene, camera controller,
 * and the render loop.
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly cameraController: CameraController;
  readonly entityRenderer: EntityRenderer;
  readonly inputBridge: InputBridge;
  readonly vfxRenderer: VFXRenderer;
  readonly spriteSheetManager: SpriteSheetManager;

  private tileMap: TileMapMesh | null = null;
  private fogRenderer: FogRenderer | null = null;
  private decorations: TerrainDecorations | null = null;
  private animationFrameId = 0;
  private lastTime = 0;
  private ambientLight: THREE.AmbientLight;
  private sunLight: THREE.DirectionalLight;

  /** Entities to sync — set externally each frame or via event. */
  private currentEntities: Entity[] = [];

  constructor(container: HTMLElement) {
    // Create WebGL renderer sized to fill the container
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x0d0d15);

    // Position the three.js canvas
    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '0';
    container.style.position = 'relative';
    container.insertBefore(canvas, container.firstChild);

    // Scene
    this.scene = new THREE.Scene();

    // Lighting — ambient + directional sun
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambientLight);
    this.sunLight = new THREE.DirectionalLight(0xffeedd, 0.8);
    this.sunLight.position.set(MAP_WIDTH, 30, MAP_HEIGHT * 0.3);
    this.sunLight.lookAt(MAP_WIDTH / 2, 0, MAP_HEIGHT / 2);
    this.scene.add(this.sunLight);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.cameraController = new CameraController(canvas, aspect);

    // Sprite sheet manager — generate placeholder sprite sheets, then load real ones async
    this.spriteSheetManager = new SpriteSheetManager();
    this.spriteSheetManager.generatePlaceholders();
    // Load real sprite sheets in background — they'll replace placeholders once loaded
    this.spriteSheetManager.loadRealSheets();

    // Entity renderer — pass camera controller and sprite sheet manager
    this.entityRenderer = new EntityRenderer(this.scene, this.cameraController);
    this.entityRenderer.setSpriteSheetManager(this.spriteSheetManager);

    // VFX renderer
    this.vfxRenderer = new VFXRenderer(this.scene);
    this.vfxRenderer.camera = this.cameraController.camera;

    // Attach CSS overlays to game container
    if ((this.vfxRenderer as any).floatingTextContainer) {
      container.appendChild((this.vfxRenderer as any).floatingTextContainer);
    }
    if ((this.vfxRenderer as any).mineTooltipEl) {
      container.appendChild((this.vfxRenderer as any).mineTooltipEl);
    }

    // Input bridge
    this.inputBridge = new InputBridge(
      this.cameraController.camera,
      canvas,
      this.entityRenderer
    );

    // Listen for entity sync from GameScene
    EventBus.on('entities-sync', this.onEntitiesSync, this);
    // Listen for fog updates
    EventBus.on('fog-updated', this.onFogUpdated, this);
    // Listen for selection highlights
    EventBus.on('selection-highlight', this.onSelectionHighlight, this);

    // Resize handling
    window.addEventListener('resize', this.onResize);
  }

  /**
   * Build the 3D tile map from a 2D terrain grid (from MapManager).
   * Call this once after MapManager has loaded mission terrain.
   * protectedPositions is optional — if provided, decorations avoid those zones.
   */
  buildTileMap(
    terrainGrid: TerrainType[][],
    protectedPositions?: { x: number; y: number; radius: number }[],
    mapType?: string
  ): void {
    if (this.tileMap) {
      this.scene.remove(this.tileMap.group);
      this.tileMap.dispose();
    }
    if (this.decorations) {
      this.scene.remove(this.decorations.group);
      this.decorations.dispose();
    }

    this.tileMap = new TileMapMesh(terrainGrid);
    this.scene.add(this.tileMap.group);

    // Pass tile map to entity renderer for height-aware positioning
    this.entityRenderer.setTileMap(this.tileMap);

    // Create terrain decorations
    const zones = protectedPositions ?? [];
    this.decorations = new TerrainDecorations(
      terrainGrid,
      this.tileMap.getHeightMap(),
      zones,
      12345
    );
    this.scene.add(this.decorations.group);

    // Create fog renderer now that we have a tile map
    this.fogRenderer = new FogRenderer(this.tileMap, this.scene, this.decorations);

    // Adjust lighting for Space Hulk maps — darker, cooler atmosphere
    if (mapType === 'space_hulk') {
      this.ambientLight.intensity = 0.25;
      this.sunLight.color.set(0xccddff);
    } else {
      this.ambientLight.intensity = 0.5;
      this.sunLight.color.set(0xffeedd);
    }
  }

  /** Start the render loop. */
  start(): void {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      this.animationFrameId = requestAnimationFrame(loop);
      const deltaMs = now - this.lastTime;
      this.lastTime = now;

      this.cameraController.tick();

      // Sync entity meshes
      this.entityRenderer.syncAll(this.currentEntities);

      // Update entity VFX (hit flash, shakes, attack anims)
      this.entityRenderer.updateEffects(deltaMs);

      // Sync HP bars
      this.vfxRenderer.syncHpBars(this.currentEntities);

      // Update VFX
      this.vfxRenderer.update(deltaMs);

      // Animate fog particles
      if (this.fogRenderer) {
        this.fogRenderer.tick(deltaMs);
      }

      // Animate water
      if (this.tileMap) {
        this.tileMap.animateWater(deltaMs);
      }

      this.renderer.render(this.scene, this.cameraController.camera);
    };
    requestAnimationFrame(loop);
  }

  /** Stop the render loop. */
  stop(): void {
    cancelAnimationFrame(this.animationFrameId);
  }

  private onEntitiesSync = (entities: Entity[]): void => {
    this.currentEntities = entities;
  };

  private onFogUpdated = (fogGrid: number[][]): void => {
    if (this.fogRenderer) {
      this.fogRenderer.updateFog(fogGrid);
    }
  };

  private onSelectionHighlight = (entityIds: string[]): void => {
    this.entityRenderer.setSelected(entityIds);
  };

  private onResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.renderer.setSize(w, h);
    this.cameraController.resize(w / h);
  };

  dispose(): void {
    this.stop();
    EventBus.off('entities-sync', this.onEntitiesSync, this);
    EventBus.off('fog-updated', this.onFogUpdated, this);
    EventBus.off('selection-highlight', this.onSelectionHighlight, this);
    window.removeEventListener('resize', this.onResize);
    this.cameraController.dispose();
    this.inputBridge.dispose();
    this.entityRenderer.dispose();
    this.spriteSheetManager.dispose();
    this.vfxRenderer.dispose();
    if (this.decorations) {
      this.scene.remove(this.decorations.group);
      this.decorations.dispose();
    }
    if (this.tileMap) {
      this.scene.remove(this.tileMap.group);
      this.tileMap.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
