export interface DifficultyModifier {
  id: string;
  name: string;
  description: string;
  icon: string;
  effects: {
    enemyHpMult?: number;
    enemyDamageMult?: number;
    enemySpeedMult?: number;
    spawnRateMult?: number;
    playerHpMult?: number;
    goldMult?: number;
    noSupplyDrops?: boolean;
  };
  reqPointsBonus: number;
}

export const MODIFIERS: DifficultyModifier[] = [
  { id: 'iron_skull', name: 'Iron Skull', description: 'Enemies have +25% HP', icon: '\u2620', effects: { enemyHpMult: 1.25 }, reqPointsBonus: 25 },
  { id: 'wrath', name: 'Wrath of the Xenos', description: 'Enemies deal +25% damage', icon: '\u2694', effects: { enemyDamageMult: 1.25 }, reqPointsBonus: 25 },
  { id: 'tide', name: 'Green Tide', description: 'Enemy spawns 40% faster', icon: '\u2B06', effects: { spawnRateMult: 0.6 }, reqPointsBonus: 30 },
  { id: 'austerity', name: 'Austerity Decree', description: '25% less gold income', icon: '\u26C4', effects: { goldMult: 0.75 }, reqPointsBonus: 20 },
  { id: 'no_resupply', name: 'No Resupply', description: 'No supply drops', icon: '\u274C', effects: { noSupplyDrops: true }, reqPointsBonus: 30 },
  { id: 'glass', name: 'Glass Cannon', description: 'Player units have 25% less HP', icon: '\u2764', effects: { playerHpMult: 0.75 }, reqPointsBonus: 25 },
];

/** Get merged effects from a list of active modifier IDs. */
export function getMergedEffects(activeIds: string[]): DifficultyModifier['effects'] {
  const merged: DifficultyModifier['effects'] = {};
  for (const id of activeIds) {
    const mod = MODIFIERS.find(m => m.id === id);
    if (!mod) continue;
    const e = mod.effects;
    if (e.enemyHpMult) merged.enemyHpMult = (merged.enemyHpMult ?? 1) * e.enemyHpMult;
    if (e.enemyDamageMult) merged.enemyDamageMult = (merged.enemyDamageMult ?? 1) * e.enemyDamageMult;
    if (e.enemySpeedMult) merged.enemySpeedMult = (merged.enemySpeedMult ?? 1) * e.enemySpeedMult;
    if (e.spawnRateMult) merged.spawnRateMult = (merged.spawnRateMult ?? 1) * e.spawnRateMult;
    if (e.playerHpMult) merged.playerHpMult = (merged.playerHpMult ?? 1) * e.playerHpMult;
    if (e.goldMult) merged.goldMult = (merged.goldMult ?? 1) * e.goldMult;
    if (e.noSupplyDrops) merged.noSupplyDrops = true;
  }
  return merged;
}

/** Cached accessor — modifiers don't change during a mission. */
let _cachedEffects: DifficultyModifier['effects'] | null = null;
let _cachedModifierKey: string | null = null;

export function getCachedMergedEffects(getActiveModifiers: () => string[]): DifficultyModifier['effects'] {
  const modifiers = getActiveModifiers();
  const key = JSON.stringify(modifiers);
  if (_cachedEffects && _cachedModifierKey === key) return _cachedEffects;
  _cachedEffects = getMergedEffects(modifiers);
  _cachedModifierKey = key;
  return _cachedEffects;
}

/** Get total bonus RP from active modifier IDs. */
export function getModifierBonus(activeIds: string[]): number {
  let total = 0;
  for (const id of activeIds) {
    const mod = MODIFIERS.find(m => m.id === id);
    if (mod) total += mod.reqPointsBonus;
  }
  return total;
}
