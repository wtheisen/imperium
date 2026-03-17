import { EventBus } from '../EventBus';
import { ObjectiveDefinition } from './MissionDefinition';

/**
 * ObjectiveMarker is now pure data. 3D visuals are handled by VFXRenderer
 * via 'objective-marker-3d' event.
 */
export class ObjectiveMarker {
  private objective: ObjectiveDefinition;

  constructor(objective: ObjectiveDefinition) {
    this.objective = objective;
    EventBus.emit('objective-marker-3d', {
      id: objective.id,
      tileX: objective.tileX,
      tileY: objective.tileY,
      type: objective.type,
    });
  }

  update(_delta: number): void {
    // No-op — 3D renderer handles animation
  }

  destroy(): void {
    // No-op — pure data
  }
}
