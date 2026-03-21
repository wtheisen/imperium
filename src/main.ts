import { GameRenderer, setGameRenderer } from './renderer/GameRenderer';
import { EventBus } from './EventBus';
import { SceneManager, setSceneManager } from './scenes/SceneManager';
import { BootScene } from './scenes/BootScene';
import { MissionSelectScene } from './scenes/MissionSelectScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { ShopScene } from './scenes/ShopScene';
import { GameOverScene } from './scenes/GameOverScene';
import { DeckEditScene } from './scenes/DeckEditScene';
import { TechTreeScene } from './scenes/TechTreeScene';
import { DropSiteScene } from './scenes/DropSiteScene';
import { ShipScene } from './scenes/ShipScene';
import { SalvageScene } from './scenes/SalvageScene';
import { TimerManager } from './utils/TimerManager';

// ── Three.js 3D renderer ──
const container = document.getElementById('game-container')!;
const gameRenderer = new GameRenderer(container);
gameRenderer.start();

// Register singleton for systems that need InputBridge / CameraController access
setGameRenderer(gameRenderer);

// When GameScene builds its map, build the 3D tile map
EventBus.on('terrain-ready', (data: any) => {
  gameRenderer.buildTileMap(data.terrainGrid, data.protectedPositions, data.mapType, data.biome);
});

// ── Scene Manager ──
const sceneManager = new SceneManager();
setSceneManager(sceneManager);

// Register all scenes
sceneManager.register('BootScene', new BootScene());
sceneManager.register('MissionSelectScene', new MissionSelectScene());
sceneManager.register('GameScene', new GameScene());
sceneManager.register('UIScene', new UIScene());
sceneManager.register('ShopScene', new ShopScene());
sceneManager.register('GameOverScene', new GameOverScene());
sceneManager.register('DeckEditScene', new DeckEditScene());
sceneManager.register('TechTreeScene', new TechTreeScene());
sceneManager.register('DropSiteScene', new DropSiteScene());
sceneManager.register('ShipScene', new ShipScene());
sceneManager.register('SalvageScene', new SalvageScene());

// ── Main game loop ──
let lastTime = performance.now();

function loop(now: number): void {
  const delta = now - lastTime;
  lastTime = now;

  // Update scene manager (runs active scenes' update methods)
  sceneManager.update(delta);

  // TimerManager is also updated by GameScene.update(),
  // but we update here too for timers that fire outside of GameScene
  // (This is safe — TimerManager.update is idempotent per frame since
  //  GameScene calls it first and timers only fire once)

  requestAnimationFrame(loop);
}

// Start the boot sequence
sceneManager.start('BootScene');
requestAnimationFrame(loop);
