import { EventBus } from '../EventBus';

export interface GameSceneInterface {
  id: string;
  create(data?: any): void;
  update?(delta: number): void;
  shutdown?(): void;
}

/**
 * Simple scene manager replacing Phaser's scene system.
 * Supports multiple concurrent scenes (e.g. GameScene + UIScene overlay).
 */
export class SceneManager {
  private scenes = new Map<string, GameSceneInterface>();
  private activeScenes = new Map<string, GameSceneInterface>();

  register(id: string, scene: GameSceneInterface): void {
    this.scenes.set(id, scene);
  }

  /** Start a scene (stops all others first, then starts this one). */
  start(id: string, data?: any): void {
    // Stop all active scenes
    for (const [activeId, scene] of this.activeScenes) {
      scene.shutdown?.();
      this.activeScenes.delete(activeId);
    }
    // Start the requested scene
    const scene = this.scenes.get(id);
    if (!scene) {
      console.warn(`SceneManager: scene "${id}" not registered`);
      return;
    }
    this.activeScenes.set(id, scene);
    scene.create(data);
  }

  /** Launch a scene alongside existing active scenes (overlay). */
  launch(id: string, data?: any): void {
    if (this.activeScenes.has(id)) return;
    const scene = this.scenes.get(id);
    if (!scene) {
      console.warn(`SceneManager: scene "${id}" not registered`);
      return;
    }
    this.activeScenes.set(id, scene);
    scene.create(data);
  }

  /** Stop a specific scene. */
  stop(id: string): void {
    const scene = this.activeScenes.get(id);
    if (scene) {
      scene.shutdown?.();
      this.activeScenes.delete(id);
    }
  }

  /** Update all active scenes. */
  update(delta: number): void {
    for (const scene of this.activeScenes.values()) {
      scene.update?.(delta);
    }
  }

  /** Check if a scene is active. */
  isActive(id: string): boolean {
    return this.activeScenes.has(id);
  }

  getScene<T extends GameSceneInterface>(id: string): T | undefined {
    return this.scenes.get(id) as T | undefined;
  }
}

/** Singleton scene manager — set from main.ts */
let _sceneManager: SceneManager | null = null;

export function setSceneManager(sm: SceneManager): void {
  _sceneManager = sm;
}

export function getSceneManager(): SceneManager {
  if (!_sceneManager) throw new Error('SceneManager not initialized');
  return _sceneManager;
}
