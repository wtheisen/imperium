interface PendingTimer {
  remainingMs: number;
  callback: () => void;
}

/**
 * Simple timer system replacing Phaser's scene.time.delayedCall().
 * Call update(delta) each frame from the game loop.
 */
export class TimerManager {
  private static instance: TimerManager;
  private timers: PendingTimer[] = [];

  static get(): TimerManager {
    if (!TimerManager.instance) {
      TimerManager.instance = new TimerManager();
    }
    return TimerManager.instance;
  }

  schedule(delayMs: number, callback: () => void): void {
    this.timers.push({ remainingMs: delayMs, callback });
  }

  update(delta: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].remainingMs -= delta;
      if (this.timers[i].remainingMs <= 0) {
        const timer = this.timers[i];
        this.timers.splice(i, 1);
        timer.callback();
      }
    }
  }

  clear(): void {
    this.timers = [];
  }
}
