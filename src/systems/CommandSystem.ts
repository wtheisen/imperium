import { SelectionSystem } from './SelectionSystem';
import { PathfindingSystem } from './PathfindingSystem';
import { EntityManager } from './EntityManager';
import { MapManager } from '../map/MapManager';
import { MoverComponent } from '../components/MoverComponent';
import { CombatComponent } from '../components/CombatComponent';
import { GathererComponent } from '../components/GathererComponent';
import { Unit } from '../entities/Unit';
import { EventBus } from '../EventBus';
import { InputEvent } from '../renderer/InputBridge';

export class CommandSystem {
  private selection: SelectionSystem;
  private pathfinding: PathfindingSystem;
  private entityManager: EntityManager;
  private mapManager: MapManager;

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
    EventBus.on('request-path', this.handlePathRequest, this);
    EventBus.on('command-stop', this.handleStopCommand, this);
  }

  // ── 3D Input Path ──

  private onInputUp3D(evt: InputEvent & { wasDrag?: boolean }): void {
    if (evt.button !== 2) return; // right-click only
    if (evt.wasDrag) return; // ignore camera panning drags
    if (this.selection.selectedUnits.length === 0) return;
    if (evt.tileX < 0) return;

    this.handleCommand(evt.tileX, evt.tileY);
  }

  // ── Shared command logic ──

  private handleCommand(tileX: number, tileY: number): void {
    // Check if there's an enemy at the target
    const entitiesAtTile = this.entityManager.getEntitiesAtTile(tileX, tileY);
    const enemy = entitiesAtTile.find((e) => e.team === 'enemy');

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
    EventBus.off('request-path', this.handlePathRequest, this);
    EventBus.off('command-stop', this.handleStopCommand, this);
  }
}
