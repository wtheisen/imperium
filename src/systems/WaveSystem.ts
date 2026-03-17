import { EventBus } from '../EventBus';
import { PREP_DURATION_MS, MAP_WIDTH, MAP_HEIGHT } from '../config';
import { EntityManager } from './EntityManager';
import { WaveComposition, WaveDefinition } from '../ai/WaveComposition';

export type WaveState = 'PREP' | 'ACTIVE' | 'VICTORY';

export class WaveSystem {
  private entityManager: EntityManager;
  public state: WaveState = 'PREP';
  public waveNumber: number = 0;
  public prepTimer: number = PREP_DURATION_MS;
  private enemyCount: number = 0;

  constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;

    EventBus.on('entity-died', this.onEntityDied, this);
  }

  private onEntityDied({ entity }: { entity: any }): void {
    if (entity.team === 'enemy') {
      this.enemyCount--;
      if (this.enemyCount <= 0 && this.state === 'ACTIVE') {
        this.state = 'VICTORY';
        const reward = 20 + this.waveNumber * 5;
        EventBus.emit('wave-completed', { waveNumber: this.waveNumber, reward });

        // Transition to PREP after short delay
        setTimeout(() => {
          this.state = 'PREP';
          this.prepTimer = PREP_DURATION_MS;
        }, 2000);
      }
    }
  }

  startWave(): void {
    this.waveNumber++;
    this.state = 'ACTIVE';
    const waveDef = WaveComposition.getWave(this.waveNumber);
    this.spawnWave(waveDef);
    EventBus.emit('wave-started', { waveNumber: this.waveNumber });
  }

  private spawnWave(waveDef: WaveDefinition): void {
    this.enemyCount = 0;

    for (const group of waveDef.groups) {
      for (let i = 0; i < group.count; i++) {
        // Spawn from map edges
        const edge = Math.floor(Math.random() * 4);
        let spawnX: number, spawnY: number;
        switch (edge) {
          case 0: spawnX = 0; spawnY = Math.floor(Math.random() * MAP_HEIGHT); break;
          case 1: spawnX = MAP_WIDTH - 1; spawnY = Math.floor(Math.random() * MAP_HEIGHT); break;
          case 2: spawnX = Math.floor(Math.random() * MAP_WIDTH); spawnY = 0; break;
          default: spawnX = Math.floor(Math.random() * MAP_WIDTH); spawnY = MAP_HEIGHT - 1; break;
        }

        this.entityManager.spawnUnit(
          spawnX,
          spawnY,
          group.texture,
          group.unitType,
          group.stats,
          'enemy'
        );
        this.enemyCount++;
      }
    }
  }

  update(delta: number): void {
    if (this.state === 'PREP') {
      this.prepTimer -= delta;
      if (this.prepTimer <= 0) {
        this.startWave();
      }
    }
  }

  destroy(): void {
    EventBus.off('entity-died', this.onEntityDied, this);
  }
}
