import { ShipRoomDefinition } from './ShipTypes';

export const SHIP_ROOMS: ShipRoomDefinition[] = [
  {
    id: 'logistics_bay',
    name: 'Logistics Bay',
    description: 'Expands operational capacity, increasing the number of cards you can hold in hand.',
    tiers: [
      { level: 1, cost: 50,  description: '+1 Hand Size',  effects: { handSizeBonus: 1 } },
      { level: 2, cost: 100, description: '+2 Hand Size',  effects: { handSizeBonus: 2 } },
      { level: 3, cost: 200, description: '+3 Hand Size',  effects: { handSizeBonus: 3 } },
    ],
  },
  {
    id: 'astropathic_choir',
    name: 'Astropathic Choir',
    description: 'Improves warp-communication, reducing the interval between supply drops.',
    tiers: [
      { level: 1, cost: 60,  description: '-10% Supply Drop Interval', effects: { supplyDropReduction: 0.10 } },
      { level: 2, cost: 120, description: '-20% Supply Drop Interval, +1 Ordnance Slot', effects: { supplyDropReduction: 0.20, ordnanceSlotBonus: 1 } },
      { level: 3, cost: 200, description: '-30% Supply Drop Interval, +2 Ordnance Slots, +1 Charge', effects: { supplyDropReduction: 0.30, ordnanceSlotBonus: 2, ordnanceChargeBonus: 1 } },
    ],
  },
  {
    id: 'augur_array',
    name: 'Augur Array',
    description: 'Enhanced scanning arrays grant additional vision range. Higher tiers reveal points of interest and supply caches on the auspex map before deployment.',
    tiers: [
      { level: 1, cost: 40,  description: '+1 Starting Vision, Auspex detects PoIs', effects: { startingVisionBonus: 1, scannerLevel: 1 } },
      { level: 2, cost: 80,  description: '+2 Starting Vision, Auspex identifies PoI types', effects: { startingVisionBonus: 2, scannerLevel: 2 } },
      { level: 3, cost: 150, description: '+3 Vision, 15% ranged slow, Auspex detects supply caches', effects: { startingVisionBonus: 3, suppressingFireChance: 0.15, scannerLevel: 3 } },
    ],
  },
  {
    id: 'enginarium',
    name: 'Enginarium',
    description: 'Auxiliary power generators provide a passive requisition income stream.',
    tiers: [
      { level: 1, cost: 50,  description: '+0.5 Gold per 10s', effects: { passiveIncomeRate: 0.5 } },
      { level: 2, cost: 100, description: '+1.0 Gold per 10s', effects: { passiveIncomeRate: 1.0 } },
      { level: 3, cost: 175, description: '+1.5 Gold per 10s', effects: { passiveIncomeRate: 1.5 } },
    ],
  },
  {
    id: 'armorium',
    name: 'Armorium',
    description: 'Houses blessed weapons and wargear. Enhances melee ferocity, turret targeting, and armour plating.',
    tiers: [
      { level: 1, cost: 50,  description: 'Melee units attack 10% faster', effects: { meleeAttackSpeedBonus: 0.10 } },
      { level: 2, cost: 100, description: 'Buildings attack 20% faster', effects: { buildingAttackSpeedBonus: 0.20 } },
      { level: 3, cost: 175, description: 'All units gain +1 Armor', effects: { unitArmorBonus: 1 } },
    ],
  },
  {
    id: 'apothecarium',
    name: 'Apothecarium',
    description: 'The ship\'s medical bay. Narthecium protocols enable field healing and reinforced construction plans.',
    tiers: [
      { level: 1, cost: 40,  description: 'Units heal 1 HP/10s out of combat', effects: { passiveHealRate: 0.1 } },
      { level: 2, cost: 100, description: 'Units heal 1 HP/5s out of combat',  effects: { passiveHealRate: 0.2 } },
      { level: 3, cost: 175, description: 'Buildings gain +30% max HP',        effects: { buildingHpBonus: 0.30 } },
    ],
  },
  {
    id: 'strategium',
    name: 'Strategium',
    description: 'Tactical cogitators optimize resource allocation, tithe collection, and war spoils processing.',
    tiers: [
      { level: 1, cost: 50,  description: '+1 Gold per enemy killed',   effects: { goldPerKill: 1 } },
      { level: 2, cost: 100, description: '+1 Gold per card played',    effects: { goldPerCardPlayed: 1 } },
      { level: 3, cost: 180, description: '+25% Gold from objectives',  effects: { objectiveGoldBonus: 0.25 } },
    ],
  },
  {
    id: 'reclusiam',
    name: 'Reclusiam',
    description: 'The Chaplain\'s sanctum blesses deployment rites, optimizes servitor protocols, and drills combined arms tactics.',
    tiers: [
      { level: 1, cost: 50,  description: 'Servitors gather 30% faster',           effects: { gatherSpeedBonus: 0.30 } },
      { level: 2, cost: 110, description: 'Deployed units gain 2s invulnerability', effects: { spawnInvulnMs: 2000 } },
      { level: 3, cost: 180, description: 'Mixed melee+ranged squads gain +2 dmg',  effects: { combinedArmsDmg: 2 } },
    ],
  },
];

/** Lookup a room definition by its ID */
export function getShipRoom(roomId: string): ShipRoomDefinition | undefined {
  return SHIP_ROOMS.find(r => r.id === roomId);
}
