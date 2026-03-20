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

/** @deprecated Use per-instance XP on CardInstance instead. Kept for save migration. */
export interface UnitXpData {
  earned: number;
  spent: number;
}

export interface VeteranData {
  name: string;
  /** 0=recruit (shouldn't normally be set), 1=battle-hardened, 2=veteran, 3=hero */
  tier: 1 | 2 | 3;
  kills: number;
  missionsCompleted: number;
  unlockedNodes: string[];
  /** cardId of persistent wargear attached to this veteran */
  equippedWargear?: string;
}

export interface CardInstance {
  instanceId: string;
  cardId: string;
  xp: number;
  veteranData?: VeteranData;
  /** Transient — not persisted. True while this instance is deployed in the current mission. */
  _deployedThisMission?: boolean;
}

export interface PlayerStateData {
  collection: Record<string, CardInstance[]>;   // cardId -> instances
  decks: SavedDeck[];
  selectedDeckIndex: number;
  completedMissions: Set<string>;
  pendingRewards: string[];             // cards earned during current mission
  /** @deprecated Kept for save compatibility. XP now lives on CardInstance. */
  unitXp: Record<string, UnitXpData>;
  /** @deprecated Kept for save compatibility. Unlocks now live on CardInstance. */
  unlockedNodes: Set<string>;
  requisitionPoints: number;
  activeModifiers: string[];            // difficulty modifier IDs for next mission
  shipCredits: number;
  shipUpgrades: Record<string, number>; // roomId -> upgrade level
  shipOrdnance: string[];               // card IDs loaded into ship ordnance slots
  version: number;
}

const STORAGE_KEY = 'cardts_player_state';

const state: PlayerStateData = {
  collection: {},
  decks: [],
  selectedDeckIndex: 0,
  completedMissions: new Set(),
  pendingRewards: [],
  unitXp: {},
  unlockedNodes: new Set(),
  requisitionPoints: 0,
  activeModifiers: [],
  shipCredits: 0,
  shipUpgrades: {},
  shipOrdnance: [],
  version: 2,
};

function makeInstances(cardId: string, qty: number): CardInstance[] {
  return Array.from({ length: qty }, () => ({
    instanceId: crypto.randomUUID(),
    cardId,
    xp: 0,
  }));
}

function initStarterCollection(): void {
  // Starter collection (23 cards)
  const counts: Record<string, number> = {
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
  state.collection = {};
  for (const [cardId, qty] of Object.entries(counts)) {
    state.collection[cardId] = makeInstances(cardId, qty);
  }

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
  state.unitXp = {};
  state.unlockedNodes = new Set();
  state.requisitionPoints = 0;
  state.activeModifiers = [];
  state.shipCredits = 0;
  state.shipUpgrades = {};
  state.shipOrdnance = ['lance_strike', 'frag_storm'];
  state.version = 2;
}

export function savePlayerState(): void {
  // Strip transient _deployedThisMission before serializing
  const collectionToSave: Record<string, Omit<CardInstance, '_deployedThisMission'>[]> = {};
  for (const [cardId, instances] of Object.entries(state.collection)) {
    collectionToSave[cardId] = instances.map(({ _deployedThisMission: _, ...rest }) => rest);
  }
  const serializable = {
    collection: collectionToSave,
    decks: state.decks,
    selectedDeckIndex: state.selectedDeckIndex,
    completedMissions: Array.from(state.completedMissions),
    pendingRewards: state.pendingRewards,
    requisitionPoints: state.requisitionPoints,
    activeModifiers: state.activeModifiers,
    shipCredits: state.shipCredits,
    shipUpgrades: state.shipUpgrades,
    shipOrdnance: state.shipOrdnance,
    version: state.version,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (e) {
    console.warn('Failed to save player state:', e);
  }
}

export function loadPlayerState(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return false;

    // Migrate v1 collection (Record<string, number>) to v2 (Record<string, CardInstance[]>)
    const loadedVersion = data.version ?? 1;
    if (loadedVersion < 2 || (data.collection && typeof Object.values(data.collection)[0] === 'number')) {
      const oldCollection: Record<string, number> = data.collection || {};
      state.collection = {};
      for (const [cardId, qty] of Object.entries(oldCollection)) {
        state.collection[cardId] = makeInstances(cardId, qty as number);
      }
    } else {
      state.collection = data.collection || {};
    }

    state.decks = data.decks || [];
    state.selectedDeckIndex = data.selectedDeckIndex ?? 0;
    state.completedMissions = new Set(data.completedMissions || []);
    state.pendingRewards = data.pendingRewards || [];
    // Keep deprecated fields populated so old TechTree code doesn't crash
    state.unitXp = data.unitXp || {};
    state.unlockedNodes = new Set(data.unlockedNodes || []);
    state.requisitionPoints = data.requisitionPoints ?? 0;
    state.activeModifiers = data.activeModifiers || [];
    state.shipCredits = data.shipCredits ?? 0;
    state.shipUpgrades = data.shipUpgrades || {};
    state.shipOrdnance = data.shipOrdnance || [];
    state.version = 2;
    return true;
  } catch (e) {
    console.warn('Failed to load player state:', e);
    return false;
  }
}

export function initPlayerState(): void {
  if (!loadPlayerState()) {
    initStarterCollection();
  }
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
  if (!state.collection[cardId]) state.collection[cardId] = [];
  for (let i = 0; i < qty; i++) {
    state.collection[cardId].push({ instanceId: crypto.randomUUID(), cardId, xp: 0 });
  }
}

/** Returns total number of card copies owned (veteran + recruit). */
export function getCollectionCount(cardId: string): number {
  return state.collection[cardId]?.length ?? 0;
}

/** Returns all instances of a card. */
export function getCollectionInstances(cardId: string): CardInstance[] {
  return state.collection[cardId] ?? [];
}

/** Removes one card copy from collection (non-veteran first). Returns true if removed. */
export function removeOneFromCollection(cardId: string): boolean {
  const instances = state.collection[cardId];
  if (!instances || instances.length === 0) return false;
  // Prefer removing non-veteran copies first
  const idx = instances.findIndex(i => !i.veteranData);
  if (idx >= 0) {
    instances.splice(idx, 1);
  } else {
    instances.splice(0, 1);
  }
  if (instances.length === 0) delete state.collection[cardId];
  return true;
}

/** Returns a CardInstance by its instanceId. */
export function getCardInstance(instanceId: string): CardInstance | undefined {
  for (const instances of Object.values(state.collection)) {
    const found = instances.find(i => i.instanceId === instanceId);
    if (found) return found;
  }
  return undefined;
}

/** Returns the next undeployed instance for a card. */
export function getUndeployedInstance(cardId: string): CardInstance | undefined {
  return state.collection[cardId]?.find(i => !i._deployedThisMission);
}

/** Resets the _deployedThisMission flag on all instances (call before each mission). */
export function resetDeployedFlags(): void {
  for (const instances of Object.values(state.collection)) {
    for (const inst of instances) {
      inst._deployedThisMission = false;
    }
  }
}

export function addRequisitionPoints(amount: number): void {
  state.requisitionPoints += amount;
}

export function spendRequisitionPoints(amount: number): boolean {
  if (state.requisitionPoints < amount) return false;
  state.requisitionPoints -= amount;
  return true;
}

/** @deprecated XP now lives on CardInstance. This returns a dummy object. */
export function getUnitXp(unitType: string): UnitXpData {
  if (!state.unitXp[unitType]) {
    state.unitXp[unitType] = { earned: 0, spent: 0 };
  }
  return state.unitXp[unitType];
}

/** @deprecated XP now lives on CardInstance. This is a no-op. */
export function addUnitXp(_unitType: string, _amount: number): void {
  // no-op — XP is written to CardInstance by XpTracker
}

/** @deprecated XP now lives on CardInstance. This is a no-op. */
export function spendUnitXp(_unitType: string, _amount: number): void {
  // no-op
}

export function getActiveModifiers(): string[] {
  return state.activeModifiers;
}

export function toggleModifier(id: string): void {
  const idx = state.activeModifiers.indexOf(id);
  if (idx >= 0) {
    state.activeModifiers.splice(idx, 1);
  } else {
    state.activeModifiers.push(id);
  }
}

export function clearModifiers(): void {
  state.activeModifiers = [];
}

export function addShipCredits(amount: number): void {
  state.shipCredits += amount;
}

export function spendShipCredits(amount: number): boolean {
  if (state.shipCredits < amount) return false;
  state.shipCredits -= amount;
  return true;
}

export function getShipUpgradeLevel(roomId: string): number {
  return state.shipUpgrades[roomId] ?? 0;
}

export function setShipUpgradeLevel(roomId: string, level: number): void {
  state.shipUpgrades[roomId] = level;
}

export function getShipOrdnance(): string[] {
  return state.shipOrdnance;
}

export function setShipOrdnance(cardIds: string[]): void {
  state.shipOrdnance = cardIds;
}
