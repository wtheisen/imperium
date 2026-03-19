import * as THREE from 'three';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { EntityManager } from './EntityManager';
import { EventBus } from '../EventBus';
import { InputEvent } from '../renderer/InputBridge';
import { getGameRenderer } from '../renderer/GameRenderer';

export class SelectionSystem {
  private entityManager: EntityManager;
  public selectedUnits: Unit[] = [];
  public selectedBuilding: Building | null = null;
  private dragStart: { screenX: number; screenY: number; tileX: number; tileY: number } | null = null;
  private isDragging: boolean = false;

  // Control groups: Ctrl+1-9 to save, Shift+1-9 to recall
  private controlGroups: Map<number, string[]> = new Map();

  // Double-click detection
  private lastClickTime: number = 0;
  private lastClickUnit: Unit | null = null;

  // CSS overlay selection box
  private selectionBoxDiv: HTMLDivElement | null = null;

  // Keyboard handler ref for cleanup
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;

    // 3D input path via InputBridge events
    EventBus.on('input-pointer-down', this.onInputDown, this);
    EventBus.on('input-pointer-move', this.onInputMove, this);
    EventBus.on('input-pointer-up', this.onInputUp, this);

    // Control group keyboard shortcuts
    this.keyHandler = (e: KeyboardEvent) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        if (e.ctrlKey || e.metaKey) {
          // Save control group
          e.preventDefault();
          this.controlGroups.set(num, this.selectedUnits.map((u) => u.entityId));
        } else if (e.shiftKey) {
          // Recall control group
          e.preventDefault();
          const ids = this.controlGroups.get(num);
          if (ids && ids.length > 0) {
            this.clearSelection();
            const allUnits = this.entityManager.getUnits('player');
            this.selectedUnits = allUnits.filter((u) => u.active && ids.includes(u.entityId));
            for (const unit of this.selectedUnits) {
              this.highlightUnit(unit, true);
            }
            EventBus.emit('selection-changed', { entities: this.selectedUnits });
          }
        }
      }
    };
    document.addEventListener('keydown', this.keyHandler);

    // Create CSS selection box overlay
    this.selectionBoxDiv = document.createElement('div');
    this.selectionBoxDiv.style.position = 'absolute';
    this.selectionBoxDiv.style.border = '1px solid rgba(0, 255, 0, 0.8)';
    this.selectionBoxDiv.style.backgroundColor = 'rgba(0, 255, 0, 0.15)';
    this.selectionBoxDiv.style.pointerEvents = 'none';
    this.selectionBoxDiv.style.zIndex = '4';
    this.selectionBoxDiv.style.display = 'none';
    const gameContainer = document.getElementById('game-container') || document.body;
    gameContainer.appendChild(this.selectionBoxDiv);
  }

  // ── 3D Input Path ──────────────────────────────────────────

  private onInputDown(evt: InputEvent): void {
    // Right button is for commands, not selection
    if (evt.button === 2) return;
    // Skip if alt is held (camera rotate)
    if (evt.button === 0) {
      this.dragStart = { screenX: evt.screenX, screenY: evt.screenY, tileX: evt.tileX, tileY: evt.tileY };
      this.isDragging = false;
    }
  }

  private onInputMove(evt: InputEvent): void {
    if (!this.dragStart || evt.button === 2) return;

    const dx = Math.abs(evt.screenX - this.dragStart.screenX);
    const dy = Math.abs(evt.screenY - this.dragStart.screenY);

    if (dx > 5 || dy > 5) {
      this.isDragging = true;

      // Draw CSS selection box
      if (this.selectionBoxDiv) {
        const x = Math.min(this.dragStart.screenX, evt.screenX);
        const y = Math.min(this.dragStart.screenY, evt.screenY);
        const w = Math.abs(evt.screenX - this.dragStart.screenX);
        const h = Math.abs(evt.screenY - this.dragStart.screenY);
        this.selectionBoxDiv.style.left = `${x}px`;
        this.selectionBoxDiv.style.top = `${y}px`;
        this.selectionBoxDiv.style.width = `${w}px`;
        this.selectionBoxDiv.style.height = `${h}px`;
        this.selectionBoxDiv.style.display = 'block';
      }
    }
  }

  private onInputUp(evt: InputEvent): void {
    if (evt.button === 2) return;

    if (this.isDragging && this.dragStart) {
      this.selectInBox3D(this.dragStart, evt);
    } else if (this.dragStart) {
      this.selectAtTile3D(evt);
    }

    this.dragStart = null;
    this.isDragging = false;

    // Hide CSS selection box
    if (this.selectionBoxDiv) {
      this.selectionBoxDiv.style.display = 'none';
    }
  }

  private selectAtTile3D(evt: InputEvent): void {
    this.clearSelection();

    if (evt.tileX < 0) return;

    // Find the clicked unit (raycast first, then tile-distance fallback)
    let clickedUnit: Unit | null = null;
    let clickedBuilding: Building | null = null;

    const hitIds: string[] = getGameRenderer().inputBridge.raycastEntities(evt.screenX, evt.screenY) || [];

    if (hitIds.length > 0) {
      const allEntities = this.entityManager.getAllEntities();
      for (const id of hitIds) {
        const entity = allEntities.find((e) => e.entityId === id && e.team === 'player');
        if (entity instanceof Unit) { clickedUnit = entity; break; }
        if (entity instanceof Building) { clickedBuilding = entity; break; }
      }
    }

    // Fallback: tile-distance check
    if (!clickedUnit && !clickedBuilding) {
      const units = this.entityManager.getUnits('player');
      let minDist = 1.5;
      for (const unit of units) {
        const dist = Math.abs(unit.tileX - evt.tileX) + Math.abs(unit.tileY - evt.tileY);
        if (dist < minDist) { minDist = dist; clickedUnit = unit; }
      }
    }
    if (!clickedUnit && !clickedBuilding) {
      const buildings = this.entityManager.getBuildings('player');
      let minBuildDist = 2;
      for (const b of buildings) {
        const dist = Math.abs(b.tileX - evt.tileX) + Math.abs(b.tileY - evt.tileY);
        if (dist < minBuildDist) { minBuildDist = dist; clickedBuilding = b; }
      }
    }

    // Double-click detection: select all visible units of same type
    const now = performance.now();
    if (clickedUnit && this.lastClickUnit && clickedUnit.unitType === this.lastClickUnit.unitType
        && now - this.lastClickTime < 400) {
      this.selectAllOfTypeOnScreen(clickedUnit.unitType);
      this.lastClickUnit = null;
      this.lastClickTime = 0;
      return;
    }

    // Track for next potential double-click
    this.lastClickTime = now;
    this.lastClickUnit = clickedUnit;

    if (clickedUnit) {
      this.selectedUnits = [clickedUnit];
      this.highlightUnit(clickedUnit, true);
      EventBus.emit('selection-changed', { entities: this.selectedUnits });
    } else if (clickedBuilding) {
      this.selectedBuilding = clickedBuilding;
      this.highlightBuilding(clickedBuilding, true);
      EventBus.emit('selection-changed', { entities: [], building: clickedBuilding });
    } else {
      EventBus.emit('selection-changed', { entities: this.selectedUnits });
    }
  }

  /** Select all player units of the given type visible on screen */
  private selectAllOfTypeOnScreen(unitType: string): void {
    const gr = getGameRenderer();
    const camera = gr.cameraController.camera;
    const canvas = gr.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const tempVec = new THREE.Vector3();

    const units = this.entityManager.getUnits('player');
    this.selectedUnits = units.filter((u) => {
      if (!u.active || u.unitType !== unitType) return false;
      tempVec.set(u.tileX, 0.3, u.tileY);
      tempVec.project(camera);
      const sx = (tempVec.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-tempVec.y * 0.5 + 0.5) * rect.height + rect.top;
      return sx >= rect.left && sx <= rect.right && sy >= rect.top && sy <= rect.bottom;
    });

    for (const unit of this.selectedUnits) {
      this.highlightUnit(unit, true);
    }
    EventBus.emit('selection-changed', { entities: this.selectedUnits });
  }

  private selectInBox3D(start: { screenX: number; screenY: number }, end: InputEvent): void {
    this.clearSelection();

    // Use screen-space rectangle for selection (works correctly with angled 3D camera)
    const sx1 = Math.min(start.screenX, end.screenX);
    const sy1 = Math.min(start.screenY, end.screenY);
    const sx2 = Math.max(start.screenX, end.screenX);
    const sy2 = Math.max(start.screenY, end.screenY);

    const gr = getGameRenderer();
    const camera = gr.cameraController.camera;
    const canvas = gr.renderer.domElement;
    const rect = canvas.getBoundingClientRect();

    const units = this.entityManager.getUnits('player');
    const tempVec = new THREE.Vector3();
    this.selectedUnits = units.filter((u) => {
      if (!u.active) return false;
      // Project unit world position to screen space
      tempVec.set(u.tileX, 0.3, u.tileY);
      tempVec.project(camera);
      const screenX = (tempVec.x * 0.5 + 0.5) * rect.width + rect.left;
      const screenY = (-tempVec.y * 0.5 + 0.5) * rect.height + rect.top;
      return screenX >= sx1 && screenX <= sx2 && screenY >= sy1 && screenY <= sy2;
    });

    for (const unit of this.selectedUnits) {
      this.highlightUnit(unit, true);
    }
    EventBus.emit('selection-changed', { entities: this.selectedUnits });
  }

  // ── Shared ─────────────────────────────────────────────────

  private highlightUnit(unit: Unit, selected: boolean): void {
    if (selected) {
      // 3D highlight handled via EntityRenderer.setSelected
      EventBus.emit('entity-selected', { entityId: unit.entityId, selected: true });
    } else {
      EventBus.emit('entity-selected', { entityId: unit.entityId, selected: false });
    }
  }

  private highlightBuilding(building: Building, selected: boolean): void {
    if (selected) {
      EventBus.emit('entity-selected', { entityId: building.entityId, selected: true });
    } else {
      EventBus.emit('entity-selected', { entityId: building.entityId, selected: false });
    }
  }

  private clearSelection(): void {
    for (const unit of this.selectedUnits) {
      if (unit.active) this.highlightUnit(unit, false);
    }
    if (this.selectedBuilding && this.selectedBuilding.active) {
      this.highlightBuilding(this.selectedBuilding, false);
    }
    this.selectedUnits = [];
    this.selectedBuilding = null;
  }

  update(_delta: number): void {
    // Update 3D selection highlight
    const ids = this.selectedUnits.map((u) => u.entityId);
    if (this.selectedBuilding) ids.push(this.selectedBuilding.entityId);
    EventBus.emit('selection-highlight', ids);
  }

  destroy(): void {
    EventBus.off('input-pointer-down', this.onInputDown, this);
    EventBus.off('input-pointer-move', this.onInputMove, this);
    EventBus.off('input-pointer-up', this.onInputUp, this);
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.selectionBoxDiv) {
      this.selectionBoxDiv.remove();
      this.selectionBoxDiv = null;
    }
  }
}
