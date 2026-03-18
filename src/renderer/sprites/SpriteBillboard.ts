import * as THREE from 'three';
import { SpriteSheetConfig } from './SpriteSheetConfig';

/**
 * A Y-axis-only billboarded quad that displays a frame from a sprite sheet atlas.
 * Gives the AoE2 "standing cutout" look — faces camera horizontally but stays upright.
 */
export class SpriteBillboard {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private config: SpriteSheetConfig;

  constructor(config: SpriteSheetConfig) {
    this.config = config;

    // Aspect ratio of a single frame
    const aspect = config.frameWidth / config.frameHeight;
    const height = config.worldHeight;
    const width = height * aspect;

    const geometry = new THREE.PlaneGeometry(width, height);
    // Shift geometry up so the bottom edge sits at y=0 (ground level)
    geometry.translate(0, height / 2, 0);

    // Clone texture so each billboard can have independent UV offsets
    const texture = config.texture.clone();
    texture.needsUpdate = true;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.repeat.set(1 / config.columns, 1 / config.rows);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    this.mesh = new THREE.Mesh(geometry, material);
  }

  /** Update the displayed frame by setting texture UV offset. */
  setFrame(offsetX: number, offsetY: number): void {
    const tex = this.mesh.material.map;
    if (tex) {
      tex.offset.set(offsetX, offsetY);
    }
  }

  /** Rotate the billboard to face the camera on the Y axis only. */
  faceCamera(cameraPosition: THREE.Vector3): void {
    const worldPos = new THREE.Vector3();
    this.mesh.getWorldPosition(worldPos);
    const dx = cameraPosition.x - worldPos.x;
    const dz = cameraPosition.z - worldPos.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }

  /** Tint the sprite (for hit flash or team coloring). */
  setTint(color: THREE.ColorRepresentation): void {
    this.mesh.material.color.set(color);
  }

  /** Reset tint to white (no tint). */
  clearTint(): void {
    this.mesh.material.color.set(0xffffff);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.map?.dispose();
    this.mesh.material.dispose();
  }
}
