import { EventBus } from '../EventBus';
import { FogState } from './FogOfWarSystem';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';
import { EnemyCampDefinition, POIDefinition } from '../missions/MissionDefinition';

export interface RevealFeature {
  tileX: number;
  tileY: number;
  type: 'enemy_camp' | 'gold_mine' | 'poi' | 'pack';
}

const REVEAL_CONFIG: Record<RevealFeature['type'], { text: string; color: string; pingColor: [number, number, number] }> = {
  enemy_camp: { text: 'ENEMY CAMP DETECTED', color: '#c43030', pingColor: [220, 60, 60] },
  gold_mine:  { text: 'GOLD DEPOSIT FOUND', color: '#c8982a', pingColor: [200, 152, 42] },
  poi:        { text: 'POINT OF INTEREST LOCATED', color: '#5599ff', pingColor: [85, 153, 255] },
  pack:       { text: 'SUPPLY CACHE LOCATED', color: '#50b0b0', pingColor: [80, 176, 176] },
};

/**
 * ScoutRevealSystem — fires alerts when fog of war reveals key features
 * (enemy camps, gold mines, POIs, packs) for the first time.
 */
export class ScoutRevealSystem {
  private revealedKeys: Set<string> = new Set();
  private features: RevealFeature[] = [];

  constructor(
    enemyCamps: EnemyCampDefinition[],
    mines: { tileX: number; tileY: number }[],
    pois: POIDefinition[],
    packs: { tileX: number; tileY: number }[],
  ) {
    for (const camp of enemyCamps) {
      this.features.push({ tileX: camp.tileX, tileY: camp.tileY, type: 'enemy_camp' });
    }
    for (const mine of mines) {
      this.features.push({ tileX: mine.tileX, tileY: mine.tileY, type: 'gold_mine' });
    }
    for (const poi of pois) {
      this.features.push({ tileX: poi.tileX, tileY: poi.tileY, type: 'poi' });
    }
    for (const pack of packs) {
      this.features.push({ tileX: pack.tileX, tileY: pack.tileY, type: 'pack' });
    }

    EventBus.on('fog-updated', this.onFogUpdated, this);
  }

  private onFogUpdated = (fogGrid: FogState[][]): void => {
    for (const feature of this.features) {
      const key = `${feature.tileX},${feature.tileY}`;
      if (this.revealedKeys.has(key)) continue;

      const { tileX, tileY } = feature;
      if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) continue;
      if (fogGrid[tileY]?.[tileX] !== FogState.VISIBLE) continue;

      this.revealedKeys.add(key);
      const config = REVEAL_CONFIG[feature.type];

      EventBus.emit('minimap-ping', { tileX, tileY, color: config.pingColor, duration: 3000 });
      EventBus.emit('scout-alert', { text: config.text, color: config.color });
    }
  };

  destroy(): void {
    EventBus.off('fog-updated', this.onFogUpdated, this);
    this.revealedKeys.clear();
    this.features = [];
  }
}
