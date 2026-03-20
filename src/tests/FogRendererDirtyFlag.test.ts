import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track putImageData calls to detect when drawFogTexture fires
const putImageDataCalls: unknown[] = [];

vi.mock('three', () => {
  function CanvasTexture() {
    return { minFilter: 0, magFilter: 0, needsUpdate: false, dispose: vi.fn() };
  }
  function PlaneGeometry() {
    return { rotateX: vi.fn(), dispose: vi.fn() };
  }
  function MeshBasicMaterial() {
    return { dispose: vi.fn() };
  }
  function Mesh() {
    return {
      position: { set: vi.fn() },
      renderOrder: 0,
      geometry: { dispose: vi.fn() },
      material: { dispose: vi.fn() },
    };
  }
  return { CanvasTexture, LinearFilter: 1, PlaneGeometry, MeshBasicMaterial, Mesh, DoubleSide: 2, Scene: vi.fn() };
});

vi.mock('../config', () => ({
  MAP_WIDTH: 10,
  MAP_HEIGHT: 10,
}));

function mockContext(): CanvasRenderingContext2D {
  return {
    createImageData: vi.fn((w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4), width: w, height: h,
    })),
    putImageData: vi.fn((...args: unknown[]) => { putImageDataCalls.push(args); }),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: '',
    filter: '',
  } as unknown as CanvasRenderingContext2D;
}

vi.stubGlobal('document', {
  createElement: vi.fn(() => {
    const ctx = mockContext();
    return { width: 0, height: 0, getContext: vi.fn(() => ctx) };
  }),
});

import { FogRenderer } from '../renderer/FogRenderer';

function makeTileMap() {
  return {
    group: { parent: { add: vi.fn(), remove: vi.fn() } },
    resetVertexColors: vi.fn(),
    setTileColor: vi.fn(),
  } as any;
}

function makeFogGrid(width: number, height: number, value: number): number[][] {
  return Array.from({ length: height }, () => Array(width).fill(value));
}

describe('FogRenderer dirty flag optimization', () => {
  let renderer: FogRenderer;

  beforeEach(() => {
    putImageDataCalls.length = 0;
    renderer = new FogRenderer(makeTileMap());
  });

  it('redraws on first tick (dirty starts true)', () => {
    putImageDataCalls.length = 0;
    renderer.tick(16);
    expect(putImageDataCalls.length).toBe(1);
  });

  it('stops redrawing after alphas converge', () => {
    // Tick many times to let alphas converge (all start at 1.0, target 1.0)
    for (let i = 0; i < 60; i++) {
      renderer.tick(16);
    }

    // Now alphas should be converged and dirty should be false
    putImageDataCalls.length = 0;
    for (let i = 0; i < 10; i++) {
      renderer.tick(16);
    }
    expect(putImageDataCalls.length).toBe(0);
  });

  it('resumes redrawing after updateFog changes targets', () => {
    // Converge first
    for (let i = 0; i < 60; i++) {
      renderer.tick(16);
    }
    putImageDataCalls.length = 0;

    // Change fog state — VISIBLE = 2
    renderer.updateFog(makeFogGrid(10, 10, 2));
    renderer.tick(16);

    expect(putImageDataCalls.length).toBe(1);
  });

  it('keeps redrawing while alphas are still lerping', () => {
    // Change fog to VISIBLE (target alpha = 0) from default (current alpha = 1)
    renderer.updateFog(makeFogGrid(10, 10, 2));

    // Each tick should redraw since alphas are actively changing
    putImageDataCalls.length = 0;
    for (let i = 0; i < 5; i++) {
      renderer.tick(16);
    }
    expect(putImageDataCalls.length).toBe(5);
  });

  it('stops redrawing after lerp completes following fog change', () => {
    renderer.updateFog(makeFogGrid(10, 10, 2));

    // Tick enough for full convergence (target=0, lerpSpeed=3, capped dt=0.05)
    for (let i = 0; i < 200; i++) {
      renderer.tick(16);
    }

    putImageDataCalls.length = 0;
    for (let i = 0; i < 10; i++) {
      renderer.tick(16);
    }
    expect(putImageDataCalls.length).toBe(0);
  });
});
