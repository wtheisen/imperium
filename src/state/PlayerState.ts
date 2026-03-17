import { Card } from '../cards/Card';
import { CARD_DATABASE } from '../cards/CardDatabase';
import { PRESET_DECKS } from './PresetDecks';

export type Faction = 'adeptus_astartes' | 'astra_militarum' | 'orks' | 'adeptus_mechanicus';

export interface SavedDeck {
  id: string;
  name: string;
  faction: Faction;
  cardIds: string[];
}

export interface UnitXpData {
  earned: number;
  spent: number;
}

export interface PlayerStateData {
  collection: Record<string, number>;   // cardId -> qty owned
  decks: SavedDeck[];
  selectedDeckIndex: number;
  completedMissions: Set<string>;
  pendingRewards: string[];             // cards earned during current mission
  unitXp: Record<string, UnitXpData>;
  unlockedNodes: Set<string>;
}

const state: PlayerStateData = {
  collection: {},
  decks: [],
  selectedDeckIndex: 0,
  completedMissions: new Set(),
  pendingRewards: [],
  unitXp: {},
  unlockedNodes: new Set(),
};

export function initPlayerState(): void {
  // Starter collection (23 cards)
  state.collection = {
    servitor: 4,
    marine: 3,
    guardsman: 3,
    scout: 2,
    tarantula: 2,
    aegis: 2,
    barracks: 1,
    narthecium: 2,
    lance_strike: 1,
    blessed_armour: 1,
    blessed_bolts: 1,
    logis_protocol: 1,
    heated_bolts: 1,
    power_fist: 1,
    jump_pack: 1,
    storm_shield: 1,
    auspex: 1,
    frag_grenades: 1,
    reductor: 1,
    iron_halo: 1,
    rhino: 2,
    leman_russ: 1,
    sentinel: 2,
  };

  // Load preset decks
  state.decks = PRESET_DECKS.map(d => ({
    id: d.id,
    name: d.name,
    faction: d.faction,
    cardIds: [...d.cardIds],
  }));

  state.selectedDeckIndex = 0;
  state.completedMissions = new Set();
  state.pendingRewards = [];
  state.unitXp = {
    servitor: { earned: 0, spent: 0 },
    marine: { earned: 0, spent: 0 },
    guardsman: { earned: 0, spent: 0 },
    scout: { earned: 0, spent: 0 },
    rhino: { earned: 0, spent: 0 },
    leman_russ: { earned: 0, spent: 0 },
    sentinel: { earned: 0, spent: 0 },
  };
  state.unlockedNodes = new Set();
}

export function getPlayerState(): PlayerStateData {
  return state;
}

export function getSelectedDeckCards(): Card[] {
  const deck = state.decks[state.selectedDeckIndex];
  if (!deck) return [];
  return deck.cardIds
    .map(id => CARD_DATABASE[id])
    .filter((c): c is Card => c !== undefined);
}

export function addPendingReward(cardId: string): void {
  state.pendingRewards.push(cardId);
}

export function applyPendingRewards(): void {
  for (const cardId of state.pendingRewards) {
    addToCollection(cardId, 1);
  }
  state.pendingRewards = [];
}

export function addToCollection(cardId: string, qty: number): void {
  state.collection[cardId] = (state.collection[cardId] || 0) + qty;
}

export function getUnitXp(unitType: string): UnitXpData {
  if (!state.unitXp[unitType]) {
    state.unitXp[unitType] = { earned: 0, spent: 0 };
  }
  return state.unitXp[unitType];
}

export function addUnitXp(unitType: string, amount: number): void {
  if (!state.unitXp[unitType]) {
    state.unitXp[unitType] = { earned: 0, spent: 0 };
  }
  state.unitXp[unitType].earned += amount;
}

export function spendUnitXp(unitType: string, amount: number): void {
  if (!state.unitXp[unitType]) return;
  state.unitXp[unitType].spent += amount;
}
