import * as THREE from 'three';
import { EntityMeshFactory } from './EntityMeshFactory';

const ART_W = 160;
const ART_H = 120;

/**
 * Renders entity 3D models to small canvas thumbnails for card art.
 * Uses an offscreen WebGL renderer with its own scene/camera.
 */
export class CardArtRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private factory: EntityMeshFactory;
  private cache = new Map<string, string>(); // texture key → data URL

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(ART_W, ART_H);
    this.renderer.setPixelRatio(2); // crisp rendering
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();

    // Soft ambient + key light
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffeedd, 0.9);
    key.position.set(2, 3, 1);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8899bb, 0.3);
    fill.position.set(-1, 1, -1);
    this.scene.add(fill);

    this.camera = new THREE.PerspectiveCamera(30, ART_W / ART_H, 0.1, 50);

    this.factory = new EntityMeshFactory();
  }

  /**
   * Get a data URL for a card's art. Renders the entity mesh if it has a
   * texture key, or generates a stylized abstract for non-entity cards.
   */
  getArt(textureKey?: string, cardType?: string): string {
    const cacheKey = textureKey || cardType || 'default';
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    let dataUrl: string;
    if (textureKey) {
      dataUrl = this.renderEntity(textureKey);
    } else {
      dataUrl = this.renderAbstract(cardType || 'ordnance');
    }

    this.cache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  private renderEntity(textureKey: string): string {
    // Clear scene of previous meshes
    const toRemove: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj.userData.__cardArt) toRemove.push(obj);
    });
    for (const obj of toRemove) this.scene.remove(obj);

    const mesh = this.factory.create(textureKey);
    mesh.userData.__cardArt = true;
    this.scene.add(mesh);

    // Compute bounding box to frame the model
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Position camera to frame the model
    const dist = maxDim * 2.2;
    this.camera.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist * 0.7);
    this.camera.lookAt(center);

    this.renderer.render(this.scene, this.camera);

    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    this.scene.remove(mesh);
    return dataUrl;
  }

  private renderAbstract(cardType: string): string {
    // For non-entity cards (ordnance, equipment), draw a 2D icon
    const canvas = document.createElement('canvas');
    canvas.width = ART_W;
    canvas.height = ART_H;
    const ctx = canvas.getContext('2d')!;

    // Atmospheric gradient background
    const colors: Record<string, [string, string]> = {
      ordnance: ['#2a1a1a', '#4a2020'],
      equipment: ['#0a1a1a', '#103a3a'],
    };
    const [c1, c2] = colors[cardType] || ['#1a1a1a', '#2a2a2a'];
    const grad = ctx.createRadialGradient(ART_W / 2, ART_H / 2, 0, ART_W / 2, ART_H / 2, ART_W * 0.7);
    grad.addColorStop(0, c2);
    grad.addColorStop(1, c1);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, ART_W, ART_H);

    // Draw symbolic icon
    ctx.fillStyle = 'rgba(200,168,78,0.15)';
    ctx.font = '60px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const icons: Record<string, string> = {
      ordnance: '\u2737',   // ✷
      equipment: '\u2692',  // ⚒
    };
    ctx.fillText(icons[cardType] || '\u2605', ART_W / 2, ART_H / 2);

    return canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.renderer.dispose();
    this.factory.dispose();
    this.cache.clear();
  }
}

/** Singleton for card art — created lazily. */
let _instance: CardArtRenderer | null = null;
export function getCardArtRenderer(): CardArtRenderer {
  if (!_instance) _instance = new CardArtRenderer();
  return _instance;
}
