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

describe('VFXRenderer geometry disposal', () => {
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

  it('disposes one-off geometry when particle expires (spawnFlash)', () => {
    // Trigger a flash via the spell VFX event (creates one-off RingGeometry + flash SphereGeometry)
    EventBus.emit('ordnance-vfx-3d', { type: 'fireball', tileX: 5, tileY: 5, radius: 3 });

    const particles = (vfx as any).particles as Array<{
      mesh: THREE.Mesh; lifetime: number; elapsed: number; disposeGeo: boolean;
    }>;

    // Should have particles with disposeGeo flags
    const oneOffParticles = particles.filter(p => p.disposeGeo);
    expect(oneOffParticles.length).toBeGreaterThan(0);

    // Spy on geometry dispose for one-off particles
    const spies = oneOffParticles.map(p => vi.spyOn(p.mesh.geometry, 'dispose'));

    // Advance all particles past their lifetime
    for (const p of particles) {
      p.elapsed = p.lifetime + 1;
    }
    vfx.update(1);

    // All one-off geometries should have been disposed
    for (const spy of spies) {
      expect(spy).toHaveBeenCalled();
    }
  });

  it('does NOT dispose shared geometry (sphereGeo/boxGeo) when particle expires', () => {
    // Trigger card played VFX which creates particles using shared sphereGeo
    EventBus.emit('card-played-3d-vfx', { tileX: 5, tileY: 5, cardType: 'unit' });

    const particles = (vfx as any).particles as Array<{
      mesh: THREE.Mesh; lifetime: number; elapsed: number; disposeGeo: boolean;
    }>;

    const sharedGeoParticles = particles.filter(p => !p.disposeGeo);
    expect(sharedGeoParticles.length).toBeGreaterThan(0);

    // Spy on geometry dispose for shared-geo particles
    const spies = sharedGeoParticles.map(p => vi.spyOn(p.mesh.geometry, 'dispose'));

    // Expire all
    for (const p of particles) {
      p.elapsed = p.lifetime + 1;
    }
    vfx.update(1);

    // Shared geometries should NOT be disposed
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
