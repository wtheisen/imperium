export type ShipRoomId = 'logistics_bay' | 'astropathic_choir' | 'augur_array' | 'enginarium' | 'armorium' | 'apothecarium' | 'strategium' | 'reclusiam';

export interface ShipUpgradeTier {
  level: number;
  cost: number;
  description: string;
  effects: Record<string, number>;
}

export interface ShipRoomDefinition {
  id: ShipRoomId;
  name: string;
  description: string;
  tiers: ShipUpgradeTier[];
}
