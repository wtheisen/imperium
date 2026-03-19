import { describe, it, expect, vi, beforeEach } from 'vitest';

// Global call trackers
const createImageDataCalls: Array<[number, number]> = [];
const putImageDataCalls: unknown[] = [];

// Mock Three.js before importing FogRenderer
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
    createImageData: vi.fn((w: number, h: number) => {
      createImageDataCalls.push([w, h]);
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    }),
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

describe('FogRenderer ImageData reuse', () => {
  let renderer: FogRenderer;

  beforeEach(() => {
    createImageDataCalls.length = 0;
    putImageDataCalls.length = 0;
    renderer = new FogRenderer(makeTileMap());
  });

  it('allocates ImageData once during construction', () => {
    expect(createImageDataCalls).toHaveLength(1);
    expect(createImageDataCalls[0]).toEqual([40, 40]); // 10 * 4 resolution
  });

  it('does not allocate new ImageData on tick', () => {
    createImageDataCalls.length = 0;

    for (let i = 0; i < 10; i++) {
      renderer.tick(16);
    }

    expect(createImageDataCalls).toHaveLength(0);
  });

  it('puts image data to canvas each tick', () => {
    putImageDataCalls.length = 0;
    renderer.tick(16);
    expect(putImageDataCalls.length).toBeGreaterThan(0);
  });
});
