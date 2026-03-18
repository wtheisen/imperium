import { getPlayerState } from '../state/PlayerState';
import { getShipRoom } from './ShipDatabase';
import { SHIP_ORDNANCE_BASE_SLOTS, SHIP_ORDNANCE_BASE_CHARGES } from '../config';

/**
 * Returns the current upgrade level for a given ship room.
 * Returns 0 if the room has not been upgraded.
 */
export function getShipUpgradeLevel(roomId: string): number {
  return getPlayerState().shipUpgrades[roomId] ?? 0;
}

/**
 * Returns the hand size bonus from the Logistics Bay.
 */
export function getHandSizeBonus(): number {
  const level = getShipUpgradeLevel('logistics_bay');
  if (level === 0) return 0;
  const room = getShipRoom('logistics_bay');
  if (!room) return 0;
  const tier = room.tiers[level - 1];
  return tier?.effects.handSizeBonus ?? 0;
}

/**
 * Returns the supply drop interval multiplier.
 * E.g. 0.7 means supply drops arrive 30% faster.
 */
export function getSupplyDropInterval(): number {
  const level = getShipUpgradeLevel('astropathic_choir');
  if (level === 0) return 1.0;
  const room = getShipRoom('astropathic_choir');
  if (!room) return 1.0;
  const tier = room.tiers[level - 1];
  const reduction = tier?.effects.supplyDropReduction ?? 0;
  return 1.0 - reduction;
}

/**
 * Returns the passive income rate in gold per 10 seconds from the Enginarium.
 */
export function getPassiveIncomeRate(): number {
  const level = getShipUpgradeLevel('enginarium');
  if (level === 0) return 0;
  const room = getShipRoom('enginarium');
  if (!room) return 0;
  const tier = room.tiers[level - 1];
  return tier?.effects.passiveIncomeRate ?? 0;
}

/**
 * Returns the starting vision bonus from the Augur Array.
 */
export function getStartingVisionBonus(): number {
  const level = getShipUpgradeLevel('augur_array');
  if (level === 0) return 0;
  const room = getShipRoom('augur_array');
  if (!room) return 0;
  const tier = room.tiers[level - 1];
  return tier?.effects.startingVisionBonus ?? 0;
}

// Augur Array - suppressing fire at tier 3
export function getSuppressingFireChance(): number {
  return getShipUpgradeLevel('augur_array') >= 3 ? 0.15 : 0;
}

// Armorium
export function getMeleeAttackSpeedBonus(): number {
  return getShipUpgradeLevel('armorium') >= 1 ? 0.10 : 0;
}
export function getBuildingAttackSpeedBonus(): number {
  return getShipUpgradeLevel('armorium') >= 2 ? 0.20 : 0;
}
export function getUnitArmorBonus(): number {
  return getShipUpgradeLevel('armorium') >= 3 ? 1 : 0;
}

// Apothecarium
export function getPassiveHealRate(): number {
  const level = getShipUpgradeLevel('apothecarium');
  if (level === 0) return 0;
  if (level >= 2) return 0.2;
  return 0.1;
}
export function getBuildingHpBonus(): number {
  return getShipUpgradeLevel('apothecarium') >= 3 ? 0.30 : 0;
}

// Strategium
export function getGoldPerKill(): number {
  return getShipUpgradeLevel('strategium') >= 1 ? 1 : 0;
}
export function getGoldPerCardPlayed(): number {
  return getShipUpgradeLevel('strategium') >= 2 ? 1 : 0;
}
export function getObjectiveGoldBonus(): number {
  return getShipUpgradeLevel('strategium') >= 3 ? 0.25 : 0;
}

// Ship ordnance slots & charges
export function getShipOrdnanceSlots(): number {
  const level = getShipUpgradeLevel('astropathic_choir');
  if (level === 0) return SHIP_ORDNANCE_BASE_SLOTS;
  const room = getShipRoom('astropathic_choir');
  if (!room) return SHIP_ORDNANCE_BASE_SLOTS;
  const tier = room.tiers[level - 1];
  return SHIP_ORDNANCE_BASE_SLOTS + (tier?.effects.ordnanceSlotBonus ?? 0);
}

export function getShipOrdnanceCharges(): number {
  const level = getShipUpgradeLevel('astropathic_choir');
  if (level === 0) return SHIP_ORDNANCE_BASE_CHARGES;
  const room = getShipRoom('astropathic_choir');
  if (!room) return SHIP_ORDNANCE_BASE_CHARGES;
  const tier = room.tiers[level - 1];
  return SHIP_ORDNANCE_BASE_CHARGES + (tier?.effects.ordnanceChargeBonus ?? 0);
}

// Augur Array - scanner level for drop site auspex
export function getScannerLevel(): number {
  return getShipUpgradeLevel('augur_array');
}

// Reclusiam
export function getGatherSpeedBonus(): number {
  return getShipUpgradeLevel('reclusiam') >= 1 ? 0.30 : 0;
}
export function getSpawnInvulnMs(): number {
  return getShipUpgradeLevel('reclusiam') >= 2 ? 2000 : 0;
}
export function getCombinedArmsDmg(): number {
  return getShipUpgradeLevel('reclusiam') >= 3 ? 2 : 0;
}
