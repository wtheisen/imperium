import * as THREE from 'three';
import { MAP_WIDTH, MAP_HEIGHT, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX } from '../config';
import { EventBus } from '../EventBus';

/**
 * Isometric-style orbit camera for the 3D tile map.
 * Rotate: middle-drag, Alt+left-drag, or Q/E keys
 * Pan: right-drag
 * Zoom: scroll wheel (pinch on trackpad)
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;

  // Spherical coordinates around the look-at target
  private distance = 22;
  private theta = Math.PI / 4;   // horizontal angle (starts NE-ish)
  private phi = Math.PI / 4;     // vertical angle (45° from zenith — more top-down)
  private target = new THREE.Vector3(0, 0, 0);

  // Limits
  private minDistance = 10;
  private maxDistance = 100;
  private minPhi = 0.3;
  private maxPhi = Math.PI / 2 - 0.05;

  // Drag state
  private isRotating = false;
  private isPanning = false;
  private prevMouse = { x: 0, y: 0 };
  private altHeld = false;

  // Edge-pan state
  private mouseScreenX = -1;
  private mouseScreenY = -1;
  private static readonly EDGE_MARGIN = 8; // pixels from screen edge to trigger
  private static readonly EDGE_PAN_SPEED = 0.4;

  // Keyboard rotation
  private keysHeld = new Set<string>();
  private keyRotateSpeed = 0.03;

  // Screen shake
  private shakeTimer = 0;
  private shakeIntensity = 0;

  private domElement: HTMLElement;

  constructor(domElement: HTMLElement, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 300);
    this.domElement = domElement;

    // Center the camera target on the middle of the map
    // Map tiles go 0..MAP_WIDTH on x, 0..MAP_HEIGHT on z in our 3D layout
    this.target.set(MAP_WIDTH / 2, 0, MAP_HEIGHT / 2);

    this.updateCameraPosition();
    this.bindEvents();

    EventBus.on('minimap-pan', this.onMinimapPan, this);
  }

  private onMinimapPan = (data: { tileX: number; tileY: number }): void => {
    this.panTo(data.tileX, data.tileY);
  };

  private updateCameraPosition(): void {
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);
    const sinTheta = Math.sin(this.theta);
    const cosTheta = Math.cos(this.theta);

    this.camera.position.set(
      this.target.x + this.distance * sinPhi * cosTheta,
      this.target.y + this.distance * cosPhi,
      this.target.z + this.distance * sinPhi * sinTheta,
    );
    this.camera.lookAt(this.target);

    // Emit viewport info for minimap
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const viewH = 2 * Math.tan(fovRad / 2) * this.distance * Math.sin(this.phi);
    const viewW = viewH * this.camera.aspect;
    EventBus.emit('camera-moved', {
      x: this.target.x,
      z: this.target.z,
      viewW,
      viewH,
    });
  }

  private bindEvents(): void {
    this.domElement.addEventListener('mousedown', this.onMouseDown);
    this.domElement.addEventListener('mousemove', this.onMouseMove);
    this.domElement.addEventListener('mouseup', this.onMouseUp);
    this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onMouseDown = (e: MouseEvent): void => {
    // Middle mouse → rotate
    if (e.button === 1) {
      this.isRotating = true;
      this.prevMouse = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
    // Alt + left mouse → rotate (trackpad-friendly)
    if (e.button === 0 && this.altHeld) {
      this.isRotating = true;
      this.prevMouse = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
    // Right mouse → pan
    if (e.button === 2) {
      this.isPanning = true;
      this.prevMouse = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    const dx = e.clientX - this.prevMouse.x;
    const dy = e.clientY - this.prevMouse.y;
    this.prevMouse = { x: e.clientX, y: e.clientY };
    this.mouseScreenX = e.clientX;
    this.mouseScreenY = e.clientY;

    if (this.isRotating) {
      this.theta -= dx * 0.005;
      this.phi = Math.max(this.minPhi, Math.min(this.maxPhi, this.phi - dy * 0.005));
      this.updateCameraPosition();
    }

    if (this.isPanning) {
      // Pan along the camera's local XZ plane
      const panSpeed = this.distance * 0.002;
      const right = new THREE.Vector3();
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      right.crossVectors(forward, this.camera.up).normalize();
      // Project forward onto XZ plane for panning
      forward.y = 0;
      forward.normalize();

      this.target.addScaledVector(right, -dx * panSpeed);
      this.target.addScaledVector(forward, dy * panSpeed);
      this.updateCameraPosition();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 1) this.isRotating = false;
    if (e.button === 0) this.isRotating = false;  // release Alt+left-drag
    if (e.button === 2) this.isPanning = false;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Alt') this.altHeld = true;
    this.keysHeld.add(e.key.toLowerCase());
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Alt') this.altHeld = false;
    this.keysHeld.delete(e.key.toLowerCase());
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance * zoomFactor));
    this.updateCameraPosition();
  };

  /** Trigger camera shake (e.g. on ordnance impact). */
  shake(intensity: number, durationMs: number): void {
    // Only override if stronger than current shake
    if (intensity > this.shakeIntensity) {
      this.shakeIntensity = intensity;
    }
    this.shakeTimer = Math.max(this.shakeTimer, durationMs);
  }

  /** Call each frame to apply keyboard rotation (Q/E), edge-of-screen panning, and screen shake. */
  tick(): void {
    let changed = false;
    if (this.keysHeld.has('q')) { this.theta += this.keyRotateSpeed; changed = true; }
    if (this.keysHeld.has('e')) { this.theta -= this.keyRotateSpeed; changed = true; }

    // Edge-of-screen pan
    if (this.mouseScreenX >= 0 && !this.isRotating && !this.isPanning) {
      const margin = CameraController.EDGE_MARGIN;
      const speed = CameraController.EDGE_PAN_SPEED * (this.distance / 30);
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let edgeDX = 0;
      let edgeDY = 0;
      if (this.mouseScreenX <= margin) edgeDX = -speed;
      else if (this.mouseScreenX >= vw - margin) edgeDX = speed;
      if (this.mouseScreenY <= margin) edgeDY = -speed;
      else if (this.mouseScreenY >= vh - margin) edgeDY = speed;

      if (edgeDX !== 0 || edgeDY !== 0) {
        const right = new THREE.Vector3();
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        right.crossVectors(forward, this.camera.up).normalize();
        forward.y = 0;
        forward.normalize();

        this.target.addScaledVector(right, edgeDX);
        this.target.addScaledVector(forward, -edgeDY);
        changed = true;
      }
    }

    if (changed) this.updateCameraPosition();

    // Screen shake
    if (this.shakeTimer > 0) {
      const decay = this.shakeTimer / 300; // fade out
      const offsetX = (Math.random() - 0.5) * 2 * this.shakeIntensity * Math.min(decay, 1);
      const offsetY = (Math.random() - 0.5) * 2 * this.shakeIntensity * Math.min(decay, 1);
      this.camera.position.x += offsetX;
      this.camera.position.y += offsetY;
      this.shakeTimer -= 16; // ~60fps step
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0;
        this.shakeIntensity = 0;
      }
    }
  }

  /** Smoothly pan the camera target to a tile position. */
  panTo(tileX: number, tileY: number): void {
    this.target.set(tileX, 0, tileY);
    this.updateCameraPosition();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.domElement.removeEventListener('mousemove', this.onMouseMove);
    this.domElement.removeEventListener('mouseup', this.onMouseUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    EventBus.off('minimap-pan', this.onMinimapPan, this);
  }
}
