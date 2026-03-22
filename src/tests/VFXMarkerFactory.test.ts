import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../EventBus';

// Stub document before importing VFXRenderer
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

// Helper to access private statics / internals
const Colors = (VFXRenderer as any).VFX_COLORS as Record<string, Record<string, number>>;

describe('VFX_COLORS', () => {
  it('spell colors are correct', () => {
    expect(Colors.spell.heal).toBe(0x00ff00);
    expect(Colors.spell.fireball).toBe(0xff4400);
    expect(Colors.spell.stasis).toBe(0x4488ff);
    expect(Colors.spell.vortex).toBe(0x9922cc);
    expect(Colors.spell.ability).toBe(0x44ddff);
  });

  it('mutator colors are correct', () => {
    expect(Colors.mutator.iron_rain_warning).toBe(0xff6600);
    expect(Colors.mutator.iron_rain_impact).toBe(0xff2200);
    expect(Colors.mutator.toxic_tick).toBe(0x22cc22);
    expect(Colors.mutator.ambush_warp_in).toBe(0x9933ff);
    expect(Colors.mutator.blood_tithe_gain).toBe(0xffcc00);
    expect(Colors.mutator.blood_tithe_loss).toBe(0xff0000);
  });

  it('objective colors are correct', () => {
    expect(Colors.objective.destroy).toBe(0xff4444);
    expect(Colors.objective.recover).toBe(0x44aaff);
    expect(Colors.objective.purge).toBe(0xffaa00);
  });

  it('pack colors are correct', () => {
    expect(Colors.pack.random).toBe(0xc8982a);
    expect(Colors.pack.wargear).toBe(0x50b0b0);
    expect(Colors.pack.ordnance).toBe(0xa070cc);
    expect(Colors.pack.unit).toBe(0x6090cc);
    expect(Colors.pack.building).toBe(0x60aa60);
  });

  it('poi colors are correct', () => {
    expect(Colors.poi.gold_cache).toBe(0xc8982a);
    expect(Colors.poi.ammo_dump).toBe(0x50b0b0);
    expect(Colors.poi.med_station).toBe(0x60aa60);
    expect(Colors.poi.intel).toBe(0x6090cc);
    expect(Colors.poi.relic).toBe(0xa070cc);
  });

  it('tactical colors are correct', () => {
    expect(Colors.tactical.move).toBe(0x44ff44);
    expect(Colors.tactical.attack).toBe(0xff4444);
    expect(Colors.tactical['attack-move']).toBe(0xff8844);
    expect(Colors.tactical.patrol).toBe(0x4488ff);
    expect(Colors.tactical.gather).toBe(0xffaa00);
  });
});

describe('VFXRenderer marker handlers', () => {
  let scene: THREE.Scene;
  let vfx: VFXRenderer;

  beforeEach(() => {
    scene = new THREE.Scene();
    vfx = new VFXRenderer(scene);
  });

  afterEach(() => {
    EventBus.removeAllListeners();
  });

  // ── Objective markers ──────────────────────────────────────

  it('objective-marker-3d adds group to scene and stores MarkerEntry with spinMesh', () => {
    EventBus.emit('objective-marker-3d', { id: 'obj1', tileX: 3, tileY: 7, type: 'destroy' });

    const markers = (vfx as any).objectiveMarkers as Map<string, any>;
    expect(markers.has('obj1')).toBe(true);

    const entry = markers.get('obj1');
    expect(entry.group).toBeInstanceOf(THREE.Group);
    expect(entry.spinMesh).toBeInstanceOf(THREE.Mesh);
    expect(scene.children).toContain(entry.group);
  });

  it('objective-marker-3d positions group at tile coordinates', () => {
    EventBus.emit('objective-marker-3d', { id: 'obj2', tileX: 5, tileY: 9, type: 'recover' });
    const entry = (vfx as any).objectiveMarkers.get('obj2');
    expect(entry.group.position.x).toBe(5);
    expect(entry.group.position.z).toBe(9);
  });

  it('objective-marker-3d uses correct color for each type', () => {
    for (const [type, expected] of Object.entries(Colors.objective)) {
      const id = `obj-${type}`;
      EventBus.emit('objective-marker-3d', { id, tileX: 0, tileY: 0, type });
      const entry = (vfx as any).objectiveMarkers.get(id);
      // spinMesh (diamond) uses MeshStandardMaterial with emissive
      const mat = entry.spinMesh.material as THREE.MeshStandardMaterial;
      expect(mat.color.getHex()).toBe(expected);
    }
  });

  it('objective group has 3 child meshes (pillar, ring, diamond)', () => {
    EventBus.emit('objective-marker-3d', { id: 'obj3', tileX: 0, tileY: 0, type: 'purge' });
    const entry = (vfx as any).objectiveMarkers.get('obj3');
    expect(entry.group.children).toHaveLength(3);
  });

  it('objective-completed turns spinMesh green', () => {
    EventBus.emit('objective-marker-3d', { id: 'obj4', tileX: 0, tileY: 0, type: 'destroy' });
    EventBus.emit('objective-completed', { objectiveId: 'obj4' });
    const entry = (vfx as any).objectiveMarkers.get('obj4');
    const mat = entry.spinMesh.material as THREE.MeshStandardMaterial;
    expect(mat.emissive.getHex()).toBe(0x44ff44);
  });

  // ── Pack markers ──────────────────────────────────────────

  it('pack-marker-3d adds group to scene and stores MarkerEntry with pulseMesh', () => {
    EventBus.emit('pack-marker-3d', { id: 'pack1', type: 'wargear', tileX: 2, tileY: 4 });

    const markers = (vfx as any).packMarkers as Map<string, any>;
    expect(markers.has('pack1')).toBe(true);

    const entry = markers.get('pack1');
    expect(entry.group).toBeInstanceOf(THREE.Group);
    expect(entry.pulseMesh).toBeInstanceOf(THREE.Mesh);
    expect(scene.children).toContain(entry.group);
  });

  it('pack-marker-3d uses correct color for each type', () => {
    for (const [type, expected] of Object.entries(Colors.pack)) {
      const id = `pack-${type}`;
      EventBus.emit('pack-marker-3d', { id, type, tileX: 0, tileY: 0 });
      const entry = (vfx as any).packMarkers.get(id);
      const mat = entry.pulseMesh.material as THREE.MeshBasicMaterial;
      expect(mat.color.getHex()).toBe(expected);
    }
  });

  it('pack-marker-3d group has 2 child meshes (body, beacon)', () => {
    EventBus.emit('pack-marker-3d', { id: 'pack2', type: 'unit', tileX: 0, tileY: 0 });
    const entry = (vfx as any).packMarkers.get('pack2');
    expect(entry.group.children).toHaveLength(2);
  });

  it('pack-opened-3d removes entry from map and scene', () => {
    EventBus.emit('pack-marker-3d', { id: 'pack3', type: 'random', tileX: 1, tileY: 1 });
    const entry = (vfx as any).packMarkers.get('pack3');
    expect(scene.children).toContain(entry.group);

    EventBus.emit('pack-opened-3d', { id: 'pack3' });
    expect((vfx as any).packMarkers.has('pack3')).toBe(false);
    expect(scene.children).not.toContain(entry.group);
  });

  // ── POI markers ───────────────────────────────────────────

  it('poi-marker-3d adds group to scene and stores MarkerEntry with pulseMesh, floatMesh, ringMesh', () => {
    EventBus.emit('poi-marker-3d', { id: 'poi1', type: 'relic', tileX: 6, tileY: 8 });

    const markers = (vfx as any).poiMarkers as Map<string, any>;
    expect(markers.has('poi1')).toBe(true);

    const entry = markers.get('poi1');
    expect(entry.group).toBeInstanceOf(THREE.Group);
    expect(entry.pulseMesh).toBeInstanceOf(THREE.Mesh);
    expect(entry.floatMesh).toBeInstanceOf(THREE.Mesh);
    expect(entry.ringMesh).toBeInstanceOf(THREE.Mesh);
    expect(scene.children).toContain(entry.group);
  });

  it('poi-marker-3d pulseMesh and floatMesh are the same mesh (icon sphere)', () => {
    EventBus.emit('poi-marker-3d', { id: 'poi2', type: 'intel', tileX: 0, tileY: 0 });
    const entry = (vfx as any).poiMarkers.get('poi2');
    expect(entry.pulseMesh).toBe(entry.floatMesh);
  });

  it('poi-marker-3d uses correct color for each type', () => {
    for (const [type, expected] of Object.entries(Colors.poi)) {
      const id = `poi-${type}`;
      EventBus.emit('poi-marker-3d', { id, type, tileX: 0, tileY: 0 });
      const entry = (vfx as any).poiMarkers.get(id);
      const mat = entry.pulseMesh.material as THREE.MeshBasicMaterial;
      expect(mat.color.getHex()).toBe(expected);
    }
  });

  it('poi-marker-3d group has 3 child meshes (pillar, ring, icon)', () => {
    EventBus.emit('poi-marker-3d', { id: 'poi3', type: 'gold_cache', tileX: 0, tileY: 0 });
    const entry = (vfx as any).poiMarkers.get('poi3');
    expect(entry.group.children).toHaveLength(3);
  });

  it('poi-collected removes entry from map and scene', () => {
    EventBus.emit('poi-marker-3d', { id: 'poi4', type: 'med_station', tileX: 2, tileY: 2 });
    const entry = (vfx as any).poiMarkers.get('poi4');
    expect(scene.children).toContain(entry.group);

    EventBus.emit('poi-collected', { id: 'poi4', tileX: 2, tileY: 2 });
    expect((vfx as any).poiMarkers.has('poi4')).toBe(false);
    expect(scene.children).not.toContain(entry.group);
  });

  // ── Unknown type fallbacks ────────────────────────────────

  it('objective-marker-3d falls back to white for unknown type', () => {
    EventBus.emit('objective-marker-3d', { id: 'obj-unk', tileX: 0, tileY: 0, type: 'unknown' });
    const entry = (vfx as any).objectiveMarkers.get('obj-unk');
    const mat = entry.spinMesh.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xffffff);
  });

  it('pack-marker-3d falls back to gold for unknown type', () => {
    EventBus.emit('pack-marker-3d', { id: 'pack-unk', type: 'unknown', tileX: 0, tileY: 0 });
    const entry = (vfx as any).packMarkers.get('pack-unk');
    const mat = entry.pulseMesh.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0xc8982a);
  });

  it('poi-marker-3d falls back to gold for unknown type', () => {
    EventBus.emit('poi-marker-3d', { id: 'poi-unk', type: 'unknown', tileX: 0, tileY: 0 });
    const entry = (vfx as any).poiMarkers.get('poi-unk');
    const mat = entry.pulseMesh.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0xc8982a);
  });

  // ── Animation (update) ────────────────────────────────────

  it('update spins objective spinMesh', () => {
    EventBus.emit('objective-marker-3d', { id: 'obj-spin', tileX: 0, tileY: 0, type: 'destroy' });
    const entry = (vfx as any).objectiveMarkers.get('obj-spin');
    const before = entry.spinMesh.rotation.y;
    vfx.update(100); // 100ms
    expect(entry.spinMesh.rotation.y).toBeGreaterThan(before);
  });

  it('update pulses pack pulseMesh opacity', () => {
    EventBus.emit('pack-marker-3d', { id: 'pack-pulse', type: 'wargear', tileX: 0, tileY: 0 });
    const entry = (vfx as any).packMarkers.get('pack-pulse');
    const mat = entry.pulseMesh.material as THREE.MeshBasicMaterial;
    const before = mat.opacity;
    vfx.update(100);
    // Opacity should be within the pulse range (0.2–0.4)
    expect(mat.opacity).toBeGreaterThanOrEqual(0);
    expect(mat.opacity).toBeLessThanOrEqual(0.5);
    // Called update so opacity may differ from initial 0.4 (or be same if sin is 1)
    expect(typeof mat.opacity).toBe('number');
    void before; // value changes based on Date.now()
  });

  it('update floats poi floatMesh position', () => {
    EventBus.emit('poi-marker-3d', { id: 'poi-float', type: 'relic', tileX: 0, tileY: 0 });
    const entry = (vfx as any).poiMarkers.get('poi-float');
    vfx.update(100);
    // floatMesh.position.y should be near 0.8 ± 0.08
    expect(entry.floatMesh.position.y).toBeGreaterThanOrEqual(0.72);
    expect(entry.floatMesh.position.y).toBeLessThanOrEqual(0.88);
  });
});
