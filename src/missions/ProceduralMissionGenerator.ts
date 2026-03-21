import {
  MissionDefinition,
  ObjectiveDefinition,
  ObjectiveType,
  EnemyCampDefinition,
  CampUnitDef,
  EnvironmentModifier,
} from './MissionDefinition';
import { ENEMY_GRUNT, ENEMY_ARCHER, ENEMY_BRUTE, ENEMY_BOSS } from '../ai/EnemyStats';
import { SUPPLY_DROP_INTERVAL_MS, CAMP_AGGRO_DEFAULT, MAP_WIDTH, MAP_HEIGHT } from '../config';
import { createRng } from '../utils/MathUtils';

// ── Types ────────────────────────────────────────────────────────────

type MapZone = 'north' | 'nw' | 'ne' | 'west' | 'east' | 'center' | 'mid_w' | 'mid_e';

interface ObjectiveSlot {
  type: ObjectiveType;
  role: 'primary' | 'secondary';
  zone: MapZone;
}

interface ArchetypeDefinition {
  id: string;
  nameTemplates: string[];
  descTemplates: string[];
  objectiveSlots: ObjectiveSlot[];
  campLayout: 'flanking' | 'linear' | 'encircling';
  mapType: 'outdoor' | 'space_hulk' | 'any';
  allowedModifiers: EnvironmentModifier[];
}

interface DifficultyConfig {
  startingGoldRange: [number, number];
  goldMineCount: [number, number];
  gruntRange: [number, number];
  archerRange: [number, number];
  bruteRange: [number, number];
  bossCount: number;
  buildingHpRange: [number, number];
  spawnInterval: number;
  maxActiveUnits: [number, number];
  aggroBoost: number;
  surviveDurationMs: number;
  channelDurationMs: number;
  collectTotalRange: [number, number];
  modifierCount: [number, number];
  hasExtractionTimer: boolean;
  extractionTimerMs: number;
}

// ── Constants ────────────────────────────────────────────────────────

const PROC_MISSION_MIN_CAMP_SPACING = 12;
const PROC_MISSION_MIN_CAMP_SPACING_RELAXED = 8;
const PLAYER_START_X = 40;
const PLAYER_START_Y = 70;

const ZONE_CENTERS: Record<MapZone, { x: number; y: number }> = {
  north:  { x: 40, y: 10 },
  nw:     { x: 16, y: 14 },
  ne:     { x: 64, y: 14 },
  west:   { x: 12, y: 38 },
  east:   { x: 68, y: 38 },
  center: { x: 40, y: 36 },
  mid_w:  { x: 22, y: 48 },
  mid_e:  { x: 58, y: 48 },
};

const PRIMARY_ZONES: MapZone[] = ['north', 'nw', 'ne'];
const SECONDARY_ZONES: MapZone[] = ['center', 'west', 'east', 'mid_w', 'mid_e'];

const ZONE_NOUNS: Record<MapZone, string> = {
  north:  'the Northern Ruins',
  nw:     'the Western Wastes',
  ne:     'the Eastern Ridge',
  west:   'the Western Outskirts',
  east:   'the Eastern Frontier',
  center: 'the Central Garrison',
  mid_w:  'the Western Approach',
  mid_e:  'the Eastern Approach',
};

const CODENAMES = [
  'Iron Tide', 'Blood Price', 'Skull Throne', 'Crimson Oath',
  "Emperor's Blade", "Terra's Will", "Warp's Edge", 'Dusk Hammer',
  'Red Dawn', 'Steel Penance', 'Ash Storm', 'Thunder Vigil',
];

// ── Difficulty Configs ───────────────────────────────────────────────

const DIFFICULTY_CONFIGS: Record<number, DifficultyConfig> = {
  1: {
    startingGoldRange: [30, 35], goldMineCount: [5, 6],
    gruntRange: [3, 4], archerRange: [1, 2], bruteRange: [0, 0], bossCount: 0,
    buildingHpRange: [80, 100], spawnInterval: 35000, maxActiveUnits: [5, 6],
    aggroBoost: 0, surviveDurationMs: 45000, channelDurationMs: 15000,
    collectTotalRange: [2, 3], modifierCount: [0, 0],
    hasExtractionTimer: false, extractionTimerMs: 0,
  },
  2: {
    startingGoldRange: [25, 30], goldMineCount: [6, 8],
    gruntRange: [4, 5], archerRange: [2, 3], bruteRange: [0, 1], bossCount: 0,
    buildingHpRange: [100, 140], spawnInterval: 28000, maxActiveUnits: [7, 8],
    aggroBoost: 1, surviveDurationMs: 60000, channelDurationMs: 20000,
    collectTotalRange: [3, 4], modifierCount: [0, 1],
    hasExtractionTimer: true, extractionTimerMs: 45000,
  },
  3: {
    startingGoldRange: [20, 25], goldMineCount: [7, 8],
    gruntRange: [5, 6], archerRange: [3, 4], bruteRange: [1, 2], bossCount: 0,
    buildingHpRange: [150, 200], spawnInterval: 22000, maxActiveUnits: [9, 10],
    aggroBoost: 1, surviveDurationMs: 75000, channelDurationMs: 25000,
    collectTotalRange: [4, 5], modifierCount: [1, 1],
    hasExtractionTimer: true, extractionTimerMs: 50000,
  },
  4: {
    startingGoldRange: [15, 20], goldMineCount: [8, 8],
    gruntRange: [6, 8], archerRange: [4, 5], bruteRange: [2, 3], bossCount: 1,
    buildingHpRange: [200, 300], spawnInterval: 18000, maxActiveUnits: [12, 14],
    aggroBoost: 2, surviveDurationMs: 90000, channelDurationMs: 30000,
    collectTotalRange: [5, 6], modifierCount: [1, 2],
    hasExtractionTimer: true, extractionTimerMs: 60000,
  },
};

// ── Archetypes ───────────────────────────────────────────────────────

const ARCHETYPES: ArchetypeDefinition[] = [
  {
    id: 'purge_and_destroy',
    nameTemplates: ['Cleanse the {zone}', 'Purge Protocol: {zone}', 'Total Annihilation', "Emperor's Wrath", 'Xenos Hunt'],
    descTemplates: [
      'Sweep the area and eliminate all xenos presence. Destroy their stronghold and purge the spawning grounds.',
      'Intelligence reports heavy xenos activity in {zone}. Cleanse them from the Emperor\'s domain.',
    ],
    objectiveSlots: [
      { type: 'purge', role: 'primary', zone: 'nw' },
      { type: 'purge', role: 'primary', zone: 'ne' },
      { type: 'destroy', role: 'secondary', zone: 'center' },
    ],
    campLayout: 'flanking',
    mapType: 'outdoor',
    allowedModifiers: ['ork_frenzy', 'armored_advance', 'blood_tithe', 'elite_only', 'iron_rain'],
  },
  {
    id: 'destroy_and_recover',
    nameTemplates: ['Raid and Retrieve', 'Strike and Extract', 'Asset Recovery: {zone}', 'Operation {codename}'],
    descTemplates: [
      'Destroy the enemy stronghold and recover the lost Imperial asset from {zone}.',
      'A critical asset has been detected near {zone}. Smash through enemy lines and retrieve it.',
    ],
    objectiveSlots: [
      { type: 'destroy', role: 'primary', zone: 'north' },
      { type: 'recover', role: 'secondary', zone: 'mid_w' },
    ],
    campLayout: 'linear',
    mapType: 'outdoor',
    allowedModifiers: ['dense_fog', 'night_raid', 'ambush_spawns', 'scrapyard', 'warp_interference'],
  },
  {
    id: 'hold_and_strike',
    nameTemplates: ['Hold the Line', 'Iron Wall', 'Defensive Strike: {zone}', 'Bulwark Protocol'],
    descTemplates: [
      'Defend the forward position against assault, then push north and destroy the enemy command post.',
      'Establish a defensive perimeter near {zone}, then counter-attack the ork stronghold.',
    ],
    objectiveSlots: [
      { type: 'survive', role: 'primary', zone: 'center' },
      { type: 'destroy', role: 'secondary', zone: 'north' },
    ],
    campLayout: 'encircling',
    mapType: 'outdoor',
    allowedModifiers: ['ork_frenzy', 'supply_shortage', 'killzone', 'iron_rain', 'reinforced_walls'],
  },
  {
    id: 'activate_sequence',
    nameTemplates: ['Activate the {zone}', 'Ignition Protocol', 'Sequence Override', 'Operation {codename}'],
    descTemplates: [
      'Activate the relay terminals to restore Imperial communications. Expect heavy resistance during channeling.',
      'Two critical systems must be brought online in {zone}. Channel at each location to complete the activation.',
    ],
    objectiveSlots: [
      { type: 'activate', role: 'primary', zone: 'nw' },
      { type: 'activate', role: 'primary', zone: 'ne' },
    ],
    campLayout: 'flanking',
    mapType: 'any',
    allowedModifiers: ['dense_fog', 'night_raid', 'toxic_atmosphere', 'rapid_deployment', 'warp_interference'],
  },
  {
    id: 'scavenge_and_extract',
    nameTemplates: ['Scavenge and Evacuate', 'Recovery Operation', 'Data Retrieval: {zone}', 'Operation {codename}'],
    descTemplates: [
      'Recover scattered intel from the ruins before the ork horde arrives. Time is critical.',
      'Data-slates have been located across {zone}. Collect them all and extract before enemy reinforcements arrive.',
    ],
    objectiveSlots: [
      { type: 'collect', role: 'primary', zone: 'center' },
    ],
    campLayout: 'linear',
    mapType: 'outdoor',
    allowedModifiers: ['supply_shortage', 'armored_advance', 'blood_tithe', 'scrapyard', 'rapid_deployment'],
  },
  {
    id: 'deep_infiltration',
    nameTemplates: ['Deep Strike', 'Hulk Breach', 'Interior Assault', 'Operation {codename}'],
    descTemplates: [
      'Breach the space hulk interior. Activate the reactor and recover navigation data from the wreck.',
      'Board the derelict and complete critical objectives within its corridors. Dense fog obscures your advance.',
    ],
    objectiveSlots: [
      { type: 'activate', role: 'primary', zone: 'ne' },
      { type: 'collect', role: 'secondary', zone: 'mid_w' },
    ],
    campLayout: 'linear',
    mapType: 'space_hulk',
    allowedModifiers: ['dense_fog', 'ambush_spawns', 'toxic_atmosphere', 'killzone'],
  },
  {
    id: 'total_purge',
    nameTemplates: ['Exterminatus', "Emperor's Judgement", 'Total War: {zone}', 'Operation {codename}'],
    descTemplates: [
      'Total purge. Destroy all enemy strongholds and survive the counter-attack. The Emperor demands perfection.',
      'This is the final push into {zone}. Destroy everything, survive the backlash, and extract.',
    ],
    objectiveSlots: [
      { type: 'destroy', role: 'primary', zone: 'north' },
      { type: 'destroy', role: 'primary', zone: 'nw' },
      { type: 'survive', role: 'secondary', zone: 'center' },
    ],
    campLayout: 'encircling',
    mapType: 'outdoor',
    allowedModifiers: ['ork_frenzy', 'armored_advance', 'night_raid', 'elite_only', 'iron_rain', 'reinforced_walls'],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

function rngInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function rngPick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function jitter(rng: () => number, base: number, range: number): number {
  const val = base + Math.floor(rng() * (range * 2 + 1)) - range;
  return Math.max(4, Math.min(MAP_WIDTH - 4, val));
}

function tileDist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

function resolveZone(
  slot: ObjectiveSlot,
  rng: () => number,
  usedZones: Set<MapZone>,
): MapZone {
  const candidates = slot.role === 'primary' ? PRIMARY_ZONES : SECONDARY_ZONES;
  // Prefer the slot's declared zone if not used
  if (!usedZones.has(slot.zone) && candidates.includes(slot.zone)) {
    return slot.zone;
  }
  // Pick a random unused zone from the candidate set
  const available = candidates.filter(z => !usedZones.has(z));
  if (available.length > 0) return rngPick(rng, available);
  // Fallback: any zone not used
  const allZones: MapZone[] = [...PRIMARY_ZONES, ...SECONDARY_ZONES];
  const fallback = allZones.filter(z => !usedZones.has(z));
  return fallback.length > 0 ? rngPick(rng, fallback) : slot.zone;
}

function buildCampUnits(
  dc: DifficultyConfig,
  rng: () => number,
  isObjectiveCamp: boolean,
): CampUnitDef[] {
  const units: CampUnitDef[] = [];
  const gruntCount = rngInt(rng, dc.gruntRange[0], dc.gruntRange[1]);
  const archerCount = rngInt(rng, dc.archerRange[0], dc.archerRange[1]);
  const bruteCount = rngInt(rng, dc.bruteRange[0], dc.bruteRange[1]);

  if (gruntCount > 0) {
    units.push({ type: 'enemy_grunt', texture: 'unit-enemy', count: gruntCount, stats: ENEMY_GRUNT });
  }
  if (archerCount > 0) {
    units.push({ type: 'enemy_archer', texture: 'unit-enemy-ranged', count: archerCount, stats: ENEMY_ARCHER });
  }
  if (bruteCount > 0) {
    units.push({ type: 'enemy_brute', texture: 'unit-enemy-brute', count: bruteCount, stats: ENEMY_BRUTE });
  }
  if (isObjectiveCamp && dc.bossCount > 0) {
    units.push({ type: 'enemy_boss', texture: 'unit-enemy-brute', count: dc.bossCount, stats: ENEMY_BOSS });
  }
  return units;
}

function buildPatrolPath(cx: number, cy: number, rng: () => number): { x: number; y: number }[] {
  const size = rngInt(rng, 8, 14);
  const half = Math.floor(size / 2);
  return [
    { x: cx, y: cy },
    { x: Math.min(MAP_WIDTH - 4, cx + half), y: cy },
    { x: Math.min(MAP_WIDTH - 4, cx + half), y: Math.min(MAP_HEIGHT - 4, cy + half) },
    { x: cx, y: Math.min(MAP_HEIGHT - 4, cy + half) },
  ];
}

function checkSpacing(
  x: number, y: number,
  existing: { x: number; y: number }[],
  minDist: number,
): boolean {
  return existing.every(p => tileDist(x, y, p.x, p.y) >= minDist);
}

// ── Collect position generation ──────────────────────────────────────

function generateCollectPositions(
  count: number,
  rng: () => number,
): { tileX: number; tileY: number }[] {
  const positions: { tileX: number; tileY: number }[] = [];
  const zones: MapZone[] = ['nw', 'ne', 'mid_w', 'mid_e', 'west', 'east', 'center', 'north'];

  for (let i = 0; i < count; i++) {
    const zone = zones[i % zones.length];
    const zc = ZONE_CENTERS[zone];
    positions.push({
      tileX: jitter(rng, zc.x, 8),
      tileY: jitter(rng, zc.y, 8),
    });
  }
  return positions;
}

// ── Name generation ──────────────────────────────────────────────────

function generateName(
  archetype: ArchetypeDefinition,
  primaryZone: MapZone,
  rng: () => number,
): string {
  const template = rngPick(rng, archetype.nameTemplates);
  return template
    .replace('{zone}', ZONE_NOUNS[primaryZone])
    .replace('{codename}', rngPick(rng, CODENAMES));
}

function generateDescription(
  archetype: ArchetypeDefinition,
  primaryZone: MapZone,
  rng: () => number,
): string {
  const template = rngPick(rng, archetype.descTemplates);
  return template.replace(/\{zone\}/g, ZONE_NOUNS[primaryZone]);
}

// ── Main generator ───────────────────────────────────────────────────

/**
 * Generate a procedural mission.
 * @param difficulty  1-4
 * @param seed        Optional seed for reproducibility. Omit for random.
 * @param modifiers   Active player modifiers from PlayerState.activeModifiers
 * @param archetypeId Optional archetype override; random if omitted
 */
export function generateMission(
  difficulty: number,
  seed?: number,
  modifiers?: string[],
  archetypeId?: string,
): MissionDefinition {
  const actualSeed = seed ?? Math.floor(Math.random() * 2147483646) + 1;
  const rng = createRng(actualSeed);
  const dc = DIFFICULTY_CONFIGS[Math.max(1, Math.min(4, difficulty))] || DIFFICULTY_CONFIGS[2];

  // 1. Pick archetype
  const archetype = archetypeId
    ? ARCHETYPES.find(a => a.id === archetypeId) || rngPick(rng, ARCHETYPES)
    : rngPick(rng, ARCHETYPES);

  // 2. Resolve zones for each objective slot
  const usedZones = new Set<MapZone>();
  const resolvedSlots: (ObjectiveSlot & { resolvedZone: MapZone })[] = archetype.objectiveSlots.map(slot => {
    const zone = resolveZone(slot, rng, usedZones);
    usedZones.add(zone);
    return { ...slot, resolvedZone: zone };
  });

  const primaryZone = resolvedSlots.find(s => s.role === 'primary')?.resolvedZone || 'north';

  // 3. Build objectives and guard camps
  const objectives: ObjectiveDefinition[] = [];
  const camps: EnemyCampDefinition[] = [];
  const campPositions: { x: number; y: number }[] = [];

  for (let i = 0; i < resolvedSlots.length; i++) {
    const slot = resolvedSlots[i];
    const zc = ZONE_CENTERS[slot.resolvedZone];
    const tx = jitter(rng, zc.x, 6);
    const ty = jitter(rng, zc.y, 6);
    const objId = `obj_proc_${i}`;
    const campId = `camp_proc_${i}`;

    const obj: ObjectiveDefinition = {
      id: objId,
      type: slot.type,
      name: buildObjectiveName(slot.type, slot.resolvedZone, i),
      description: buildObjectiveDesc(slot.type, slot.resolvedZone),
      tileX: tx,
      tileY: ty,
      goldReward: slot.role === 'primary' ? 25 : 20,
      cardDraws: slot.role === 'primary' ? 3 : 2,
    };

    // Add type-specific fields
    if (slot.type === 'destroy') obj.targetCampId = campId;
    if (slot.type === 'purge') obj.purgeRadius = rngInt(rng, 6, 8);
    if (slot.type === 'survive') {
      obj.surviveDurationMs = dc.surviveDurationMs;
      obj.surviveRadius = rngInt(rng, 6, 8);
    }
    if (slot.type === 'activate') obj.channelDurationMs = dc.channelDurationMs;
    if (slot.type === 'collect') {
      obj.collectTotal = rngInt(rng, dc.collectTotalRange[0], dc.collectTotalRange[1]);
      obj.collectPositions = generateCollectPositions(obj.collectTotal, rng);
    }

    objectives.push(obj);

    // Guard camp at objective
    const needsBuilding = slot.type === 'destroy';
    const camp: EnemyCampDefinition = {
      id: campId,
      tileX: tx,
      tileY: ty,
      aggroRadius: CAMP_AGGRO_DEFAULT + dc.aggroBoost,
      units: buildCampUnits(dc, rng, slot.role === 'primary'),
    };

    if (needsBuilding) {
      camp.building = {
        texture: 'building-barracks',
        buildingType: 'enemy_outpost',
        stats: {
          maxHp: rngInt(rng, dc.buildingHpRange[0], dc.buildingHpRange[1]),
          tileWidth: 2,
          tileHeight: 2,
        },
      };
      camp.spawner = {
        spawnInterval: dc.spawnInterval,
        spawnGroup: [
          { type: 'enemy_grunt', texture: 'unit-enemy', stats: ENEMY_GRUNT, count: 2 },
          { type: 'enemy_archer', texture: 'unit-enemy-ranged', stats: ENEMY_ARCHER, count: 1 },
        ],
        maxActiveUnits: rngInt(rng, dc.maxActiveUnits[0], dc.maxActiveUnits[1]),
        patrolRadius: rngInt(rng, 8, 12),
      };
    }

    camps.push(camp);
    campPositions.push({ x: tx, y: ty });
  }

  // 4. Build flanking/patrol camps
  const flankCampCount = archetype.campLayout === 'encircling' ? 3 : 2;
  const flankZones = getFlankZones(resolvedSlots.map(s => s.resolvedZone));

  for (let i = 0; i < flankCampCount && i < flankZones.length; i++) {
    const fz = flankZones[i];
    const fzc = ZONE_CENTERS[fz];
    let fx: number, fy: number;
    let attempts = 0;
    let minDist = PROC_MISSION_MIN_CAMP_SPACING;

    do {
      fx = jitter(rng, fzc.x, 6);
      fy = jitter(rng, fzc.y, 6);
      attempts++;
      if (attempts > 10) minDist = PROC_MISSION_MIN_CAMP_SPACING_RELAXED;
    } while (attempts < 20 && !checkSpacing(fx, fy, campPositions, minDist));

    const isPatrol = i >= flankCampCount - 1;
    const flankDc: DifficultyConfig = {
      ...dc,
      gruntRange: [Math.max(2, dc.gruntRange[0] - 1), dc.gruntRange[1] - 1],
      archerRange: [0, Math.max(0, dc.archerRange[0] - 1)],
      bruteRange: [0, 0],
      bossCount: 0,
    };
    const flankCamp: EnemyCampDefinition = {
      id: `camp_proc_flank_${i}`,
      tileX: fx,
      tileY: fy,
      aggroRadius: CAMP_AGGRO_DEFAULT,
      units: buildCampUnits(flankDc, rng, false),
    };

    if (isPatrol) {
      flankCamp.patrolPath = buildPatrolPath(fx, fy, rng);
    }

    camps.push(flankCamp);
    campPositions.push({ x: fx, y: fy });
  }

  // 5. Optional objective (40% chance)
  let optionalObjectives: ObjectiveDefinition[] | undefined;
  if (rng() < 0.4) {
    const usedTypes = new Set(objectives.map(o => o.type));
    const candidateTypes: ObjectiveType[] = (['purge', 'recover', 'destroy', 'activate'] as ObjectiveType[])
      .filter(t => !usedTypes.has(t));
    if (candidateTypes.length > 0) {
      const optType = rngPick(rng, candidateTypes);
      const optZones = SECONDARY_ZONES.filter(z => !usedZones.has(z));
      const optZone = optZones.length > 0 ? rngPick(rng, optZones) : 'mid_e';
      const ozc = ZONE_CENTERS[optZone];
      const optObj: ObjectiveDefinition = {
        id: 'obj_proc_opt',
        type: optType,
        name: buildObjectiveName(optType, optZone, 99),
        description: buildObjectiveDesc(optType, optZone),
        tileX: jitter(rng, ozc.x, 6),
        tileY: jitter(rng, ozc.y, 6),
        goldReward: 15,
        cardDraws: 1,
      };
      if (optType === 'purge') optObj.purgeRadius = 6;
      if (optType === 'destroy') {
        const optCampId = 'camp_proc_opt';
        optObj.targetCampId = optCampId;
        camps.push({
          id: optCampId,
          tileX: optObj.tileX,
          tileY: optObj.tileY,
          aggroRadius: CAMP_AGGRO_DEFAULT,
          units: [
            { type: 'enemy_grunt', texture: 'unit-enemy', count: rngInt(rng, 3, 4), stats: ENEMY_GRUNT },
            { type: 'enemy_archer', texture: 'unit-enemy-ranged', count: rngInt(rng, 1, 2), stats: ENEMY_ARCHER },
          ],
          building: {
            texture: 'building-barracks',
            buildingType: 'enemy_outpost',
            stats: { maxHp: rngInt(rng, 80, 100), tileWidth: 2, tileHeight: 2 },
          },
        });
      }
      if (optType === 'activate') optObj.channelDurationMs = 15000;
      optionalObjectives = [optObj];
    }
  }

  // 6. Environment modifiers
  const modCount = rngInt(rng, dc.modifierCount[0], dc.modifierCount[1]);
  const envModifiers: EnvironmentModifier[] = [];
  if (modCount > 0 && archetype.allowedModifiers.length > 0) {
    const shuffled = [...archetype.allowedModifiers];
    // Fisher-Yates with seeded rng
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (let i = 0; i < Math.min(modCount, shuffled.length); i++) {
      envModifiers.push(shuffled[i]);
    }
  }
  // Merge player modifiers
  if (modifiers) {
    for (const mod of modifiers) {
      if (!envModifiers.includes(mod as EnvironmentModifier)) {
        envModifiers.push(mod as EnvironmentModifier);
      }
    }
  }

  // 7. Terrain params
  const mapType = archetype.mapType === 'any'
    ? (rng() < 0.3 ? 'space_hulk' : 'outdoor')
    : archetype.mapType;

  const terrainSeed = Math.floor(rng() * 2147483646) + 1;

  // 8. Assemble mission
  const mission: MissionDefinition = {
    id: `proc_${actualSeed}`,
    name: generateName(archetype, primaryZone, rng),
    description: generateDescription(archetype, primaryZone, rng),
    difficulty,
    objectives,
    enemyCamps: camps,
    playerStartX: mapType === 'space_hulk' ? 10 : PLAYER_START_X,
    playerStartY: mapType === 'space_hulk' ? 40 : PLAYER_START_Y,
    startingGold: rngInt(rng, dc.startingGoldRange[0], dc.startingGoldRange[1]),
    supplyDropIntervalMs: SUPPLY_DROP_INTERVAL_MS,
    terrain: mapType === 'space_hulk'
      ? { mapType: 'space_hulk', corridorWidth: rngInt(rng, 2, 3), goldMineCount: rngInt(rng, dc.goldMineCount[0], dc.goldMineCount[1]), seed: terrainSeed }
      : {
        seed: terrainSeed,
        waterCoverage: 0.04 + rng() * 0.06,
        stoneCoverage: 0.03 + rng() * 0.04,
        forestCoverage: 0.04 + rng() * 0.06,
        goldMineCount: rngInt(rng, dc.goldMineCount[0], dc.goldMineCount[1]),
        riverCount: rngInt(rng, 0, 2),
      },
  };

  if (optionalObjectives) mission.optionalObjectives = optionalObjectives;
  if (dc.hasExtractionTimer) mission.extractionTimerMs = dc.extractionTimerMs;
  if (envModifiers.length > 0) mission.environmentModifiers = envModifiers;

  return mission;
}

// ── Seed string utilities ────────────────────────────────────────────

const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateSeedString(): string {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
  }
  return s;
}

export function parseSeedString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

export function seedToString(seed: number): string {
  const rng = createRng(seed);
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += SEED_CHARS[Math.floor(rng() * SEED_CHARS.length)];
  }
  return s;
}

// ── Helper name/desc builders ────────────────────────────────────────

function buildObjectiveName(type: ObjectiveType, zone: MapZone, idx: number): string {
  const names: Record<ObjectiveType, string[]> = {
    destroy: ['Destroy Outpost', 'Raze Stronghold', 'Demolish Fortification'],
    purge: ['Purge Xenos Nest', 'Clear Hostiles', 'Eliminate Infestation'],
    recover: ['Recover Asset', 'Retrieve Relic', 'Extract Gene-Seed'],
    survive: ['Defend Position', 'Hold the Line', 'Withstand Assault'],
    activate: ['Activate Terminal', 'Power Up Relay', 'Initialize Beacon'],
    collect: ['Recover Data-Slates', 'Collect Intel', 'Gather Artifacts'],
  };
  return names[type][idx % names[type].length];
}

function buildObjectiveDesc(type: ObjectiveType, zone: MapZone): string {
  const zoneLabel = ZONE_NOUNS[zone];
  const descs: Record<ObjectiveType, string> = {
    destroy: `Demolish the enemy fortification in ${zoneLabel}.`,
    purge: `Eliminate all hostiles near ${zoneLabel}.`,
    recover: `Send a unit to ${zoneLabel} to recover the asset.`,
    survive: `Hold position in ${zoneLabel} against enemy waves.`,
    activate: `Channel at the terminal in ${zoneLabel} to complete activation.`,
    collect: `Collect scattered items from across the operational area.`,
  };
  return descs[type];
}

function getFlankZones(usedZones: MapZone[]): MapZone[] {
  // Return zones that provide flanking pressure
  const allFlankZones: MapZone[] = ['mid_w', 'mid_e', 'west', 'east', 'center'];
  const available = allFlankZones.filter(z => !usedZones.includes(z));
  // Also include a south-ish patrol zone
  if (!usedZones.includes('mid_w')) available.push('mid_w');
  if (!usedZones.includes('mid_e')) available.push('mid_e');
  // Deduplicate
  return [...new Set(available)];
}

/** Get the list of available archetype IDs */
export function getArchetypeIds(): string[] {
  return ARCHETYPES.map(a => a.id);
}

/** Get a human-readable label for an archetype */
export function getArchetypeLabel(id: string): string {
  const labels: Record<string, string> = {
    purge_and_destroy: 'PURGE + DESTROY',
    destroy_and_recover: 'RAID + RETRIEVE',
    hold_and_strike: 'HOLD + STRIKE',
    activate_sequence: 'ACTIVATE SEQUENCE',
    scavenge_and_extract: 'SCAVENGE + EXTRACT',
    deep_infiltration: 'DEEP INFILTRATION',
    total_purge: 'TOTAL PURGE',
  };
  return labels[id] || id.toUpperCase();
}
