import { EventBus } from '../EventBus';
import { TimerManager } from '../utils/TimerManager';

/**
 * Projectile is now pure data + timer. The 3D visual is handled by VFXRenderer
 * via the 'projectile-spawned' event.
 */
export class Projectile {
  constructor(
    fromTileX: number,
    fromTileY: number,
    toTileX: number,
    toTileY: number,
    onHit: () => void,
    duration: number = 300
  ) {
    // Notify 3D renderer of projectile visual
    EventBus.emit('projectile-spawned', { fromTileX, fromTileY, toTileX, toTileY, duration });

    // Schedule the hit callback
    TimerManager.get().schedule(duration, onHit);
  }
}
