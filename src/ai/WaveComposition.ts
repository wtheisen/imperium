import { UnitStats } from '../entities/Unit';

export interface WaveGroup {
  unitType: string;
  texture: string;
  count: number;
  stats: UnitStats;
}

export interface WaveDefinition {
  groups: WaveGroup[];
}

const ENEMY_GRUNT: UnitStats = {
  maxHp: 30,
  speed: 1.5,
  attackDamage: 5,
  attackRange: 1,
  attackCooldown: 1200,
  isRanged: false,
};

const ENEMY_ARCHER: UnitStats = {
  maxHp: 20,
  speed: 1.5,
  attackDamage: 4,
  attackRange: 3,
  attackCooldown: 1500,
  isRanged: true,
};

const ENEMY_BRUTE: UnitStats = {
  maxHp: 80,
  speed: 1,
  attackDamage: 15,
  attackRange: 1,
  attackCooldown: 1500,
  isRanged: false,
};

export class WaveComposition {
  static getWave(waveNumber: number): WaveDefinition {
    const scaleFactor = 1 + (waveNumber - 1) * 0.15;
    const groups: WaveGroup[] = [];

    // Base grunts - always present, scaling count
    const gruntCount = Math.min(3 + waveNumber * 2, 20);
    groups.push({
      unitType: 'enemy_grunt',
      texture: 'unit-enemy',
      count: gruntCount,
      stats: WaveComposition.scaleStats(ENEMY_GRUNT, scaleFactor),
    });

    // Add archers from wave 3+
    if (waveNumber >= 3) {
      const archerCount = Math.min(Math.floor(waveNumber / 2), 8);
      groups.push({
        unitType: 'enemy_archer',
        texture: 'unit-enemy-ranged',
        count: archerCount,
        stats: WaveComposition.scaleStats(ENEMY_ARCHER, scaleFactor),
      });
    }

    // Add brutes from wave 5+
    if (waveNumber >= 5) {
      const bruteCount = Math.min(Math.floor((waveNumber - 3) / 2), 5);
      groups.push({
        unitType: 'enemy_brute',
        texture: 'unit-enemy-brute',
        count: bruteCount,
        stats: WaveComposition.scaleStats(ENEMY_BRUTE, scaleFactor),
      });
    }

    return { groups };
  }

  private static scaleStats(base: UnitStats, factor: number): UnitStats {
    return {
      ...base,
      maxHp: Math.round(base.maxHp * factor),
      attackDamage: Math.round(base.attackDamage * factor),
    };
  }
}
