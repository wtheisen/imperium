import * as THREE from 'three';
import { EventBus } from '../EventBus';
import { Entity } from '../entities/Entity';
import { EntityMeshFactory } from './EntityMeshFactory';
import { SQUAD_FORMATIONS } from './SquadFormations';

interface VFXParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  lifetime: number;
  elapsed: number;
  fadeOut: boolean;
  scaleSpeed: number;
  /** If true, geometry is one-off and must be disposed when particle expires */
  disposeGeo: boolean;
}

interface ProjectileVFX {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  duration: number;
  elapsed: number;
}

/**
 * Handles transient 3D visual effects: spawn flashes, death flashes,
 * command indicators, projectile trails, supply pod beacons, objective markers.
 */
export class VFXRenderer {
  private scene: THREE.Scene;
  private particles: VFXParticle[] = [];
  private projectiles: ProjectileVFX[] = [];

  // Persistent markers — store direct refs to animated children to avoid traverse() per frame
  private objectiveMarkers = new Map<string, { group: THREE.Group; spinMesh: THREE.Mesh | null }>();
  private supplyPodMeshes = new Map<string, { group: THREE.Group; pulseMesh: THREE.Mesh | null }>();
  private packMarkers = new Map<string, { group: THREE.Group; pulseMesh: THREE.Mesh | null }>();
  private poiMarkers = new Map<string, { group: THREE.Group; pulseMesh: THREE.Mesh | null; floatMesh: THREE.Mesh | null; ringMesh: THREE.Mesh | null }>();

  // Gold mine models
  private goldMines = new Map<string, { group: THREE.Group; barFill: THREE.Mesh; barBg: THREE.Mesh; label: THREE.Mesh; labelCanvas: HTMLCanvasElement; labelTexture: THREE.CanvasTexture; remaining: number; maxGold: number; glowMesh: THREE.Mesh | null }>();

  // Reusable geometries
  private sphereGeo = new THREE.SphereGeometry(0.1, 8, 6);
  private boxGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);

  // Tile hover ring
  private hoverRing: THREE.Mesh | null = null;
  private hoverRingVisible = false;

  // Placement preview ring (valid/invalid)
  private placementRing: THREE.Mesh | null = null;
  private placementRingMat: THREE.MeshBasicMaterial | null = null;

  // Ghost entity mesh preview during card drag
  private ghostMesh: THREE.Object3D | null = null;
  private ghostMeshType: string = '';
  private ghostFactory: import('./EntityMeshFactory').EntityMeshFactory | null = null;

  // Ordnance reticule & AOE ring
  private ordnanceReticule: THREE.Group | null = null;
  private ordnanceAoeRing: THREE.Mesh | null = null;
  private ordnanceAoeRingMat: THREE.MeshBasicMaterial | null = null;
  private ordnanceReticuleMat: THREE.MeshBasicMaterial | null = null;

  // Projected card label on ground during drag
  private cardLabel: THREE.Mesh | null = null;
  private cardLabelCanvas: HTMLCanvasElement | null = null;
  private cardLabelTexture: THREE.CanvasTexture | null = null;

  // HP bars — billboard sprites per entity
  private hpBars = new Map<string, { bg: THREE.Mesh; fill: THREE.Mesh; border: THREE.Mesh }>();
  private _hpBarActiveIds = new Set<string>();
  private hpBarGeo = new THREE.PlaneGeometry(1, 0.08);
  private hpBarBorderGeo = new THREE.PlaneGeometry(1.06, 0.12);

  // Floating text particles (CSS overlay)
  private floatingTextContainer: HTMLDivElement | null = null;

  // Mine tooltip (CSS overlay)
  private mineTooltipEl: HTMLDivElement | null = null;

  /** Camera reference for projecting 3D positions to screen (set externally). */
  camera: THREE.Camera | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.createHoverRing();
    this.createPlacementRing();
    this.createFloatingTextContainer();
    this.createMineTooltip();
    this.bindEvents();
  }

  private bindEvents(): void {
    EventBus.on('command-indicator-3d', this.onCommandIndicator, this);
    EventBus.on('projectile-spawned', this.onProjectileSpawned, this);
    EventBus.on('card-played-3d-vfx', this.onCardPlayedVFX, this);
    EventBus.on('entity-died-3d-vfx', this.onEntityDiedVFX, this);
    EventBus.on('objective-marker-3d', this.onObjectiveMarker, this);
    EventBus.on('objective-completed', this.onObjectiveCompleted, this);
    EventBus.on('supply-pod-3d', this.onSupplyPod, this);
    EventBus.on('supply-pod-opened-3d', this.onSupplyPodOpened, this);
    EventBus.on('tile-hover-3d', this.onTileHover, this);
    EventBus.on('ordnance-vfx-3d', this.onSpellVFX, this);
    EventBus.on('placement-preview-3d', this.onPlacementPreview, this);
    EventBus.on('floating-text-3d', this.onFloatingText, this);
    EventBus.on('mine-tooltip-3d', this.onMineTooltip, this);
    EventBus.on('gold-mine-3d', this.onGoldMine, this);
    EventBus.on('gold-mine-update-3d', this.onGoldMineUpdate, this);
    EventBus.on('pack-marker-3d', this.onPackMarker, this);
    EventBus.on('pack-opened-3d', this.onPackOpened, this);
    EventBus.on('poi-marker-3d', this.onPOIMarker, this);
    EventBus.on('poi-collected', this.onPOICollected, this);
  }

  // ── Tile Hover Ring ────────────────────────────────────────

  private createHoverRing(): void {
    const ringGeo = new THREE.RingGeometry(0.35, 0.48, 4, 1);
    ringGeo.rotateX(-Math.PI / 2);
    ringGeo.rotateY(Math.PI / 4);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xccaa44,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    this.hoverRing = new THREE.Mesh(ringGeo, ringMat);
    this.hoverRing.position.y = 0.1;
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);
  }

  private onTileHover = (data: { tileX: number; tileY: number; visible: boolean }): void => {
    if (!this.hoverRing) return;
    if (data.visible) {
      this.hoverRing.position.set(data.tileX, 0.1, data.tileY);
      this.hoverRing.visible = true;
      this.hoverRingVisible = true;
    } else {
      this.hoverRing.visible = false;
      this.hoverRingVisible = false;
    }
  };

  // ── Spell VFX (Gap 1) ────────────────────────────────────────

  private onSpellVFX = (data: { type: string; tileX: number; tileY: number; radius: number; durationMs?: number }): void => {
    const { type, tileX, tileY, radius } = data;

    const colorMap: Record<string, number> = {
      heal: 0x00ff00,
      fireball: 0xff4400,
      stasis: 0x4488ff,
      vortex: 0x9922cc,
      ability: 0x44ddff,
    };
    const color = colorMap[type] || 0xffffff;

    // Expanding ring on the ground
    const ringGeo = new THREE.RingGeometry(0.3, radius * 0.8, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(tileX, 0.15, tileY);
    this.scene.add(ring);

    const duration = type === 'stasis' ? (data.durationMs || 4000) : type === 'vortex' ? 800 : 500;
    const scaleSpeed = type === 'vortex' ? -2 : 2;

    this.particles.push({
      mesh: ring,
      velocity: new THREE.Vector3(0, 0, 0),
      lifetime: duration,
      elapsed: 0,
      fadeOut: true,
      scaleSpeed,
      disposeGeo: true,
    });

    // Central flash
    this.spawnFlash(tileX, tileY, color, 0.4, Math.min(duration, 600), 3);

    // Extra white flash for fireball/vortex
    if (type === 'fireball' || type === 'vortex') {
      this.spawnFlash(tileX, tileY, 0xffffff, 0.2, 300, 4);
    }
  };

  // ── Placement Preview (Gap 5) ──────────────────────────────

  private createPlacementRing(): void {
    const ringGeo = new THREE.RingGeometry(0.3, 0.45, 4, 1);
    ringGeo.rotateX(-Math.PI / 2);
    ringGeo.rotateY(Math.PI / 4);
    this.placementRingMat = new THREE.MeshBasicMaterial({
      color: 0x44ff44,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    this.placementRing = new THREE.Mesh(ringGeo, this.placementRingMat);
    this.placementRing.position.y = 0.12;
    this.placementRing.visible = false;
    this.scene.add(this.placementRing);

    // Ordnance reticule (crosshair + AOE ring)
    this.createOrdnanceReticule();

    // Ghost mesh factory
    this.ghostFactory = new EntityMeshFactory();

    // Card label billboard (canvas texture for text)
    this.cardLabelCanvas = document.createElement('canvas');
    this.cardLabelCanvas.width = 128;
    this.cardLabelCanvas.height = 48;
    this.cardLabelTexture = new THREE.CanvasTexture(this.cardLabelCanvas);
    this.cardLabelTexture.minFilter = THREE.LinearFilter;
    const labelGeo = new THREE.PlaneGeometry(0.8, 0.3);
    const labelMat = new THREE.MeshBasicMaterial({
      map: this.cardLabelTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.cardLabel = new THREE.Mesh(labelGeo, labelMat);
    this.cardLabel.renderOrder = 998;
    this.cardLabel.visible = false;
    this.scene.add(this.cardLabel);
  }

  private updateCardLabel(name: string, valid: boolean): void {
    if (!this.cardLabelCanvas || !this.cardLabelTexture) return;
    const ctx = this.cardLabelCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 48);

    // Background
    ctx.fillStyle = valid ? 'rgba(20, 30, 20, 0.85)' : 'rgba(40, 15, 15, 0.85)';
    ctx.beginPath();
    ctx.roundRect(2, 2, 124, 44, 6);
    ctx.fill();

    // Border
    ctx.strokeStyle = valid ? '#44ff44' : '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(2, 2, 124, 44, 6);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const displayName = name.length > 12 ? name.substring(0, 11) + '.' : name;
    ctx.fillText(displayName, 64, 24);

    this.cardLabelTexture.needsUpdate = true;
  }

  private createOrdnanceReticule(): void {
    const group = new THREE.Group();

    // Outer crosshair ring (thin circle)
    const crosshairMat = new THREE.MeshBasicMaterial({
      color: 0x8844cc,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    this.ordnanceReticuleMat = crosshairMat;

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.42, 32, 1).rotateX(-Math.PI / 2),
      crosshairMat,
    );
    group.add(outerRing);

    // Inner dot
    const dotGeo = new THREE.CircleGeometry(0.08, 16).rotateX(-Math.PI / 2);
    const dot = new THREE.Mesh(dotGeo, crosshairMat);
    group.add(dot);

    // Crosshair lines (4 lines extending from ring)
    const lineMat = crosshairMat;
    const lineLen = 0.2;
    const lineWidth = 0.03;
    const offsets = [
      { x: 0.5, z: 0, rx: 0 },   // right
      { x: -0.5, z: 0, rx: 0 },  // left
      { x: 0, z: 0.5, rx: 0 },   // down
      { x: 0, z: -0.5, rx: 0 },  // up
    ];
    for (const o of offsets) {
      const geo = new THREE.PlaneGeometry(
        o.z === 0 ? lineLen : lineWidth,
        o.z === 0 ? lineWidth : lineLen,
      ).rotateX(-Math.PI / 2);
      const line = new THREE.Mesh(geo, lineMat);
      line.position.set(o.x, 0, o.z);
      group.add(line);
    }

    group.position.y = 0.13;
    group.visible = false;
    this.scene.add(group);
    this.ordnanceReticule = group;

    // AOE radius ring (separate, scales dynamically)
    this.ordnanceAoeRingMat = new THREE.MeshBasicMaterial({
      color: 0x8844cc,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const aoeGeo = new THREE.RingGeometry(0.95, 1.0, 48, 1).rotateX(-Math.PI / 2);
    this.ordnanceAoeRing = new THREE.Mesh(aoeGeo, this.ordnanceAoeRingMat);
    this.ordnanceAoeRing.position.y = 0.12;
    this.ordnanceAoeRing.visible = false;
    this.scene.add(this.ordnanceAoeRing);
  }

  private showOrdnanceReticule(tileX: number, tileY: number, radius: number): void {
    if (this.ordnanceReticule) {
      this.ordnanceReticule.position.set(tileX, 0.13, tileY);
      this.ordnanceReticule.visible = true;
    }
    if (this.ordnanceAoeRing) {
      this.ordnanceAoeRing.position.set(tileX, 0.12, tileY);
      this.ordnanceAoeRing.scale.setScalar(radius);
      this.ordnanceAoeRing.visible = true;
      if (this.ordnanceAoeRingMat) this.ordnanceAoeRingMat.opacity = 0.25;
    }
  }

  private hideOrdnanceReticule(): void {
    if (this.ordnanceReticule) this.ordnanceReticule.visible = false;
    if (this.ordnanceAoeRing) this.ordnanceAoeRing.visible = false;
  }

  private ghostSquadSize: number = 1;

  private setGhostMesh(meshType: string, tileX: number, tileY: number, valid: boolean, squadSize: number = 1): void {
    // Remove old ghost if type or squad size changed
    if (this.ghostMesh && (this.ghostMeshType !== meshType || this.ghostSquadSize !== squadSize)) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
      this.ghostMeshType = '';
    }

    // Create ghost mesh if needed
    if (!this.ghostMesh && meshType && this.ghostFactory) {
      if (squadSize > 1) {
        this.ghostMesh = this.createGhostSquad(meshType, squadSize);
      } else {
        this.ghostMesh = this.ghostFactory.create(meshType);
      }
      // Make all materials transparent and tinted
      this.ghostMesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = (child.material as THREE.MeshStandardMaterial).clone();
          mat.transparent = true;
          mat.opacity = 0.5;
          mat.depthWrite = false;
          child.material = mat;
        }
      });
      this.ghostMeshType = meshType;
      this.ghostSquadSize = squadSize;
      this.scene.add(this.ghostMesh);
    }

    if (this.ghostMesh) {
      this.ghostMesh.position.set(tileX, 0, tileY);
      this.ghostMesh.visible = true;

      // Tint green/red based on validity
      const tintColor = valid ? new THREE.Color(0.3, 1, 0.3) : new THREE.Color(1, 0.3, 0.3);
      this.ghostMesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive.copy(tintColor);
          child.material.emissiveIntensity = 0.4;
          child.material.opacity = valid ? 0.55 : 0.35;
        }
      });

      // Gentle bob animation
      this.ghostMesh.position.y = 0.05 + Math.sin(Date.now() / 300) * 0.03;
    }
  }

  private hideGhostMesh(): void {
    if (this.ghostMesh) {
      this.ghostMesh.visible = false;
    }
    if (this.cardLabel) {
      this.cardLabel.visible = false;
    }
  }

  private createGhostSquad(meshType: string, squadSize: number): THREE.Group {
    const squad = new THREE.Group();
    const positions = SQUAD_FORMATIONS[squadSize] || SQUAD_FORMATIONS[4]!;
    const modelScale = squadSize <= 3 ? 0.55 : squadSize <= 4 ? 0.5 : 0.42;

    for (let i = 0; i < squadSize; i++) {
      const model = this.ghostFactory!.create(meshType);
      const pos = positions[i] || { x: (Math.random() - 0.5) * 0.3, z: (Math.random() - 0.5) * 0.3 };
      model.position.set(pos.x, 0, pos.z);
      model.scale.setScalar(modelScale);
      squad.add(model);
    }
    return squad;
  }

  private onPlacementPreview = (data: {
    tileX: number; tileY: number; valid: boolean; visible: boolean;
    cardType?: string; entityType?: string; cardName?: string; squadSize?: number;
    ordnanceRadius?: number;
  }): void => {
    if (!this.placementRing || !this.placementRingMat) return;

    if (!data.visible) {
      this.placementRing.visible = false;
      this.hideGhostMesh();
      this.hideOrdnanceReticule();
      return;
    }

    // Ordnance: show reticule + AOE ring instead of placement square
    if (data.cardType === 'ordnance') {
      this.placementRing.visible = false;
      this.hideGhostMesh();
      this.showOrdnanceReticule(data.tileX, data.tileY, data.ordnanceRadius || 3);
    } else {
      this.hideOrdnanceReticule();
      // Normal placement ring
      this.placementRing.position.set(data.tileX, 0.12, data.tileY);
      this.placementRingMat.color.set(data.valid ? 0x44ff44 : 0xff4444);
      this.placementRing.visible = true;

      // Ghost entity mesh for units/buildings
      if (data.entityType && (data.cardType === 'unit' || data.cardType === 'building')) {
        const prefix = data.cardType === 'unit' ? 'unit' : 'building';
        const meshType = `${prefix}-${data.entityType}`;
        this.setGhostMesh(meshType, data.tileX, data.tileY, data.valid, data.squadSize || 1);
      } else {
        this.hideGhostMesh();
      }
    }

    // Card name label floating above the preview
    if (this.cardLabel && data.cardName) {
      this.updateCardLabel(data.cardName, data.valid);
      this.cardLabel.position.set(data.tileX, 1.4, data.tileY);
      if (this.camera) {
        this.cardLabel.quaternion.copy(this.camera.quaternion);
      }
      this.cardLabel.visible = true;
    }
  };

  // ── Floating Text / Damage Numbers (Gap 8) ──────────────────

  private createFloatingTextContainer(): void {
    this.floatingTextContainer = document.createElement('div');
    this.floatingTextContainer.style.position = 'absolute';
    this.floatingTextContainer.style.top = '0';
    this.floatingTextContainer.style.left = '0';
    this.floatingTextContainer.style.width = '100%';
    this.floatingTextContainer.style.height = '100%';
    this.floatingTextContainer.style.pointerEvents = 'none';
    this.floatingTextContainer.style.overflow = 'hidden';
    this.floatingTextContainer.style.zIndex = '5';
    // Will be appended to game container when camera is set
  }

  private onFloatingText = (data: { tileX: number; tileY: number; text: string; color: string }): void => {
    if (!this.camera || !this.floatingTextContainer) return;

    // Project 3D position to screen
    const pos = new THREE.Vector3(data.tileX, 0.8, data.tileY);
    pos.project(this.camera);

    const canvas = this.floatingTextContainer.parentElement;
    if (!canvas) return;

    const halfW = canvas.clientWidth / 2;
    const halfH = canvas.clientHeight / 2;
    const screenX = pos.x * halfW + halfW;
    const screenY = -pos.y * halfH + halfH;

    const el = document.createElement('div');
    el.textContent = data.text;
    el.style.position = 'absolute';
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    el.style.color = data.color;
    el.style.fontSize = '14px';
    el.style.fontFamily = 'monospace';
    el.style.fontWeight = 'bold';
    el.style.textShadow = '1px 1px 2px #000';
    el.style.transform = 'translate(-50%, -50%)';
    el.style.transition = 'top 0.6s ease-out, opacity 0.6s ease-out';
    el.style.opacity = '1';
    this.floatingTextContainer.appendChild(el);

    // Animate upward and fade
    requestAnimationFrame(() => {
      el.style.top = `${screenY - 40}px`;
      el.style.opacity = '0';
    });

    setTimeout(() => el.remove(), 650);
  };

  // ── Mine Tooltip (Gap 9) ──────────────────────────────────────

  private createMineTooltip(): void {
    this.mineTooltipEl = document.createElement('div');
    this.mineTooltipEl.style.position = 'absolute';
    this.mineTooltipEl.style.color = '#ffd700';
    this.mineTooltipEl.style.fontSize = '13px';
    this.mineTooltipEl.style.fontFamily = 'monospace';
    this.mineTooltipEl.style.fontWeight = 'bold';
    this.mineTooltipEl.style.textShadow = '1px 1px 3px #000';
    this.mineTooltipEl.style.pointerEvents = 'none';
    this.mineTooltipEl.style.zIndex = '6';
    this.mineTooltipEl.style.display = 'none';
    this.mineTooltipEl.style.transform = 'translate(-50%, -100%)';
  }

  private onMineTooltip = (data: { tileX: number; tileY: number; remaining: number; visible: boolean }): void => {
    if (!this.mineTooltipEl || !this.camera) return;
    if (!data.visible) {
      this.mineTooltipEl.style.display = 'none';
      return;
    }

    const pos = new THREE.Vector3(data.tileX, 0.5, data.tileY);
    pos.project(this.camera);

    const container = this.mineTooltipEl.parentElement;
    if (!container) return;

    const halfW = container.clientWidth / 2;
    const halfH = container.clientHeight / 2;
    const screenX = pos.x * halfW + halfW;
    const screenY = -pos.y * halfH + halfH;

    this.mineTooltipEl.textContent = `Gold: ${data.remaining}`;
    this.mineTooltipEl.style.left = `${screenX}px`;
    this.mineTooltipEl.style.top = `${screenY - 10}px`;
    this.mineTooltipEl.style.display = 'block';
  };

  // ── Gold Mine Models ─────────────────────────────────────────

  private onGoldMine = (data: { tileX: number; tileY: number; remaining: number; maxGold: number }): void => {
    const key = `${data.tileX},${data.tileY}`;
    if (this.goldMines.has(key)) return;

    const group = new THREE.Group();

    // Gold pile — stacked nuggets
    const nuggetMat = new THREE.MeshStandardMaterial({ color: 0xdaa520, metalness: 0.6, roughness: 0.3 });

    // Base pile — flat wide shape
    const baseGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.12, 6);
    const base = new THREE.Mesh(baseGeo, nuggetMat);
    base.position.y = 0.14;
    group.add(base);

    // Mid pile
    const midGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.1, 6);
    const mid = new THREE.Mesh(midGeo, nuggetMat);
    mid.position.y = 0.24;
    mid.rotation.y = 0.5;
    group.add(mid);

    // Top nuggets — a few small spheres
    const nuggetGeo = new THREE.SphereGeometry(0.06, 6, 4);
    const positions = [
      { x: 0, y: 0.32, z: 0 },
      { x: 0.08, y: 0.3, z: 0.06 },
      { x: -0.07, y: 0.3, z: -0.05 },
    ];
    for (const p of positions) {
      const nugget = new THREE.Mesh(nuggetGeo, nuggetMat);
      nugget.position.set(p.x, p.y, p.z);
      group.add(nugget);
    }

    // Shimmer glow
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.15 });
    const glowGeo = new THREE.SphereGeometry(0.35, 8, 6);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = 0.22;
    group.add(glow);

    // Gold bar (background)
    const barW = 0.6;
    const barH = 0.06;
    const barBgGeo = new THREE.PlaneGeometry(barW, barH);
    const barBgMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false });
    const barBg = new THREE.Mesh(barBgGeo, barBgMat);
    barBg.position.y = 0.55;
    barBg.renderOrder = 999;
    group.add(barBg);

    // Gold bar (fill)
    const barFillGeo = new THREE.PlaneGeometry(barW, barH);
    const barFillMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false });
    const barFill = new THREE.Mesh(barFillGeo, barFillMat);
    barFill.position.y = 0.55;
    barFill.renderOrder = 1000;
    group.add(barFill);

    // Amount label
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 64;
    labelCanvas.height = 24;
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.minFilter = THREE.LinearFilter;
    const labelGeo = new THREE.PlaneGeometry(0.4, 0.15);
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, side: THREE.DoubleSide, depthTest: false });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.y = 0.66;
    label.renderOrder = 1001;
    group.add(label);

    group.position.set(data.tileX, 0, data.tileY);
    this.scene.add(group);

    const entry = { group, barFill, barBg, label, labelCanvas, labelTexture, remaining: data.remaining, maxGold: data.maxGold, glowMesh: glow };
    this.goldMines.set(key, entry);

    this.updateGoldMineVisual(entry);
  };

  private onGoldMineUpdate = (data: { tileX: number; tileY: number; remaining: number; ratio: number }): void => {
    const key = `${data.tileX},${data.tileY}`;
    const entry = this.goldMines.get(key);
    if (!entry) return;

    entry.remaining = data.remaining;
    this.updateGoldMineVisual(entry);

    // Remove if depleted
    if (data.remaining <= 0) {
      this.scene.remove(entry.group);
      entry.labelTexture.dispose();
      this.goldMines.delete(key);
    }
  };

  private updateGoldMineVisual(entry: { barFill: THREE.Mesh; label: THREE.Mesh; labelCanvas: HTMLCanvasElement; labelTexture: THREE.CanvasTexture; remaining: number; maxGold: number }): void {
    const ratio = Math.max(0, entry.remaining / entry.maxGold);

    // Scale fill bar
    entry.barFill.scale.set(ratio, 1, 1);
    entry.barFill.position.x = -(1 - ratio) * 0.3; // shift left as it shrinks

    // Color: gold → orange → red
    const fillMat = entry.barFill.material as THREE.MeshBasicMaterial;
    if (ratio > 0.5) fillMat.color.set(0xffd700);
    else if (ratio > 0.25) fillMat.color.set(0xff8c00);
    else fillMat.color.set(0xff4444);

    // Update label
    const ctx = entry.labelCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 24);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${entry.remaining}`, 32, 12);
    entry.labelTexture.needsUpdate = true;
  }

  // ── Command Indicator ──────────────────────────────────────

  private onCommandIndicator = (data: { tileX: number; tileY: number; type: string }): void => {
    const colorMap: Record<string, number> = { move: 0x44ff44, attack: 0xff4444, gather: 0xffaa00 };
    const color = colorMap[data.type] || 0xffffff;

    const ringGeo = new THREE.RingGeometry(0.15, 0.25, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.position.set(data.tileX, 0.15, data.tileY);
    this.scene.add(ring);

    this.particles.push({
      mesh: ring,
      velocity: new THREE.Vector3(0, 0, 0),
      lifetime: 400,
      elapsed: 0,
      fadeOut: true,
      scaleSpeed: 4,
      disposeGeo: true,
    });
  };

  // ── Projectiles ────────────────────────────────────────────

  private onProjectileSpawned = (data: { fromTileX: number; fromTileY: number; toTileX: number; toTileY: number; duration: number }): void => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffff44, emissive: 0xffaa00, emissiveIntensity: 0.6 });
    const mesh = new THREE.Mesh(this.sphereGeo, mat);
    const from = new THREE.Vector3(data.fromTileX, 0.5, data.fromTileY);
    const to = new THREE.Vector3(data.toTileX, 0.5, data.toTileY);
    mesh.position.copy(from);
    this.scene.add(mesh);

    this.projectiles.push({ mesh, from, to, duration: data.duration, elapsed: 0 });
  };

  // ── Card Played VFX ────────────────────────────────────────

  private onCardPlayedVFX = (data: { tileX: number; tileY: number; cardType: string }): void => {
    const colorMap: Record<string, number> = {
      unit: 0xffffff,
      building: 0xffffff,
      ordnance: 0x8844cc,
      equipment: 0x44dddd,
    };
    const color = colorMap[data.cardType] || 0xffffff;

    // Central flash sphere
    this.spawnFlash(data.tileX, data.tileY, color, 0.3, 300, 3);

    // Particle ring for units
    if (data.cardType === 'unit') {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const mat = new THREE.MeshBasicMaterial({ color: 0xccaa77, transparent: true, opacity: 0.6 });
        const p = new THREE.Mesh(this.sphereGeo, mat);
        p.position.set(data.tileX, 0.2, data.tileY);
        p.scale.setScalar(0.6);
        this.scene.add(p);
        this.particles.push({
          mesh: p,
          velocity: new THREE.Vector3(Math.cos(angle) * 2, 0.5, Math.sin(angle) * 2),
          lifetime: 350,
          elapsed: 0,
          fadeOut: true,
          scaleSpeed: -1,
          disposeGeo: false,
        });
      }
    }
  };

  // ── Entity Death VFX ───────────────────────────────────────

  private onEntityDiedVFX = (data: { tileX: number; tileY: number; team: string }): void => {
    this.spawnFlash(data.tileX, data.tileY, 0xff0000, 0.25, 300, 2);

    // Small red particles
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const mat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.7 });
      const p = new THREE.Mesh(this.sphereGeo, mat);
      p.position.set(data.tileX, 0.3, data.tileY);
      p.scale.setScalar(0.5);
      this.scene.add(p);
      this.particles.push({
        mesh: p,
        velocity: new THREE.Vector3(Math.cos(angle) * 1.5, 1 + Math.random(), Math.sin(angle) * 1.5),
        lifetime: 400,
        elapsed: 0,
        fadeOut: true,
        scaleSpeed: -0.5,
        disposeGeo: false,
      });
    }
  };

  // ── Objective Markers ──────────────────────────────────────

  private onObjectiveMarker = (data: { id: string; tileX: number; tileY: number; type: string }): void => {
    const colorMap: Record<string, number> = { destroy: 0xff4444, recover: 0x44aaff, purge: 0xffaa00 };
    const color = colorMap[data.type] || 0xffffff;

    const group = new THREE.Group();

    // Pillar beacon
    const pillarGeo = new THREE.CylinderGeometry(0.08, 0.08, 2, 8);
    const pillarMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 1;
    group.add(pillar);

    // Base ring
    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.12;
    group.add(ring);

    // Diamond-shaped top marker
    const diamondGeo = new THREE.OctahedronGeometry(0.15);
    const diamondMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
    const diamond = new THREE.Mesh(diamondGeo, diamondMat);
    diamond.position.y = 2.2;
    group.add(diamond);

    group.position.set(data.tileX, 0, data.tileY);
    this.scene.add(group);
    this.objectiveMarkers.set(data.id, { group, spinMesh: diamond });
  };

  private onObjectiveCompleted = (data: { objectiveId: string }): void => {
    const entry = this.objectiveMarkers.get(data.objectiveId);
    if (!entry) return;

    // Turn green and fade
    entry.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material instanceof THREE.MeshBasicMaterial) {
          child.material.color.set(0x44ff44);
          child.material.opacity *= 0.5;
        }
        if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material.color.set(0x44ff44);
          child.material.emissive.set(0x44ff44);
        }
      }
    });
  };

  // ── Supply Pods ────────────────────────────────────────────

  private onSupplyPod = (data: { id: string; tileX: number; tileY: number }): void => {
    const group = new THREE.Group();

    // Pod body — armored drop container
    const bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xddaa22, metalness: 0.4, roughness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.15;
    group.add(body);

    // Aquila marking on top
    const markGeo = new THREE.PlaneGeometry(0.2, 0.05);
    const markMat = new THREE.MeshBasicMaterial({ color: 0xffd700, side: THREE.DoubleSide });
    const mark = new THREE.Mesh(markGeo, markMat);
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.31;
    group.add(mark);

    // Beacon glow sphere (pulses while waiting for pickup)
    const beaconGeo = new THREE.SphereGeometry(0.2, 8, 6);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.3 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.y = 0.6;
    group.add(beacon);

    // Start high up for drop animation
    const dropHeight = 12;
    group.position.set(data.tileX, dropHeight, data.tileY);
    group.userData.dropping = true;
    group.userData.dropTarget = 0;
    group.userData.dropSpeed = 0;
    this.scene.add(group);
    this.supplyPodMeshes.set(data.id, { group, pulseMesh: beacon });

    // Sky beam — vertical light pillar from sky to ground
    const beamGeo = new THREE.CylinderGeometry(0.03, 0.06, dropHeight + 2, 6);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.6 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(data.tileX, (dropHeight + 2) / 2, data.tileY);
    this.scene.add(beam);

    // Wider glow beam
    const glowGeo = new THREE.CylinderGeometry(0.08, 0.15, dropHeight + 2, 6);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.15 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(data.tileX, (dropHeight + 2) / 2, data.tileY);
    this.scene.add(glow);

    // Fade beam out over 2 seconds
    this.particles.push({
      mesh: beam,
      velocity: new THREE.Vector3(0, 0, 0),
      lifetime: 2000,
      elapsed: 0,
      fadeOut: true,
      scaleSpeed: 0,
      disposeGeo: true,
    });
    this.particles.push({
      mesh: glow,
      velocity: new THREE.Vector3(0, 0, 0),
      lifetime: 2500,
      elapsed: 0,
      fadeOut: true,
      scaleSpeed: 0,
      disposeGeo: true,
    });

    // Ground impact ring — spawns when pod lands (delayed)
    const landingDelay = 800; // roughly when the pod hits ground
    setTimeout(() => {
      // Dust ring
      const ringGeo = new THREE.RingGeometry(0.2, 0.5, 16);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xccaa66, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(data.tileX, 0.05, data.tileY);
      this.scene.add(ring);
      this.particles.push({
        mesh: ring,
        velocity: new THREE.Vector3(0, 0, 0),
        lifetime: 600,
        elapsed: 0,
        fadeOut: true,
        scaleSpeed: 3,
        disposeGeo: true,
      });

      // Dirt/debris particles
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const mat = new THREE.MeshBasicMaterial({ color: 0x887755, transparent: true, opacity: 0.7 });
        const p = new THREE.Mesh(this.boxGeo, mat);
        p.position.set(data.tileX, 0.2, data.tileY);
        p.scale.setScalar(0.8);
        this.scene.add(p);
        this.particles.push({
          mesh: p,
          velocity: new THREE.Vector3(Math.cos(angle) * 1.5, 1.5 + Math.random(), Math.sin(angle) * 1.5),
          lifetime: 500,
          elapsed: 0,
          fadeOut: true,
          scaleSpeed: -0.5,
          disposeGeo: false,
        });
      }

      // Flash
      this.spawnFlash(data.tileX, data.tileY, 0xffcc44, 0.3, 400, 3);
    }, landingDelay);
  };

  private spawnBurstParticles(
    pos: THREE.Vector3,
    count: number,
    color: number = 0xffd700,
    yOffset: number = 0.3,
    baseVelocityY: number = 2,
    lifetime: number = 600,
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const p = new THREE.Mesh(this.boxGeo, mat);
      p.position.copy(pos).add(new THREE.Vector3(0, yOffset, 0));
      this.scene.add(p);
      this.particles.push({
        mesh: p,
        velocity: new THREE.Vector3(Math.cos(angle) * 2, baseVelocityY + Math.random() * 2, Math.sin(angle) * 2),
        lifetime,
        elapsed: 0,
        fadeOut: true,
        scaleSpeed: -0.3,
        disposeGeo: false,
      });
    }
  }

  private onSupplyPodOpened = (data: { id: string }): void => {
    const entry = this.supplyPodMeshes.get(data.id);
    if (!entry) return;
    const group = entry.group;

    // Burst particles
    this.spawnBurstParticles(group.position, 6);

    // Remove pod
    this.scene.remove(group);
    this.supplyPodMeshes.delete(data.id);
  };

  // ── Pack Markers ──────────────────────────────────────────────

  private onPackMarker = (data: { id: string; type: string; tileX: number; tileY: number }): void => {
    const group = new THREE.Group();

    // Color based on pack type
    const colorMap: Record<string, number> = {
      random: 0xc8982a,   // gold
      wargear: 0x50b0b0,  // teal
      ordnance: 0xa070cc, // purple
      unit: 0x6090cc,     // blue
      building: 0x60aa60, // green
    };
    const color = colorMap[data.type] || 0xc8982a;

    // Crate body
    const bodyGeo = new THREE.BoxGeometry(0.35, 0.25, 0.35);
    const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.125;
    group.add(body);

    // Glow beacon
    const beaconGeo = new THREE.SphereGeometry(0.15, 8, 6);
    const beaconMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.y = 0.5;
    group.add(beacon);

    group.position.set(data.tileX, 0, data.tileY);
    this.scene.add(group);
    this.packMarkers.set(data.id, { group, pulseMesh: beacon });
  };

  private onPackOpened = (data: { id: string }): void => {
    const entry = this.packMarkers.get(data.id);
    if (!entry) return;

    // Burst particles
    this.spawnBurstParticles(entry.group.position, 6);

    this.scene.remove(entry.group);
    this.packMarkers.delete(data.id);
  };

  // ── PoI Markers ──────────────────────────────────────────────

  private static readonly POI_COLORS: Record<string, number> = {
    gold_cache:  0xc8982a,
    ammo_dump:   0x50b0b0,
    med_station: 0x60aa60,
    intel:       0x6090cc,
    relic:       0xa070cc,
  };

  private onPOIMarker = (data: { id: string; type: string; tileX: number; tileY: number }): void => {
    const group = new THREE.Group();
    const color = VFXRenderer.POI_COLORS[data.type] ?? 0xc8982a;

    // Pillar base
    const pillarGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.6, 6);
    const pillarMat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 0.3;
    group.add(pillar);

    // Floating icon sphere
    const iconGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const iconMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
    const icon = new THREE.Mesh(iconGeo, iconMat);
    icon.position.y = 0.8;
    group.add(icon);

    // Ground glow ring
    const ringGeo = new THREE.RingGeometry(0.2, 0.35, 12);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.02;
    group.add(ring);

    group.position.set(data.tileX, 0, data.tileY);
    this.scene.add(group);
    this.poiMarkers.set(data.id, { group, pulseMesh: icon, floatMesh: icon, ringMesh: ring });
  };

  private onPOICollected = (data: { id: string; tileX: number; tileY: number }): void => {
    const entry = this.poiMarkers.get(data.id);
    if (!entry) return;

    // Burst particles
    this.spawnBurstParticles(entry.group.position, 8, 0xffd700, 0.4, 2.5, 700);

    this.scene.remove(entry.group);
    this.poiMarkers.delete(data.id);
  };

  // ── HP Bars (Gap 7) ──────────────────────────────────────────

  /** Sync HP bars for all entities. Called each frame from update(). */
  syncHpBars(entities: Entity[]): void {
    if (!this.camera) return;

    const activeIds = this._hpBarActiveIds;
    activeIds.clear();

    for (const entity of entities) {
      if (!entity.active) continue;
      activeIds.add(entity.entityId);

      const health = entity.getComponent<import('../components/HealthComponent').HealthComponent>('health');
      if (!health) continue;

      // Only show HP bar when damaged
      if (health.currentHp >= health.maxHp) {
        const existing = this.hpBars.get(entity.entityId);
        if (existing) {
          existing.bg.visible = false;
          existing.fill.visible = false;
          existing.border.visible = false;
        }
        continue;
      }

      let bar = this.hpBars.get(entity.entityId);
      if (!bar) {
        // Create HP bar meshes
        const borderMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false });
        const border = new THREE.Mesh(this.hpBarBorderGeo, borderMat);
        border.renderOrder = 999;

        const bgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false });
        const bg = new THREE.Mesh(this.hpBarGeo, bgMat);
        bg.renderOrder = 999;

        const fillMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 1, side: THREE.DoubleSide, depthTest: false });
        const fill = new THREE.Mesh(this.hpBarGeo, fillMat);
        fill.renderOrder = 1000;

        this.scene.add(border);
        this.scene.add(bg);
        this.scene.add(fill);

        bar = { bg, fill, border };
        this.hpBars.set(entity.entityId, bar);
      }

      // Position above entity — billboard facing camera
      const barY = 1.2;
      bar.border.position.set(entity.tileX, barY, entity.tileY);
      bar.bg.position.set(entity.tileX, barY, entity.tileY);

      // Scale fill bar by HP ratio
      const ratio = Math.max(0, health.currentHp / health.maxHp);
      bar.fill.position.set(entity.tileX - (1 - ratio) * 0.5, barY, entity.tileY);
      bar.fill.scale.set(ratio, 1, 1);

      // Color: green > yellow > red
      const fillMat = bar.fill.material as THREE.MeshBasicMaterial;
      if (ratio > 0.5) fillMat.color.set(0x00ff00);
      else if (ratio > 0.25) fillMat.color.set(0xffff00);
      else fillMat.color.set(0xff0000);

      // Billboard: face camera
      bar.border.quaternion.copy(this.camera.quaternion);
      bar.bg.quaternion.copy(this.camera.quaternion);
      bar.fill.quaternion.copy(this.camera.quaternion);

      bar.bg.visible = true;
      bar.fill.visible = true;
      bar.border.visible = true;
    }

    // Remove bars for dead entities
    for (const [id, bar] of this.hpBars) {
      if (!activeIds.has(id)) {
        this.scene.remove(bar.bg);
        this.scene.remove(bar.fill);
        this.scene.remove(bar.border);
        (bar.bg.material as THREE.Material).dispose();
        (bar.fill.material as THREE.Material).dispose();
        (bar.border.material as THREE.Material).dispose();
        this.hpBars.delete(id);
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  private spawnFlash(tileX: number, tileY: number, color: number, radius: number, duration: number, scaleSpeed: number): void {
    const geo = new THREE.SphereGeometry(radius, 12, 8);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(tileX, 0.3, tileY);
    this.scene.add(mesh);

    this.particles.push({
      mesh,
      velocity: new THREE.Vector3(0, 0, 0),
      lifetime: duration,
      elapsed: 0,
      fadeOut: true,
      scaleSpeed,
      disposeGeo: true,
    });
  }

  // ── Per-Frame Update ───────────────────────────────────────

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.elapsed += deltaMs;
      const t = p.elapsed / p.lifetime;

      if (t >= 1) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        if (p.disposeGeo) p.mesh.geometry.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      // Move
      p.mesh.position.addScaledVector(p.velocity, dt);
      // Gravity
      p.velocity.y -= 3 * dt;

      // Scale
      if (p.scaleSpeed !== 0) {
        const s = Math.max(0.01, p.mesh.scale.x + p.scaleSpeed * dt);
        p.mesh.scale.setScalar(s);
      }

      // Fade
      if (p.fadeOut && p.mesh.material instanceof THREE.MeshBasicMaterial) {
        p.mesh.material.opacity = Math.max(0, 0.8 * (1 - t));
      }
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.elapsed += deltaMs;
      const t = Math.min(1, proj.elapsed / proj.duration);

      proj.mesh.position.lerpVectors(proj.from, proj.to, t);
      // Arc up
      proj.mesh.position.y += Math.sin(t * Math.PI) * 0.5;

      if (t >= 1) {
        this.scene.remove(proj.mesh);
        (proj.mesh.material as THREE.Material).dispose();
        this.projectiles.splice(i, 1);
      }
    }

    // Billboard gold mine bars + shimmer glow
    const now = Date.now();
    if (this.camera) {
      for (const entry of this.goldMines.values()) {
        entry.barFill.quaternion.copy(this.camera.quaternion);
        entry.barBg.quaternion.copy(this.camera.quaternion);
        entry.label.quaternion.copy(this.camera.quaternion);

        // Shimmer glow pulse (direct ref, no traverse)
        if (entry.glowMesh) {
          (entry.glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.08 * Math.sin(now / 500);
        }
      }
    }

    // Spin objective marker diamonds (direct ref, no traverse)
    for (const entry of this.objectiveMarkers.values()) {
      if (entry.spinMesh) {
        entry.spinMesh.rotation.y += 1.5 * dt;
      }
    }

    // Animate supply pod drops + pulse beacons
    for (const entry of this.supplyPodMeshes.values()) {
      const group = entry.group;
      // Drop animation — accelerate downward until landing
      if (group.userData.dropping) {
        group.userData.dropSpeed += 18 * dt; // gravity acceleration
        group.position.y -= group.userData.dropSpeed * dt;

        if (group.position.y <= group.userData.dropTarget) {
          group.position.y = group.userData.dropTarget;
          group.userData.dropping = false;

          // Bounce — small upward kick
          group.userData.bouncing = true;
          group.userData.bounceVel = 1.5;
        }
      }

      // Bounce settle
      if (group.userData.bouncing) {
        group.position.y += group.userData.bounceVel * dt;
        group.userData.bounceVel -= 6 * dt;
        if (group.position.y <= 0) {
          group.position.y = 0;
          group.userData.bouncing = false;
        }
      }

      // Pulse beacon glow (direct ref, no traverse)
      if (entry.pulseMesh) {
        (entry.pulseMesh.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.15 * Math.sin(now / 400);
      }
    }

    // Pulse pack marker beacons (direct ref, no traverse)
    for (const entry of this.packMarkers.values()) {
      if (entry.pulseMesh) {
        (entry.pulseMesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.2 * Math.sin(now / 500);
      }
    }

    // Pulse and float PoI marker beacons (direct refs, no traverse)
    for (const entry of this.poiMarkers.values()) {
      if (entry.pulseMesh) {
        (entry.pulseMesh.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.25 * Math.sin(now / 400);
      }
      if (entry.floatMesh) {
        entry.floatMesh.position.y = 0.8 + 0.08 * Math.sin(now / 600);
      }
      if (entry.ringMesh) {
        (entry.ringMesh.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.25 * Math.sin(now / 400);
      }
    }

    // Rotate ordnance reticule slowly
    if (this.ordnanceReticule && this.ordnanceReticule.visible) {
      this.ordnanceReticule.rotation.y += 0.8 * dt;
    }
  }

  dispose(): void {
    EventBus.off('command-indicator-3d', this.onCommandIndicator, this);
    EventBus.off('projectile-spawned', this.onProjectileSpawned, this);
    EventBus.off('card-played-3d-vfx', this.onCardPlayedVFX, this);
    EventBus.off('entity-died-3d-vfx', this.onEntityDiedVFX, this);
    EventBus.off('objective-marker-3d', this.onObjectiveMarker, this);
    EventBus.off('objective-completed', this.onObjectiveCompleted, this);
    EventBus.off('supply-pod-3d', this.onSupplyPod, this);
    EventBus.off('supply-pod-opened-3d', this.onSupplyPodOpened, this);
    EventBus.off('tile-hover-3d', this.onTileHover, this);
    EventBus.off('ordnance-vfx-3d', this.onSpellVFX, this);
    EventBus.off('placement-preview-3d', this.onPlacementPreview, this);
    EventBus.off('floating-text-3d', this.onFloatingText, this);
    EventBus.off('mine-tooltip-3d', this.onMineTooltip, this);
    EventBus.off('gold-mine-3d', this.onGoldMine, this);
    EventBus.off('gold-mine-update-3d', this.onGoldMineUpdate, this);
    EventBus.off('pack-marker-3d', this.onPackMarker, this);
    EventBus.off('pack-opened-3d', this.onPackOpened, this);
    EventBus.off('poi-marker-3d', this.onPOIMarker, this);
    EventBus.off('poi-collected', this.onPOICollected, this);

    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
      if (p.disposeGeo) p.mesh.geometry.dispose();
    }
    this.particles = [];

    for (const proj of this.projectiles) {
      this.scene.remove(proj.mesh);
      (proj.mesh.material as THREE.Material).dispose();
    }
    this.projectiles = [];

    for (const entry of this.objectiveMarkers.values()) {
      this.scene.remove(entry.group);
    }
    this.objectiveMarkers.clear();

    for (const entry of this.supplyPodMeshes.values()) {
      this.scene.remove(entry.group);
    }
    this.supplyPodMeshes.clear();

    for (const entry of this.packMarkers.values()) {
      this.scene.remove(entry.group);
    }
    this.packMarkers.clear();

    for (const entry of this.poiMarkers.values()) {
      this.scene.remove(entry.group);
    }
    this.poiMarkers.clear();

    if (this.hoverRing) {
      this.scene.remove(this.hoverRing);
      (this.hoverRing.material as THREE.Material).dispose();
      this.hoverRing.geometry.dispose();
    }

    this.sphereGeo.dispose();
    this.boxGeo.dispose();

    // Cleanup placement ring
    if (this.placementRing) {
      this.scene.remove(this.placementRing);
      this.placementRing.geometry.dispose();
      (this.placementRing.material as THREE.Material).dispose();
    }
    if (this.ordnanceReticule) {
      this.scene.remove(this.ordnanceReticule);
      this.ordnanceReticule.traverse(c => {
        if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
      });
    }
    if (this.ordnanceAoeRing) {
      this.scene.remove(this.ordnanceAoeRing);
      this.ordnanceAoeRing.geometry.dispose();
      this.ordnanceAoeRingMat?.dispose();
    }

    // Cleanup ghost mesh
    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
    if (this.ghostFactory) {
      this.ghostFactory.dispose();
      this.ghostFactory = null;
    }

    // Cleanup card label
    if (this.cardLabel) {
      this.scene.remove(this.cardLabel);
      (this.cardLabel.material as THREE.Material).dispose();
      this.cardLabel.geometry.dispose();
    }
    if (this.cardLabelTexture) this.cardLabelTexture.dispose();

    // Cleanup HP bars
    for (const bar of this.hpBars.values()) {
      this.scene.remove(bar.bg);
      this.scene.remove(bar.fill);
      this.scene.remove(bar.border);
      (bar.bg.material as THREE.Material).dispose();
      (bar.fill.material as THREE.Material).dispose();
      (bar.border.material as THREE.Material).dispose();
    }
    this.hpBars.clear();
    this.hpBarGeo.dispose();
    this.hpBarBorderGeo.dispose();

    // Cleanup floating text container
    if (this.floatingTextContainer) {
      this.floatingTextContainer.remove();
    }

    // Cleanup mine tooltip
    if (this.mineTooltipEl) {
      this.mineTooltipEl.remove();
    }

    // Cleanup gold mine models
    for (const entry of this.goldMines.values()) {
      this.scene.remove(entry.group);
      entry.labelTexture.dispose();
    }
    this.goldMines.clear();
  }
}
