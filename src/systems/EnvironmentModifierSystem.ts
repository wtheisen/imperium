import { EnvironmentModifier } from '../missions/MissionDefinition';

export interface EnvironmentEffects {
  fogRevealMult: number;      // dense_fog = 0.5, night_raid = 0.6
  enemySpeedMult: number;     // ork_frenzy = 1.3
  noSupplyDrops: boolean;     // supply_shortage
  enemyHpMult: number;        // armored_advance = 1.2, elite_only = 2.0
  playerAttackBonus: number;  // night_raid = +1

  // New modifier flags/multipliers
  ironRain: boolean;              // periodic random artillery strikes
  toxicAtmosphere: boolean;       // DOT when not near buildings
  ambushSpawns: boolean;          // enemies spawn behind player units
  bloodTithe: boolean;            // gold on kills, lose gold on player deaths
  killzone: boolean;              // no healing/repairs
  eliteOnly: boolean;             // fewer but tougher enemies
  enemyCountMult: number;         // elite_only = 0.5
  enemyDamageMult: number;        // elite_only = 2.0
  enemyBuildingHpMult: number;    // reinforced_walls = 2.0
  ordnanceCostMult: number;       // warp_interference = 2.0
  playerDeploySpeedMult: number;  // rapid_deployment = 1.5
  playerSpawnHpMult: number;      // rapid_deployment = 0.75
  extraPackSpawns: number;        // scrapyard = 3
  goldMineCountMult: number;      // scrapyard = 0.5
}

const MODIFIER_EFFECTS: Record<EnvironmentModifier, Partial<EnvironmentEffects>> = {
  dense_fog: { fogRevealMult: 0.5 },
  ork_frenzy: { enemySpeedMult: 1.3 },
  supply_shortage: { noSupplyDrops: true },
  armored_advance: { enemyHpMult: 1.2 },
  night_raid: { fogRevealMult: 0.6, playerAttackBonus: 1 },

  // Full active mutators
  iron_rain: { ironRain: true },
  toxic_atmosphere: { toxicAtmosphere: true },
  ambush_spawns: { ambushSpawns: true },
  blood_tithe: { bloodTithe: true },
  killzone: { killzone: true },
  elite_only: { eliteOnly: true, enemyHpMult: 2.0, enemyCountMult: 0.5, enemyDamageMult: 2.0 },

  // Stub mutators (numeric only)
  scrapyard: { extraPackSpawns: 3, goldMineCountMult: 0.5 },
  reinforced_walls: { enemyBuildingHpMult: 2.0 },
  warp_interference: { ordnanceCostMult: 2.0 },
  rapid_deployment: { playerDeploySpeedMult: 1.5, playerSpawnHpMult: 0.75 },
};

const DEFAULTS: EnvironmentEffects = {
  fogRevealMult: 1.0,
  enemySpeedMult: 1.0,
  noSupplyDrops: false,
  enemyHpMult: 1.0,
  playerAttackBonus: 0,

  ironRain: false,
  toxicAtmosphere: false,
  ambushSpawns: false,
  bloodTithe: false,
  killzone: false,
  eliteOnly: false,
  enemyCountMult: 1.0,
  enemyDamageMult: 1.0,
  enemyBuildingHpMult: 1.0,
  ordnanceCostMult: 1.0,
  playerDeploySpeedMult: 1.0,
  playerSpawnHpMult: 1.0,
  extraPackSpawns: 0,
  goldMineCountMult: 1.0,
};

export function resolveEnvironmentModifiers(modifiers?: EnvironmentModifier[]): EnvironmentEffects {
  if (!modifiers || modifiers.length === 0) return { ...DEFAULTS };

  const result = { ...DEFAULTS };
  for (const mod of modifiers) {
    const fx = MODIFIER_EFFECTS[mod];
    if (!fx) continue;
    // Multiplicative fields
    if (fx.fogRevealMult !== undefined) result.fogRevealMult *= fx.fogRevealMult;
    if (fx.enemySpeedMult !== undefined) result.enemySpeedMult *= fx.enemySpeedMult;
    if (fx.enemyHpMult !== undefined) result.enemyHpMult *= fx.enemyHpMult;
    if (fx.enemyCountMult !== undefined) result.enemyCountMult *= fx.enemyCountMult;
    if (fx.enemyDamageMult !== undefined) result.enemyDamageMult *= fx.enemyDamageMult;
    if (fx.enemyBuildingHpMult !== undefined) result.enemyBuildingHpMult *= fx.enemyBuildingHpMult;
    if (fx.ordnanceCostMult !== undefined) result.ordnanceCostMult *= fx.ordnanceCostMult;
    if (fx.playerDeploySpeedMult !== undefined) result.playerDeploySpeedMult *= fx.playerDeploySpeedMult;
    if (fx.playerSpawnHpMult !== undefined) result.playerSpawnHpMult *= fx.playerSpawnHpMult;
    if (fx.goldMineCountMult !== undefined) result.goldMineCountMult *= fx.goldMineCountMult;
    // Additive fields
    if (fx.playerAttackBonus !== undefined) result.playerAttackBonus += fx.playerAttackBonus;
    if (fx.extraPackSpawns !== undefined) result.extraPackSpawns += fx.extraPackSpawns;
    // Boolean flags (OR)
    if (fx.noSupplyDrops) result.noSupplyDrops = true;
    if (fx.ironRain) result.ironRain = true;
    if (fx.toxicAtmosphere) result.toxicAtmosphere = true;
    if (fx.ambushSpawns) result.ambushSpawns = true;
    if (fx.bloodTithe) result.bloodTithe = true;
    if (fx.killzone) result.killzone = true;
    if (fx.eliteOnly) result.eliteOnly = true;
  }
  return result;
}

/** Metadata for each modifier, used by UI */
export interface ModifierMeta {
  id: EnvironmentModifier;
  name: string;
  description: string;
  icon: string; // emoji/symbol for compact display
}

export const MODIFIER_META: ModifierMeta[] = [
  { id: 'dense_fog', name: 'Dense Fog', description: 'Fog of war reveal range halved.', icon: '🌫' },
  { id: 'ork_frenzy', name: 'Ork Frenzy', description: 'Enemy movement speed +30%.', icon: '💀' },
  { id: 'supply_shortage', name: 'Supply Shortage', description: 'No supply drops during mission.', icon: '📦' },
  { id: 'armored_advance', name: 'Armored Advance', description: 'Enemy HP +20%.', icon: '🛡' },
  { id: 'night_raid', name: 'Night Raid', description: 'Reduced visibility, player attack +1.', icon: '🌙' },
  { id: 'iron_rain', name: 'Iron Rain', description: 'Periodic artillery strikes hit random map areas.', icon: '💥' },
  { id: 'toxic_atmosphere', name: 'Toxic Atmosphere', description: 'Units take damage over time when away from buildings.', icon: '☣' },
  { id: 'ambush_spawns', name: 'Ambush Spawns', description: 'Enemies periodically warp in behind your forces.', icon: '👁' },
  { id: 'blood_tithe', name: 'Blood Tithe', description: 'Bonus gold on kills, lose gold when your units die.', icon: '🩸' },
  { id: 'killzone', name: 'Killzone', description: 'All healing and repairs are disabled.', icon: '✖' },
  { id: 'elite_only', name: 'Elite Only', description: 'Half the enemies, but 2× HP and damage.', icon: '⚔' },
  { id: 'scrapyard', name: 'Scrapyard', description: 'Extra card packs on map, fewer gold mines.', icon: '🔧' },
  { id: 'reinforced_walls', name: 'Reinforced Walls', description: 'Enemy buildings have 2× HP.', icon: '🏰' },
  { id: 'warp_interference', name: 'Warp Interference', description: 'Ordnance cards cost double.', icon: '⚡' },
  { id: 'rapid_deployment', name: 'Rapid Deployment', description: 'Units deploy faster but with 25% less HP.', icon: '🚀' },
];
