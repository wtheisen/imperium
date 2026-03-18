import * as THREE from 'three';
import { TileMapMesh } from './TileMapMesh';
import { TerrainDecorations } from './TerrainDecorations';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';

const enum FogLevel {
  HIDDEN = 0,
  EXPLORED = 1,
  VISIBLE = 2,
}

/**
 * Fog of war using a single large translucent plane with a procedural cloud texture.
 * The texture is updated per-frame based on fog state — smooth edges, animated drift.
 */
export class FogRenderer {
  private tileMap: TileMapMesh;
  private decorations: TerrainDecorations | null;

  // Fog cloud plane
  private fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private blurCanvas: HTMLCanvasElement;
  private blurCtx: CanvasRenderingContext2D;
  private fogTexture: THREE.CanvasTexture;
  private fogPlane: THREE.Mesh;
  private scene: THREE.Scene;

  // State
  private fogGrid: number[][] = [];
  private targetAlpha: Float32Array; // per-tile target opacity
  private currentAlpha: Float32Array; // per-tile current opacity (smoothed)
  private elapsed = 0;

  constructor(tileMap: TileMapMesh, scene?: THREE.Scene, decorations?: TerrainDecorations) {
    this.tileMap = tileMap;
    this.decorations = decorations ?? null;
    this.scene = scene || tileMap.group.parent as THREE.Scene;

    this.targetAlpha = new Float32Array(MAP_WIDTH * MAP_HEIGHT);
    this.currentAlpha = new Float32Array(MAP_WIDTH * MAP_HEIGHT);
    this.targetAlpha.fill(1.0);
    this.currentAlpha.fill(1.0);

    // Create fog canvas — each tile gets a block of pixels, upscaled with blur
    const resolution = 4; // pixels per tile
    const canvasW = MAP_WIDTH * resolution;
    const canvasH = MAP_HEIGHT * resolution;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = canvasW;
    this.fogCanvas.height = canvasH;
    this.fogCtx = this.fogCanvas.getContext('2d')!;

    // Second canvas for blur pass
    this.blurCanvas = document.createElement('canvas');
    this.blurCanvas.width = canvasW;
    this.blurCanvas.height = canvasH;
    this.blurCtx = this.blurCanvas.getContext('2d')!;

    // Fill solid black initially
    this.fogCtx.fillStyle = '#000';
    this.fogCtx.fillRect(0, 0, canvasW, canvasH);

    this.fogTexture = new THREE.CanvasTexture(this.fogCanvas);
    this.fogTexture.minFilter = THREE.LinearFilter;
    this.fogTexture.magFilter = THREE.LinearFilter;

    // Single plane covering the entire map
    const planeGeo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshBasicMaterial({
      map: this.fogTexture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.fogPlane = new THREE.Mesh(planeGeo, planeMat);
    // Center the plane over the map (tiles go from 0,0 to MAP_WIDTH-1,MAP_HEIGHT-1)
    this.fogPlane.position.set(MAP_WIDTH / 2 - 0.5, 0.65, MAP_HEIGHT / 2 - 0.5);
    this.fogPlane.renderOrder = 500;
    this.scene.add(this.fogPlane);
  }

  updateFog(fogGrid: number[][]): void {
    this.fogGrid = fogGrid;

    // Update target alphas
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const state = fogGrid[y]?.[x] ?? FogLevel.HIDDEN;
        const idx = y * MAP_WIDTH + x;
        switch (state) {
          case FogLevel.HIDDEN:
            this.targetAlpha[idx] = 0.92;
            break;
          case FogLevel.EXPLORED:
            this.targetAlpha[idx] = 0.15;
            break;
          case FogLevel.VISIBLE:
            this.targetAlpha[idx] = 0;
            break;
        }
      }
    }

    // Also darken tile materials and decorations
    this.applyTileDarkening();
    if (this.decorations) {
      this.decorations.updateFog(fogGrid);
    }
  }

  tick(deltaMs: number): void {
    this.elapsed += deltaMs;
    const dt = Math.min(deltaMs / 1000, 0.05);

    // Smooth alpha transitions
    const lerpSpeed = 3.0;
    for (let i = 0; i < this.currentAlpha.length; i++) {
      this.currentAlpha[i] += (this.targetAlpha[i] - this.currentAlpha[i]) * lerpSpeed * dt;
    }

    // Redraw fog texture
    this.drawFogTexture();
  }

  private drawFogTexture(): void {
    const res = 4;
    const w = this.fogCanvas.width;
    const h = this.fogCanvas.height;
    const ctx = this.fogCtx;
    const t = this.elapsed / 1000;

    // Get pixel data for direct manipulation
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const alpha = this.currentAlpha[ty * MAP_WIDTH + tx];

        // Fill the tile's pixel block
        for (let py = 0; py < res; py++) {
          for (let px = 0; px < res; px++) {
            const cx = tx * res + px;
            const cy = ty * res + py;
            const idx = (cy * w + cx) * 4;

            // Subtle noise variation for organic look
            const noise = Math.sin((tx + px * 0.25) * 1.7 + t * 0.3) *
                          Math.cos((ty + py * 0.25) * 2.1 + t * 0.2) * 0.08;

            const a = Math.max(0, Math.min(1, alpha + noise));

            // Dark gray fog
            data[idx] = 12;     // R
            data[idx + 1] = 12; // G
            data[idx + 2] = 14; // B
            data[idx + 3] = Math.floor(a * 255); // A
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Blur pass — draw sharp canvas onto blur canvas with filter, then copy back
    this.blurCtx.clearRect(0, 0, w, h);
    this.blurCtx.filter = 'blur(4px)';
    this.blurCtx.drawImage(this.fogCanvas, 0, 0);
    this.blurCtx.filter = 'none';

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.blurCanvas, 0, 0);

    this.fogTexture.needsUpdate = true;
  }

  private applyTileDarkening(): void {
    // Reset vertex colors before the pass — setTileColor uses max-brightness
    // on shared vertices, so we need a clean slate each time.
    this.tileMap.resetVertexColors();

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const state = this.fogGrid[y]?.[x] ?? FogLevel.HIDDEN;
        let mult: number;
        switch (state) {
          case FogLevel.HIDDEN:  mult = 0.15; break;
          case FogLevel.EXPLORED: mult = 0.8; break;
          case FogLevel.VISIBLE: mult = 1.0; break;
          default: mult = 0.15;
        }
        this.tileMap.setTileColor(x, y, mult, mult, mult);
      }
    }
  }

  dispose(): void {
    this.scene.remove(this.fogPlane);
    this.fogPlane.geometry.dispose();
    (this.fogPlane.material as THREE.Material).dispose();
    this.fogTexture.dispose();
  }
}
