import { Component } from '../entities/Entity';

/**
 * SelectionRingComponent is now a no-op stub.
 * Selection highlighting is handled by EntityRenderer.setSelected() in 3D.
 */
export class SelectionRingComponent implements Component {
  update(_delta: number): void {
    // No-op
  }

  destroy(): void {
    // No-op
  }
}
