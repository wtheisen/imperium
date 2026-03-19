export type CardType = 'unit' | 'building' | 'ordnance' | 'equipment';

export interface WargearStatBoost {
  stat: 'damage' | 'hp' | 'speed' | 'range' | 'armor' | 'vision';
  value: number;
  mode: 'additive' | 'multiplicative';
}

export interface WargearPassive {
  id: string;   // 'stun_on_hit' | 'block_chance' | 'armor_debuff_aura' | 'damage_shield'
  params: Record<string, number>;
}

export interface WargearAbility {
  id: string;        // 'jump_pack_leap' | 'frag_grenade_throw' | 'reductor_heal'
  name: string;
  hotkey: string;    // 'E' or 'R'
  cooldown: number;  // ms
  color: number;
  params: Record<string, number>;
}

export interface WargearData {
  statBoosts?: WargearStatBoost[];
  passives?: WargearPassive[];
  ability?: WargearAbility;     // max 1 ability per wargear card
}

export type CardFaction = 'adeptus_astartes' | 'astra_militarum' | 'orks' | 'adeptus_mechanicus' | 'neutral';

export interface Card {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  description: string;
  faction?: CardFaction;
  // For unit/building cards
  entityType?: string;
  texture?: string;
  // For ordnance
  ordnanceEffect?: string;
  ordnanceRadius?: number;
  ordnanceValue?: number;
  // For buildings
  tileWidth?: number;
  tileHeight?: number;
  // Single-use (consumed on play, removed from game)
  singleUse?: boolean;
  // For equipment cards
  equipEffect?: string;       // 'damage_boost' | 'hp_boost' | 'speed_boost' | 'range_boost'
  equipValue?: number;
  equipFilter?: string;       // unit type restriction (omit = any unit), comma-separated for multiple
  // Wargear data (rich equipment system)
  wargear?: WargearData;
}
