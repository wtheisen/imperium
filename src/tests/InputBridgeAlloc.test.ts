import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { InputBridge } from '../renderer/InputBridge';
import { EntityRenderer } from '../renderer/EntityRenderer';

// Provide a minimal window stub for the Node test environment
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();
Object.defineProperty(globalThis, 'window', {
  value: { addEventListener: mockAddEventListener, removeEventListener: mockRemoveEventListener },
  writable: true,
});

function makeCanvas(left = 0, top = 0, width = 800, height = 600): HTMLCanvasElement {
  return {
    tagName: 'CANVAS',
    getBoundingClientRect: () => ({ left, top, right: left + width, bottom: top + height, width, height }),
  } as unknown as HTMLCanvasElement;
}

function makeEntityRenderer(): EntityRenderer {
  return { getAllMeshes: () => [], findEntityId: () => null } as unknown as EntityRenderer;
}

function makeBridge(camPos = new THREE.Vector3(0, 30, 30)): InputBridge {
  const cam = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  cam.position.copy(camPos);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return new InputBridge(cam as unknown as THREE.PerspectiveCamera, makeCanvas(), makeEntityRenderer());
}

describe('InputBridge – pre-allocated vectors', () => {
  beforeEach(() => {
    mockAddEventListener.mockReset();
  });

  it('_ndc is the same object reference across calls (no new Vector2 per call)', () => {
    const bridge = makeBridge() as any;
    const ref = bridge._ndc;
    bridge.screenToTile(400, 300);
    bridge.screenToTile(200, 150);
    expect(bridge._ndc).toBe(ref);
  });

  it('_intersection is the same object reference across screenToTile calls', () => {
    const bridge = makeBridge() as any;
    const ref = bridge._intersection;
    bridge.screenToTile(400, 300);
    bridge.screenToTile(100, 100);
    expect(bridge._intersection).toBe(ref);
  });

  it('screenToTile returns consistent results on repeated identical calls', () => {
    const bridge = makeBridge(new THREE.Vector3(20, 20, 20));
    const r1 = bridge.screenToTile(400, 300);
    const r2 = bridge.screenToTile(400, 300);
    expect(r1).toEqual(r2);
  });

  it('screenToTile returns null for coordinates that miss the map', () => {
    const bridge = makeBridge();
    // Camera looking at origin from far away; extreme screen edges should miss or be out-of-map
    const result = bridge.screenToTile(-99999, -99999);
    expect(result).toBeNull();
  });
});
