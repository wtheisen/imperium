import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SpriteBillboard } from '../renderer/sprites/SpriteBillboard';
import { SpriteSheetConfig } from '../renderer/sprites/SpriteSheetConfig';

function makeConfig(): SpriteSheetConfig {
  const texture = new THREE.Texture();
  return {
    unitType: 'marine',
    texture,
    columns: 4,
    rows: 2,
    frameWidth: 64,
    frameHeight: 64,
    worldHeight: 1.5,
    animations: {
      idle: { startCol: 0, frameCount: 1, frameDuration: 200, loop: true },
      walk: { startCol: 1, frameCount: 2, frameDuration: 100, loop: true },
      attack: { startCol: 3, frameCount: 1, frameDuration: 150, loop: false },
      death: { startCol: 3, frameCount: 1, frameDuration: 300, loop: false },
    },
  };
}

describe('SpriteBillboard – static scratch vector', () => {
  it('_worldPos is the same object reference across faceCamera calls', () => {
    const billboard = new SpriteBillboard(makeConfig()) as any;
    const cam = new THREE.Vector3(5, 10, 5);
    billboard.faceCamera(cam);
    const ref = (SpriteBillboard as any)._worldPos;
    billboard.faceCamera(cam);
    expect((SpriteBillboard as any)._worldPos).toBe(ref);
  });

  it('_worldPos is shared across multiple SpriteBillboard instances', () => {
    const b1 = new SpriteBillboard(makeConfig()) as any;
    const b2 = new SpriteBillboard(makeConfig()) as any;
    const cam = new THREE.Vector3(0, 10, 10);
    b1.faceCamera(cam);
    const ref = (SpriteBillboard as any)._worldPos;
    b2.faceCamera(cam);
    expect((SpriteBillboard as any)._worldPos).toBe(ref);
  });

  it('faceCamera rotates billboard toward camera on Y axis', () => {
    const billboard = new SpriteBillboard(makeConfig());
    // Place billboard mesh at origin (default), camera due north (+z)
    billboard.mesh.position.set(0, 0, 0);
    billboard.mesh.updateMatrixWorld();
    billboard.faceCamera(new THREE.Vector3(0, 0, 10));
    // atan2(dx=0, dz=10) = 0
    expect(billboard.mesh.rotation.y).toBeCloseTo(0);
  });

  it('faceCamera rotation is correct for camera to the right', () => {
    const billboard = new SpriteBillboard(makeConfig());
    billboard.mesh.position.set(0, 0, 0);
    billboard.mesh.updateMatrixWorld();
    billboard.faceCamera(new THREE.Vector3(10, 0, 0));
    // atan2(dx=10, dz=0) = π/2
    expect(billboard.mesh.rotation.y).toBeCloseTo(Math.PI / 2);
  });
});
