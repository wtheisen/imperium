import { SpriteAnimName, SpriteAnimDef, SpriteSheetConfig } from './SpriteSheetConfig';

/**
 * Per-entity animation state machine.
 * Tracks current animation, frame index, and elapsed time.
 */
export class SpriteAnimator {
  private currentAnim: SpriteAnimName = 'idle';
  private frameIndex: number = 0;
  private elapsed: number = 0;
  private finished: boolean = false;

  /** Start offset for staggering idle animations in squads. */
  private staggerOffset: number = 0;

  constructor(staggerMs: number = 0) {
    this.staggerOffset = staggerMs;
    this.elapsed = staggerMs;
  }

  /** Switch to a new animation. Resets frame if changing to a different anim. */
  play(anim: SpriteAnimName): void {
    if (anim === this.currentAnim) return;
    this.currentAnim = anim;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.finished = false;
  }

  /** Get the current animation name. */
  getCurrentAnim(): SpriteAnimName {
    return this.currentAnim;
  }

  /** Advance the frame timer. */
  update(deltaMs: number, config: SpriteSheetConfig): void {
    if (this.finished) return;

    const animDef = config.animations[this.currentAnim];
    if (!animDef) return;

    this.elapsed += deltaMs;

    while (this.elapsed >= animDef.frameDuration) {
      this.elapsed -= animDef.frameDuration;
      this.frameIndex++;

      if (this.frameIndex >= animDef.frameCount) {
        if (animDef.loop) {
          this.frameIndex = 0;
        } else {
          this.frameIndex = animDef.frameCount - 1;
          this.finished = true;
          break;
        }
      }
    }
  }

  /**
   * Returns UV offset for the current frame in the given direction.
   * Atlas layout: rows = directions (0-7), columns = animation frames.
   */
  getUVOffset(direction: number, config: SpriteSheetConfig): { offsetX: number; offsetY: number } {
    const animDef = config.animations[this.currentAnim];
    const col = animDef.startCol + this.frameIndex;
    const row = direction;

    // UV origin is bottom-left in Three.js; row 0 is at the top of the image.
    const offsetX = col / config.columns;
    const offsetY = 1 - (row + 1) / config.rows;

    return { offsetX, offsetY };
  }

  /** True for non-looping animations (death) that have completed. */
  isFinished(): boolean {
    return this.finished;
  }
}
