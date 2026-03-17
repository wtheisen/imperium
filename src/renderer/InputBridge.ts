import * as THREE from 'three';
import { EventBus } from '../EventBus';
import { EntityRenderer } from './EntityRenderer';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';

export interface TileCoord {
  tileX: number;
  tileY: number;
}

export interface InputEvent {
  tileX: number;
  tileY: number;
  worldX: number;
  worldZ: number;
  button: number;
  screenX: number;
  screenY: number;
}

/**
 * Translates mouse events on the three.js canvas to tile coordinates via raycasting.
 * Emits EventBus events for selection/command systems.
 */
export class InputBridge {
  private camera: THREE.Camera;
  private canvas: HTMLCanvasElement;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private entityRenderer: EntityRenderer;

  /** Track mouse-down position to distinguish clicks from drags. */
  private downPos: { x: number; y: number; button: number } | null = null;
  private static DRAG_THRESHOLD = 5;

  constructor(camera: THREE.Camera, canvas: HTMLCanvasElement, entityRenderer: EntityRenderer) {
    this.camera = camera;
    this.canvas = canvas;
    this.entityRenderer = entityRenderer;

    // Listen on window level for input events.
    // We use the three.js canvas rect for NDC calculations.
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  /** Convert screen pixel position to tile coordinates via ground plane raycast. */
  screenToTile(screenX: number, screenY: number): TileCoord | null {
    const ndc = this.screenToNDC(screenX, screenY);
    this.raycaster.setFromCamera(ndc, this.camera);

    const intersection = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, intersection);
    if (!hit) return null;

    const tileX = Math.floor(intersection.x + 0.5);
    const tileY = Math.floor(intersection.z + 0.5);

    if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) {
      return null;
    }

    return { tileX, tileY };
  }

  /** Raycast against entity meshes — returns entity IDs of hit meshes. */
  raycastEntities(screenX: number, screenY: number): string[] {
    const ndc = this.screenToNDC(screenX, screenY);
    this.raycaster.setFromCamera(ndc, this.camera);

    const meshes = this.entityRenderer.getAllMeshes();
    // Collect all descendant meshes for intersection
    const allObjects: THREE.Object3D[] = [];
    for (const m of meshes) {
      m.traverse((child) => {
        if (child instanceof THREE.Mesh) allObjects.push(child);
      });
    }

    const intersections = this.raycaster.intersectObjects(allObjects, false);
    const ids: string[] = [];
    const seen = new Set<string>();

    for (const hit of intersections) {
      const id = this.entityRenderer.findEntityId(hit.object);
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }

    return ids;
  }

  private screenToNDC(screenX: number, screenY: number): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top) / rect.height) * 2 + 1
    );
  }

  private buildEvent(e: MouseEvent): InputEvent | null {
    const tile = this.screenToTile(e.clientX, e.clientY);
    if (!tile) {
      return {
        tileX: -1, tileY: -1,
        worldX: 0, worldZ: 0,
        button: e.button,
        screenX: e.clientX, screenY: e.clientY,
      };
    }
    // Get precise world hit for fractional coords
    const ndc = this.screenToNDC(e.clientX, e.clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const intersection = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, intersection);

    return {
      tileX: tile.tileX,
      tileY: tile.tileY,
      worldX: intersection.x,
      worldZ: intersection.z,
      button: e.button,
      screenX: e.clientX,
      screenY: e.clientY,
    };
  }

  /** Check if a mouse event should be handled (originated on the canvas, not UI). */
  private isOverCanvas(e: MouseEvent): boolean {
    // If the click target is an HTML UI element (not the canvas), ignore it
    const target = e.target as HTMLElement;
    if (target && target.tagName !== 'CANVAS') return false;

    const rect = this.canvas.getBoundingClientRect();
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.isOverCanvas(e)) return;
    this.downPos = { x: e.clientX, y: e.clientY, button: e.button };
    const evt = this.buildEvent(e);
    if (evt) EventBus.emit('input-pointer-down', evt);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isOverCanvas(e)) return;
    const evt = this.buildEvent(e);
    if (evt) EventBus.emit('input-pointer-move', evt);
  };

  private onMouseUp = (e: MouseEvent): void => {
    // Always clear downPos on mouseup even if outside canvas
    if (this.downPos && this.downPos.button === e.button) {
      const dx = Math.abs(e.clientX - this.downPos.x);
      const dy = Math.abs(e.clientY - this.downPos.y);
      if (dx > InputBridge.DRAG_THRESHOLD || dy > InputBridge.DRAG_THRESHOLD) {
        const evt = this.buildEvent(e);
        if (evt) {
          (evt as any).wasDrag = true;
          EventBus.emit('input-pointer-up', evt);
        }
        this.downPos = null;
        return;
      }
    }
    this.downPos = null;
    const evt = this.buildEvent(e);
    if (evt) EventBus.emit('input-pointer-up', evt);
  };

  dispose(): void {
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
  }
}
