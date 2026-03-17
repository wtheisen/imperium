import { EnvironmentModifier } from '../missions/MissionDefinition';

export interface EnvironmentEffects {
  fogRevealMult: number;      // dense_fog = 0.5, night_raid = 0.6
  enemySpeedMult: number;     // ork_frenzy = 1.3
  noSupplyDrops: boolean;     // supply_shortage
  enemyHpMult: number;        // armored_advance = 1.2
  playerAttackBonus: number;  // night_raid = +1
}

const MODIFIER_EFFECTS: Record<EnvironmentModifier, Partial<EnvironmentEffects>> = {
  dense_fog: { fogRevealMult: 0.5 },
  ork_frenzy: { enemySpeedMult: 1.3 },
  supply_shortage: { noSupplyDrops: true },
  armored_advance: { enemyHpMult: 1.2 },
  night_raid: { fogRevealMult: 0.6, playerAttackBonus: 1 },
};

const DEFAULTS: EnvironmentEffects = {
  fogRevealMult: 1.0,
  enemySpeedMult: 1.0,
  noSupplyDrops: false,
  enemyHpMult: 1.0,
  playerAttackBonus: 0,
};

export function resolveEnvironmentModifiers(modifiers?: EnvironmentModifier[]): EnvironmentEffects {
  if (!modifiers || modifiers.length === 0) return { ...DEFAULTS };

  const result = { ...DEFAULTS };
  for (const mod of modifiers) {
    const fx = MODIFIER_EFFECTS[mod];
    if (!fx) continue;
    if (fx.fogRevealMult !== undefined) result.fogRevealMult *= fx.fogRevealMult;
    if (fx.enemySpeedMult !== undefined) result.enemySpeedMult *= fx.enemySpeedMult;
    if (fx.noSupplyDrops) result.noSupplyDrops = true;
    if (fx.enemyHpMult !== undefined) result.enemyHpMult *= fx.enemyHpMult;
    if (fx.playerAttackBonus !== undefined) result.playerAttackBonus += fx.playerAttackBonus;
  }
  return result;
}
