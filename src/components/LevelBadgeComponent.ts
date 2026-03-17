import { Component } from '../entities/Entity';
import { Unit } from '../entities/Unit';
import { getUnlockedNodesForUnit } from '../state/TechTree';

/**
 * LevelBadgeComponent tracks the unit's tech level.
 * Visual rendering is delegated to the 3D renderer / CSS overlay.
 */
export class LevelBadgeComponent implements Component {
  private unit: Unit;
  public level: number;

  constructor(unit: Unit) {
    this.unit = unit;
    this.level = getUnlockedNodesForUnit(unit.unitType).length;
  }

  update(_delta: number): void {
    // No-op — visual handled by 3D renderer
  }

  destroy(): void {
    // No-op
  }
}
