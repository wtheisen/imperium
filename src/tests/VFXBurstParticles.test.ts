import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../EventBus';

// Stub document.createElement before importing VFXRenderer
const fakeCanvas = {
  width: 0, height: 0,
  getContext: () => ({
    fillStyle: '', font: '', textAlign: '', textBaseline: '',
    fillRect: vi.fn(), fillText: vi.fn(), clearRect: vi.fn(),
    measureText: () => ({ width: 0 }),
  }),
  style: {},
};
const fakeDiv = {
  style: {}, remove: vi.fn(), appendChild: vi.fn(), contains: vi.fn(() => false),
};
vi.stubGlobal('document', {
  createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : { ...fakeDiv }),
  body: { appendChild: vi.fn(), contains: vi.fn(() => false) },
});

import * as THREE from 'three';
import { VFXRenderer } from '../renderer/VFXRenderer';

describe('VFXRenderer burst particles (spawnBurstParticles)', () => {
  let scene: THREE.Scene;
  let vfx: VFXRenderer;

  beforeEach(() => {
    scene = new THREE.Scene();
    vfx = new VFXRenderer(scene);
    vfx.camera = new THREE.PerspectiveCamera();
  });

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  function getParticles() {
    return (vfx as any).particles as Array<{
      mesh: THREE.Mesh;
      velocity: THREE.Vector3;
      lifetime: number;
      elapsed: number;
      fadeOut: boolean;
      scaleSpeed: number;
      disposeGeo: boolean;
    }>;
  }

  it('onSupplyPodOpened creates 6 burst particles using shared boxGeo', () => {
    // Seed a supply pod mesh so the handler has something to find
    const group = new THREE.Group();
    group.position.set(5, 0, 5);
    scene.add(group);
    (vfx as any).supplyPodMeshes.set('pod1', { group, pulseMesh: null });

    EventBus.emit('supply-pod-opened-3d', { id: 'pod1' });

    const particles = getParticles();
    expect(particles).toHaveLength(6);
    for (const p of particles) {
      expect(p.fadeOut).toBe(true);
      expect(p.scaleSpeed).toBe(-0.3);
      expect(p.disposeGeo).toBe(false);
      expect(p.lifetime).toBe(600);
    }
  });

  it('onPackOpened creates 6 burst particles', () => {
    const group = new THREE.Group();
    group.position.set(3, 0, 7);
    scene.add(group);
    (vfx as any).packMarkers.set('pack1', { group, pulseMesh: null });

    EventBus.emit('pack-opened-3d', { id: 'pack1' });

    const particles = getParticles();
    expect(particles).toHaveLength(6);
    for (const p of particles) {
      expect(p.lifetime).toBe(600);
      expect(p.disposeGeo).toBe(false);
    }
  });

  it('onPOICollected creates 8 burst particles with higher velocity and longer lifetime', () => {
    const group = new THREE.Group();
    group.position.set(10, 0, 10);
    scene.add(group);
    (vfx as any).poiMarkers.set('poi1', { group, pulseMesh: null, floatMesh: null, ringMesh: null });

    EventBus.emit('poi-collected', { id: 'poi1', tileX: 10, tileY: 10 });

    const particles = getParticles();
    expect(particles).toHaveLength(8);
    for (const p of particles) {
      expect(p.lifetime).toBe(700);
      expect(p.disposeGeo).toBe(false);
    }
  });

  it('burst particles use shared geometry (not disposed on expiry)', () => {
    const group = new THREE.Group();
    group.position.set(5, 0, 5);
    scene.add(group);
    (vfx as any).supplyPodMeshes.set('pod2', { group, pulseMesh: null });

    EventBus.emit('supply-pod-opened-3d', { id: 'pod2' });

    const particles = getParticles();
    const spies = particles.map(p => vi.spyOn(p.mesh.geometry, 'dispose'));

    // Expire all particles
    for (const p of particles) {
      p.elapsed = p.lifetime + 1;
    }
    vfx.update(1);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('does nothing when entity id is not found', () => {
    EventBus.emit('supply-pod-opened-3d', { id: 'nonexistent' });
    EventBus.emit('pack-opened-3d', { id: 'nonexistent' });
    EventBus.emit('poi-collected', { id: 'nonexistent', tileX: 0, tileY: 0 });

    expect(getParticles()).toHaveLength(0);
  });
});
