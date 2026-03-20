import { SelectionSystem } from './SelectionSystem';
import { PathfindingSystem } from './PathfindingSystem';
import { EntityManager } from './EntityManager';
import { MapManager } from '../map/MapManager';
import { MoverComponent } from '../components/MoverComponent';
import { CombatComponent } from '../components/CombatComponent';
import { GathererComponent } from '../components/GathererComponent';
import { ProductionComponent } from '../components/ProductionComponent';
import { FogOfWarSystem } from './FogOfWarSystem';
import { Unit } from '../entities/Unit';
import { EventBus } from '../EventBus';
import { InputEvent } from '../renderer/InputBridge';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';
import { IsoHelper } from '../map/IsoHelper';
import { TacticalPauseManager } from './TacticalPauseManager';

export class CommandSystem {
  private selection: SelectionSystem;
  private pathfinding: PathfindingSystem;
  private entityManager: EntityManager;
  private mapManager: MapManager;
  private attackMoveMode: boolean = false;
  private patrolMode: boolean = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private tacticalPause: TacticalPauseManager | null = null;

  constructor(
    selection: SelectionSystem,
    pathfinding: PathfindingSystem,
    entityManager: EntityManager,
    mapManager: MapManager
  ) {
    this.selection = selection;
    this.pathfinding = pathfinding;
    this.entityManager = entityManager;
    this.mapManager = mapManager;

    EventBus.on('input-pointer-up', this.onInputUp3D, this);
    EventBus.on('input-pointer-down', this.onInputDown3D, this);
    EventBus.on('request-path', this.handlePathRequest, this);
    EventBus.on('command-stop', this.handleStopCommand, this);

    // Keyboard: Escape cancels attack-move / patrol mode
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.attackMoveMode) {
          this.attackMoveMode = false;
          EventBus.emit('attack-move-cursor', { active: false });
        }
        if (this.patrolMode) {
          this.patrolMode = false;
          EventBus.emit('patrol-mode-cursor', { active: false });
        }
      }
    };
    document.addEventListener('keydown', this.keyHandler);

    // Listen for events from HotkeyGrid
    EventBus.on('attack-move-cursor', this.onAttackMoveCursor, this);
    EventBus.on('command-hold', this.handleHoldCommand, this);
    EventBus.on('patrol-mode-cursor', this.onPatrolModeCursor, this);
    EventBus.on('command-explore', this.handleExploreCommand, this);
    EventBus.on('command-explore-resume', this.handleExploreResume, this);
  }

  setTacticalPause(manager: TacticalPauseManager): void {
    this.tacticalPause = manager;
  }

  /** Called each frame to advance patrol/explore behaviors. */
  update(_delta: number): void {
    for (const unit of this.entityManager.getUnits('player')) {
      if (!unit.active) continue;
      const mover = unit.getComponent<MoverComponent>('mover');
      if (!mover || mover.isMoving()) continue;
      const combat = unit.getComponent<CombatComponent>('combat');
      if (combat?.target) continue; // busy fighting

      if (mover.behaviorMode === 'patrol' && mover.patrolPoints.length >= 2) {
        // Arrived at current waypoint — advance to next
        mover.patrolIndex = (mover.patrolIndex + 1) % mover.patrolPoints.length;
        const next = mover.patrolPoints[mover.patrolIndex];
        this.moveUnitToward(unit, next.x, next.y);
      } else if (mover.behaviorMode === 'explore') {
        // Arrived at explore destination — pick a new one
        this.sendToRandomUnexplored(unit);
      }
    }
  }

  // ── 3D Input Path ──

  private onInputUp3D(evt: InputEvent & { wasDrag?: boolean }): void {
    if (evt.button !== 2) return; // right-click only
    if (evt.wasDrag) return; // ignore camera panning drags
    if (evt.tileX < 0) return;

    // Rally point: right-click with a producing building selected (no units)
    if (this.selection.selectedUnits.length === 0 && this.selection.selectedBuilding) {
      const building = this.selection.selectedBuilding;
      const prod = building.getComponent<ProductionComponent>('production');
      if (prod && building.team === 'player') {
        building.rallyPoint = { x: evt.tileX, y: evt.tileY };
        this.showCommandIndicator(evt.tileX, evt.tileY, 'move');
        EventBus.emit('rally-point-set', { buildingId: building.entityId, tileX: evt.tileX, tileY: evt.tileY });
        return;
      }
    }

    if (this.selection.selectedUnits.length === 0) return;

    this.handleCommand(evt.tileX, evt.tileY);
  }

  private onInputDown3D(evt: InputEvent): void {
    if (evt.button !== 0) return;
    if (this.selection.selectedUnits.length === 0) return;
    if (evt.tileX < 0) return;

    if (this.patrolMode) {
      this.patrolMode = false;
      EventBus.emit('patrol-mode-cursor', { active: false });
      this.handlePatrolCommand(evt.tileX, evt.tileY);
      return;
    }

    if (!this.attackMoveMode) return;

    this.attackMoveMode = false;
    EventBus.emit('attack-move-cursor', { active: false });
    this.handleAttackMove(evt.tileX, evt.tileY);
  }

  private onAttackMoveCursor = (data: { active: boolean }): void => {
    this.attackMoveMode = data.active;
  };

  private handleHoldCommand({ units }: { units: Unit[] }): void {
    for (const unit of units) {
      const mover = unit.getComponent<MoverComponent>('mover');
      if (mover) {
        mover.stop();
        mover.holdPosition = true;
      }
      const combat = unit.getComponent<CombatComponent>('combat');
      if (combat) combat.setTarget(null);
      const gatherer = unit.getComponent<GathererComponent>('gatherer');
      if (gatherer) gatherer.state = 'idle' as any;
    }
    if (units.length > 0) {
      this.showCommandIndicator(units[0].tileX, units[0].tileY, 'move');
      EventBus.emit('command-issued', { type: 'hold', tileX: units[0].tileX, tileY: units[0].tileY });
    }
  }

  // ── Shared command logic ──

  private handleCommand(tileX: number, tileY: number): void {
    // Check if there's an enemy at the target
    const entitiesAtTile = this.entityManager.getEntitiesAtTile(tileX, tileY);
    const enemy = entitiesAtTile.find((e) => e.team === 'enemy');

    // Determine command type
    let type: 'move' | 'attack' | 'gather' = 'move';
    if (enemy) type = 'attack';
    else if (this.mapManager.isGoldMine(tileX, tileY)) type = 'gather';

    // Queue orders during tactical pause instead of executing
    if (this.tacticalPause?.paused) {
      for (const unit of this.selection.selectedUnits) {
        this.tacticalPause.queueOrder({
          unitId: unit.entityId,
          type,
          targetX: tileX,
          targetY: tileY,
        });
      }
      this.showCommandIndicator(tileX, tileY, type);
      EventBus.emit('command-issued', { type, tileX, tileY });
      return;
    }

    if (enemy) {
      // Attack command
      for (const unit of this.selection.selectedUnits) {
        const combat = unit.getComponent<CombatComponent>('combat');
        if (combat) {
          combat.setTarget(enemy);
          this.moveUnitToward(unit, enemy.tileX, enemy.tileY);
        }
      }
      this.showCommandIndicator(tileX, tileY, 'attack');
      EventBus.emit('command-issued', { type: 'attack', tileX, tileY });
    } else if (this.mapManager.isGoldMine(tileX, tileY)) {
      // Gather command for servitors
      const townHall = this.entityManager.getBuildings('player').find((b) => b.buildingType === 'drop_ship');
      for (const unit of this.selection.selectedUnits) {
        const gatherer = unit.getComponent<GathererComponent>('gatherer');
        if (gatherer && townHall) {
          gatherer.assignMine(tileX, tileY, townHall.tileX, townHall.tileY);
          this.moveUnitToward(unit, tileX, tileY);
        } else {
          this.moveUnitToward(unit, tileX, tileY);
        }
      }
      this.showCommandIndicator(tileX, tileY, 'gather');
      EventBus.emit('command-issued', { type: 'gather', tileX, tileY });
    } else {
      // Move command — spread units around target so they don't stack
      const units = this.selection.selectedUnits;
      const offsets = this.computeFormationOffsets(units.length);
      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        const mover = unit.getComponent<MoverComponent>('mover');
        if (mover) mover.behaviorMode = 'none';
        const combat = unit.getComponent<CombatComponent>('combat');
        if (combat) combat.setTarget(null);
        const gatherer = unit.getComponent<GathererComponent>('gatherer');
        if (gatherer) gatherer.state = 'idle' as any;
        const tx = tileX + offsets[i].dx;
        const ty = tileY + offsets[i].dy;
        this.moveUnitToward(unit, Math.max(0, tx), Math.max(0, ty));
      }
      this.showCommandIndicator(tileX, tileY, 'move');
      EventBus.emit('command-issued', { type: 'move', tileX, tileY });
    }
  }

  private handleAttackMove(tileX: number, tileY: number): void {
    // Queue during tactical pause
    if (this.tacticalPause?.paused) {
      for (const unit of this.selection.selectedUnits) {
        this.tacticalPause.queueOrder({
          unitId: unit.entityId,
          type: 'attack-move',
          targetX: tileX,
          targetY: tileY,
        });
      }
      this.showCommandIndicator(tileX, tileY, 'attack');
      EventBus.emit('command-issued', { type: 'attack-move', tileX, tileY });
      return;
    }

    const units = this.selection.selectedUnits;
    const offsets = this.computeFormationOffsets(units.length);
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const combat = unit.getComponent<CombatComponent>('combat');
      if (combat) combat.setTarget(null);
      const gatherer = unit.getComponent<GathererComponent>('gatherer');
      if (gatherer) gatherer.state = 'idle' as any;
      const mover = unit.getComponent<MoverComponent>('mover');
      if (mover) {
        const tx = tileX + offsets[i].dx;
        const ty = tileY + offsets[i].dy;
        mover.attackMoving = true;
        mover.attackMoveDestination = { x: Math.max(0, tx), y: Math.max(0, ty) };
      }
      this.moveUnitToward(unit, Math.max(0, tileX + offsets[i].dx), Math.max(0, tileY + offsets[i].dy));
    }
    this.showCommandIndicator(tileX, tileY, 'attack');
    EventBus.emit('command-issued', { type: 'attack-move', tileX, tileY });
  }

  private onPatrolModeCursor = (data: { active: boolean }): void => {
    this.patrolMode = data.active;
  };

  private handlePatrolCommand(tileX: number, tileY: number): void {
    // Queue during tactical pause
    if (this.tacticalPause?.paused) {
      for (const unit of this.selection.selectedUnits) {
        this.tacticalPause.queueOrder({
          unitId: unit.entityId,
          type: 'patrol',
          targetX: tileX,
          targetY: tileY,
        });
      }
      this.showCommandIndicator(tileX, tileY, 'move');
      EventBus.emit('command-issued', { type: 'patrol', tileX, tileY });
      return;
    }

    const units = this.selection.selectedUnits;
    for (const unit of units) {
      const mover = unit.getComponent<MoverComponent>('mover');
      if (!mover) continue;
      const combat = unit.getComponent<CombatComponent>('combat');
      if (combat) combat.setTarget(null);
      const gatherer = unit.getComponent<GathererComponent>('gatherer');
      if (gatherer) gatherer.state = 'idle' as any;

      mover.behaviorMode = 'patrol';
      mover.patrolPoints = [
        { x: unit.tileX, y: unit.tileY },
        { x: tileX, y: tileY },
      ];
      mover.patrolIndex = 1; // start by walking to the target
      this.moveUnitToward(unit, tileX, tileY);
    }
    this.showCommandIndicator(tileX, tileY, 'move');
    EventBus.emit('command-issued', { type: 'patrol', tileX, tileY });
  }

  private handleExploreCommand({ units }: { units: Unit[] }): void {
    for (const unit of units) {
      const mover = unit.getComponent<MoverComponent>('mover');
      if (!mover) continue;
      const combat = unit.getComponent<CombatComponent>('combat');
      if (combat) combat.setTarget(null);
      const gatherer = unit.getComponent<GathererComponent>('gatherer');
      if (gatherer) gatherer.state = 'idle' as any;

      mover.behaviorMode = 'explore';
      this.sendToRandomUnexplored(unit);
    }
    if (units.length > 0) {
      EventBus.emit('command-issued', { type: 'explore', tileX: units[0].tileX, tileY: units[0].tileY });
    }
  }

  private handleExploreResume({ unit }: { unit: Unit }): void {
    if (unit.active) this.sendToRandomUnexplored(unit);
  }

  private sendToRandomUnexplored(unit: Unit): void {
    // Pick a random tile on the map, biased toward the edges and areas far from the unit
    const attempts = 15;
    let bestX = -1, bestY = -1, bestDist = -1;
    for (let i = 0; i < attempts; i++) {
      const rx = Math.floor(Math.random() * MAP_WIDTH);
      const ry = Math.floor(Math.random() * MAP_HEIGHT);
      if (!IsoHelper.isInBounds(rx, ry)) continue;
      const dist = Math.abs(rx - unit.tileX) + Math.abs(ry - unit.tileY);
      // Prefer tiles that are far away from the unit
      if (dist > bestDist) {
        bestDist = dist;
        bestX = rx;
        bestY = ry;
      }
    }
    if (bestX >= 0) {
      this.moveUnitToward(unit, bestX, bestY);
    }
  }

  private showCommandIndicator(tileX: number, tileY: number, type: 'move' | 'attack' | 'gather'): void {
    EventBus.emit('command-indicator-3d', { tileX, tileY, type });
  }

  private async moveUnitToward(unit: Unit, targetX: number, targetY: number): Promise<void> {
    const mover = unit.getComponent<MoverComponent>('mover');
    if (!mover) return;

    const path = await this.pathfinding.findPath(unit.tileX, unit.tileY, targetX, targetY);
    if (path && path.length > 1) {
      mover.setPath(path.slice(1)); // skip current position
    }
  }

  private async handlePathRequest({ unit, targetX, targetY }: { unit: Unit; targetX: number; targetY: number }): Promise<void> {
    await this.moveUnitToward(unit, targetX, targetY);
  }

  /** Execute a queued order from tactical pause. */
  executeQueuedOrder(order: { unitId: string; type: string; targetX: number; targetY: number }): void {
    const entity = this.entityManager.getAllEntities().find(e => e.entityId === order.unitId);
    if (!entity || !entity.active || !(entity instanceof Unit)) return;
    const unit = entity as Unit;

    switch (order.type) {
      case 'move':
        this.moveUnitToward(unit, order.targetX, order.targetY);
        break;
      case 'attack': {
        const enemies = this.entityManager.getEntitiesAtTile(order.targetX, order.targetY);
        const enemy = enemies.find(e => e.team === 'enemy');
        const combat = unit.getComponent<CombatComponent>('combat');
        if (combat && enemy) {
          combat.setTarget(enemy);
          this.moveUnitToward(unit, enemy.tileX, enemy.tileY);
        } else {
          this.moveUnitToward(unit, order.targetX, order.targetY);
        }
        break;
      }
      case 'attack-move': {
        const mover = unit.getComponent<MoverComponent>('mover');
        if (mover) {
          mover.attackMoving = true;
          mover.attackMoveDestination = { x: order.targetX, y: order.targetY };
        }
        this.moveUnitToward(unit, order.targetX, order.targetY);
        break;
      }
      case 'patrol': {
        const mover = unit.getComponent<MoverComponent>('mover');
        if (mover) {
          mover.behaviorMode = 'patrol';
          mover.patrolPoints = [
            { x: unit.tileX, y: unit.tileY },
            { x: order.targetX, y: order.targetY },
          ];
          mover.patrolIndex = 1;
          this.moveUnitToward(unit, order.targetX, order.targetY);
        }
        break;
      }
      case 'gather': {
        const gatherer = unit.getComponent<GathererComponent>('gatherer');
        const townHall = this.entityManager.getBuildings('player').find(b => b.buildingType === 'drop_ship');
        if (gatherer && townHall) {
          gatherer.assignMine(order.targetX, order.targetY, townHall.tileX, townHall.tileY);
        }
        this.moveUnitToward(unit, order.targetX, order.targetY);
        break;
      }
    }
  }

  private handleStopCommand({ units }: { units: Unit[] }): void {
    for (const unit of units) {
      const mover = unit.getComponent<MoverComponent>('mover');
      if (mover) mover.stop();
      const combat = unit.getComponent<CombatComponent>('combat');
      if (combat) combat.setTarget(null);
      const gatherer = unit.getComponent<GathererComponent>('gatherer');
      if (gatherer) gatherer.state = 'idle' as any;
    }
  }

  private computeFormationOffsets(count: number): { dx: number; dy: number }[] {
    if (count <= 1) return [{ dx: 0, dy: 0 }];
    const offsets: { dx: number; dy: number }[] = [{ dx: 0, dy: 0 }];
    // Spiral out from center
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (let ring = 1; offsets.length < count; ring++) {
      for (const [dx, dy] of dirs) {
        if (offsets.length >= count) break;
        offsets.push({ dx: dx * ring, dy: dy * ring });
      }
    }
    return offsets;
  }

  destroy(): void {
    EventBus.off('input-pointer-up', this.onInputUp3D, this);
    EventBus.off('input-pointer-down', this.onInputDown3D, this);
    EventBus.off('request-path', this.handlePathRequest, this);
    EventBus.off('command-stop', this.handleStopCommand, this);
    EventBus.off('attack-move-cursor', this.onAttackMoveCursor, this);
    EventBus.off('command-hold', this.handleHoldCommand, this);
    EventBus.off('patrol-mode-cursor', this.onPatrolModeCursor, this);
    EventBus.off('command-explore', this.handleExploreCommand, this);
    EventBus.off('command-explore-resume', this.handleExploreResume, this);
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }
}
