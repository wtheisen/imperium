import { initPlayerState } from '../state/PlayerState';
import { GameSceneInterface, getSceneManager } from './SceneManager';

/**
 * BootScene — initializes player state and transitions to mission select.
 * Phaser texture generation removed — 3D meshes are created by EntityMeshFactory.
 */
export class BootScene implements GameSceneInterface {
  id = 'BootScene';

  create(): void {
    initPlayerState();
    getSceneManager().start('MissionSelectScene');
  }
}
