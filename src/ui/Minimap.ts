import { MAP_WIDTH, MAP_HEIGHT } from '../config';
import { TerrainType } from '../map/MapManager';
import { Entity } from '../entities/Entity';
import { Building } from '../entities/Building';
import { EventBus } from '../EventBus';

const MM_SIZE = 160; // canvas pixels (square)
const TILE_PX = MM_SIZE / MAP_WIDTH;

const TERRAIN_COLORS: Record<number, [number, number, number]> = {
  [TerrainType.GRASS]:     [62, 110, 45],   // earthy green matching 3D grass base
  [TerrainType.WATER]:     [25,  55, 100],   // deep blue matching 3D water
  [TerrainType.GOLD_MINE]: [140, 125, 60],   // rocky brown with gold tint (blend of rock base + veins)
  [TerrainType.STONE]:     [115, 112, 110],  // gray stone matching 3D texture
  [TerrainType.DIRT]:      [120,  92, 60],   // dry brown earth matching 3D dirt
  [TerrainType.FOREST]:      [32,  65,  30],   // darker green for forest canopy
  [TerrainType.METAL_FLOOR]: [70,  72,  78],   // dark gunmetal matching space hulk floors
  [TerrainType.HULL_WALL]:   [45,  48,  55],   // darker metallic for walls
  [TerrainType.LAVA]:        [160,  40,  15],   // molten orange-red
  [TerrainType.ICE]:         [180, 200, 220],   // pale blue-white
  [TerrainType.SAND]:        [190, 170, 120],   // warm tan
  [TerrainType.RUBBLE]:      [105, 100,  95],   // gray rubble
};

const ENTITY_COLORS: Record<string, [number, number, number]> = {
  player: [100, 180, 255],
  enemy:  [220,  60,  60],
};

const BUILDING_COLORS: Record<string, [number, number, number]> = {
  player: [80, 140, 220],
  enemy:  [180, 40,  40],
};

/**
 * Minimap — renders a small top-down overview of the battlefield
 * in the bottom-left corner of the HUD.
 */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLDivElement;

  // Cached data
  private terrainGrid: TerrainType[][] = [];
  private fogGrid: number[][] = [];
  private entities: Entity[] = [];
  private terrainImage: ImageData | null = null;

  // Minimap pings
  private pings: { tileX: number; tileY: number; color: [number, number, number]; startTime: number; duration: number }[] = [];

  // Camera viewport (tile coords)
  private camX = MAP_WIDTH / 2;
  private camZ = MAP_HEIGHT / 2;
  private camViewW = 16;
  private camViewH = 12;

  private isDragging = false;

  constructor() {
    // Container with styling
    this.container = document.createElement('div');
    this.container.id = 'minimap-container';
    Object.assign(this.container.style, {
      width: `${MM_SIZE}px`,
      height: `${MM_SIZE}px`,
      border: '1px solid rgba(200,152,42,0.15)',
      background: '#0a0a12',
      cursor: 'pointer',
      pointerEvents: 'auto',
      flexShrink: '0',
    });

    this.canvas = document.createElement('canvas');
    this.canvas.width = MM_SIZE;
    this.canvas.height = MM_SIZE;
    this.canvas.style.display = 'block';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // Append into the bottom bar minimap section if available, otherwise body
    const section = document.getElementById('hud-section-minimap');
    (section || document.body).appendChild(this.container);

    // Event listeners
    EventBus.on('minimap-terrain', this.onMinimapTerrain, this);
    EventBus.on('fog-updated', this.onFogUpdated, this);
    EventBus.on('entities-sync', this.onEntitiesSync, this);
    EventBus.on('camera-moved', this.onCameraMoved, this);

    // Ping events
    EventBus.on('minimap-ping', this.onMinimapPing, this);
    EventBus.on('reinforcements-incoming', this.onPingReinforcements, this);
    EventBus.on('supply-pod-incoming', this.onPingSupplyPod, this);
    EventBus.on('spawner-neutralized', this.onPingSpawnerNeutralized, this);
    EventBus.on('objective-completed', this.onPingObjectiveCompleted, this);

    // Click/drag to move camera
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  private onMinimapTerrain = (grid: TerrainType[][]): void => {
    this.terrainGrid = grid;
    this.bakeTerrainImage();
    this.draw();
  };

  private onFogUpdated = (grid: number[][]): void => {
    this.fogGrid = grid;
  };

  private onEntitiesSync = (entities: Entity[]): void => {
    this.entities = entities;
    this.draw();
  };

  private onCameraMoved = (data: { x: number; z: number; viewW: number; viewH: number }): void => {
    this.camX = data.x;
    this.camZ = data.z;
    this.camViewW = data.viewW;
    this.camViewH = data.viewH;
  };

  /** Pre-render terrain to an ImageData for fast blitting. */
  private bakeTerrainImage(): void {
    this.terrainImage = this.ctx.createImageData(MM_SIZE, MM_SIZE);
    const d = this.terrainImage.data;

    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const t = this.terrainGrid[ty]?.[tx] ?? TerrainType.GRASS;
        const [r, g, b] = TERRAIN_COLORS[t] || [74, 107, 58];

        // Fill the pixel block for this tile
        const px0 = Math.floor(tx * TILE_PX);
        const py0 = Math.floor(ty * TILE_PX);
        const px1 = Math.floor((tx + 1) * TILE_PX);
        const py1 = Math.floor((ty + 1) * TILE_PX);

        for (let py = py0; py < py1 && py < MM_SIZE; py++) {
          for (let px = px0; px < px1 && px < MM_SIZE; px++) {
            const idx = (py * MM_SIZE + px) * 4;
            d[idx] = r;
            d[idx + 1] = g;
            d[idx + 2] = b;
            d[idx + 3] = 255;
          }
        }
      }
    }
  }

  private draw(): void {
    const ctx = this.ctx;

    // 1. Draw terrain base (baked)
    if (this.terrainImage) {
      ctx.putImageData(this.terrainImage, 0, 0);
    } else {
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, MM_SIZE, MM_SIZE);
    }

    // 2. Apply fog darkening
    if (this.fogGrid.length > 0) {
      const imgData = ctx.getImageData(0, 0, MM_SIZE, MM_SIZE);
      const d = imgData.data;

      for (let ty = 0; ty < MAP_HEIGHT; ty++) {
        for (let tx = 0; tx < MAP_WIDTH; tx++) {
          const fog = this.fogGrid[ty]?.[tx] ?? 0;
          // 0=HIDDEN, 1=EXPLORED, 2=VISIBLE
          let mult: number;
          if (fog === 2) mult = 1.0;
          else if (fog === 1) mult = 0.7;
          else mult = 0.4;

          if (mult < 1.0) {
            const px0 = Math.floor(tx * TILE_PX);
            const py0 = Math.floor(ty * TILE_PX);
            const px1 = Math.floor((tx + 1) * TILE_PX);
            const py1 = Math.floor((ty + 1) * TILE_PX);

            for (let py = py0; py < py1 && py < MM_SIZE; py++) {
              for (let px = px0; px < px1 && px < MM_SIZE; px++) {
                const idx = (py * MM_SIZE + px) * 4;
                d[idx] = Math.floor(d[idx] * mult);
                d[idx + 1] = Math.floor(d[idx + 1] * mult);
                d[idx + 2] = Math.floor(d[idx + 2] * mult);
              }
            }
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // 3. Draw entities
    for (const entity of this.entities) {
      if (!entity.active) continue;
      // Only show entities in visible tiles
      const fog = this.fogGrid[entity.tileY]?.[entity.tileX] ?? 0;
      if (entity.team === 'enemy' && fog !== 2) continue;

      const isBuilding = entity instanceof Building;
      const colors = isBuilding ? BUILDING_COLORS : ENTITY_COLORS;
      const [r, g, b] = colors[entity.team] || [255, 255, 255];
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      const px = entity.tileX * TILE_PX;
      const py = entity.tileY * TILE_PX;

      if (isBuilding) {
        const bld = entity as Building;
        const w = (bld.stats?.tileWidth || 1) * TILE_PX;
        const h = (bld.stats?.tileHeight || 1) * TILE_PX;
        ctx.fillRect(px, py, Math.max(w, 2), Math.max(h, 2));
      } else {
        // Unit dot
        const size = Math.max(2, TILE_PX * 0.8);
        ctx.fillRect(px, py, size, size);
      }
    }

    // 4. Draw camera viewport rectangle
    const vpLeft = (this.camX - this.camViewW / 2) * TILE_PX;
    const vpTop = (this.camZ - this.camViewH / 2) * TILE_PX;
    const vpW = this.camViewW * TILE_PX;
    const vpH = this.camViewH * TILE_PX;

    ctx.strokeStyle = 'rgba(232, 212, 139, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpLeft, vpTop, vpW, vpH);

    // 5. Draw pings
    this.drawPings();
  }

  // ── Pings ────────────────────────────────────────────────────

  private ping(tileX: number, tileY: number, color: [number, number, number], duration = 3000): void {
    this.pings.push({ tileX, tileY, color, startTime: performance.now(), duration });
  }

  private onMinimapPing = (data: { tileX: number; tileY: number; color: [number, number, number]; duration?: number }): void => {
    this.ping(data.tileX, data.tileY, data.color, data.duration ?? 3000);
  };

  private onPingReinforcements = (data: { tileX: number; tileY: number }): void => {
    this.ping(data.tileX, data.tileY, [220, 60, 60]); // red
  };

  private onPingSupplyPod = (data: { tileX: number; tileY: number }): void => {
    this.ping(data.tileX, data.tileY, [200, 152, 42]); // gold
  };

  private onPingSpawnerNeutralized = (data: { tileX?: number; tileY?: number }): void => {
    if (data.tileX != null && data.tileY != null) {
      this.ping(data.tileX, data.tileY, [74, 158, 74]); // green
    }
  };

  private onPingObjectiveCompleted = (data: { tileX?: number; tileY?: number }): void => {
    if (data.tileX != null && data.tileY != null) {
      this.ping(data.tileX, data.tileY, [74, 158, 74]); // green
    }
  };

  private drawPings(): void {
    const now = performance.now();
    const ctx = this.ctx;

    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      const elapsed = now - p.startTime;
      if (elapsed >= p.duration) {
        this.pings.splice(i, 1);
        continue;
      }

      const t = elapsed / p.duration;
      const alpha = 1 - t;
      const radius = 3 + t * 10; // expand from 3 to 13px
      const px = p.tileX * TILE_PX + TILE_PX / 2;
      const py = p.tileY * TILE_PX + TILE_PX / 2;

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${alpha.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner filled dot
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${alpha.toFixed(2)})`;
      ctx.fill();
    }
  }

  // ── Click-to-pan ──────────────────────────────────────────────

  private onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.panToMouse(e);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    this.panToMouse(e);
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
  };

  private panToMouse(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const tileX = Math.floor(mx / TILE_PX);
    const tileY = Math.floor(my / TILE_PX);
    if (tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT) {
      EventBus.emit('minimap-pan', { tileX, tileY });
    }
  }

  destroy(): void {
    EventBus.off('minimap-terrain', this.onMinimapTerrain, this);
    EventBus.off('fog-updated', this.onFogUpdated, this);
    EventBus.off('entities-sync', this.onEntitiesSync, this);
    EventBus.off('camera-moved', this.onCameraMoved, this);
    EventBus.off('minimap-ping', this.onMinimapPing, this);
    EventBus.off('reinforcements-incoming', this.onPingReinforcements, this);
    EventBus.off('supply-pod-incoming', this.onPingSupplyPod, this);
    EventBus.off('spawner-neutralized', this.onPingSpawnerNeutralized, this);
    EventBus.off('objective-completed', this.onPingObjectiveCompleted, this);

    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);

    this.container.remove();
  }
}
