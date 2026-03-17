import { MissionDefinition } from './MissionDefinition';
import { ENEMY_GRUNT, ENEMY_ARCHER, ENEMY_BRUTE, ENEMY_BOSS } from '../ai/EnemyStats';
import { SUPPLY_DROP_INTERVAL_MS, CAMP_AGGRO_DEFAULT } from '../config';

export const MISSIONS: MissionDefinition[] = [
  // ── Mission 1: Easy ──────────────────────────────────────────
  {
    id: 'purge_outskirts',
    name: 'Purge the Outskirts',
    description: 'Clear xenos nests from the landing zone perimeter. Destroy the ork camp and purge the spawning grounds.',
    difficulty: 1,
    playerStartX: 40,
    playerStartY: 40,
    startingGold: 30,
    supplyDropIntervalMs: SUPPLY_DROP_INTERVAL_MS,
    terrain: {
      waterCoverage: 0.06,
      stoneCoverage: 0.03,
      forestCoverage: 0.05,
      goldMineCount: 6,
      riverCount: 1,
    },
    objectives: [
      {
        id: 'obj_destroy_camp1',
        type: 'destroy',
        name: 'Destroy Ork Outpost',
        description: 'Raze the ork outpost to the northwest.',
        tileX: 16,
        tileY: 16,
        targetCampId: 'camp_ork_nw',
        goldReward: 20,
        cardDraws: 2,
      },
      {
        id: 'obj_purge_nest',
        type: 'purge',
        name: 'Purge Xenos Nest',
        description: 'Eliminate all hostiles near the eastern spawning ground.',
        tileX: 64,
        tileY: 28,
        purgeRadius: 7,
        goldReward: 20,
        cardDraws: 2,
      },
    ],
    enemyCamps: [
      {
        id: 'camp_ork_nw',
        tileX: 16,
        tileY: 16,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 4, stats: ENEMY_GRUNT },
          { type: 'enemy_archer', texture: 'unit-enemy-ranged', count: 2, stats: ENEMY_ARCHER },
        ],
        building: {
          texture: 'building-barracks',
          buildingType: 'enemy_outpost',
          stats: { maxHp: 100, tileWidth: 2, tileHeight: 2 },
        },
        spawner: {
          spawnInterval: 30000,
          spawnGroup: [{ type: 'enemy_grunt', texture: 'unit-enemy', stats: ENEMY_GRUNT, count: 2 }],
          maxActiveUnits: 6,
          patrolRadius: 8,
        },
      },
      {
        id: 'camp_east_nest',
        tileX: 64,
        tileY: 28,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 5, stats: ENEMY_GRUNT },
        ],
      },
      {
        id: 'camp_south_patrol',
        tileX: 30,
        tileY: 64,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 3, stats: ENEMY_GRUNT },
        ],
        patrolPath: [
          { x: 30, y: 64 }, { x: 40, y: 64 }, { x: 40, y: 56 }, { x: 30, y: 56 },
        ],
      },
    ],
  },

  // ── Mission 2: Medium ─────────────────────────────────────────
  {
    id: 'secure_relay',
    name: 'Secure the Relay',
    description: 'Destroy ork outposts and recover the vox relay to restore Imperial communications.',
    difficulty: 2,
    playerStartX: 40,
    playerStartY: 68,
    startingGold: 25,
    supplyDropIntervalMs: SUPPLY_DROP_INTERVAL_MS,
    terrain: {
      waterCoverage: 0.08,
      stoneCoverage: 0.04,
      forestCoverage: 0.07,
      goldMineCount: 8,
      riverCount: 2,
    },
    objectives: [
      {
        id: 'obj_destroy_east',
        type: 'destroy',
        name: 'Destroy Eastern Outpost',
        description: 'Demolish the ork fortification to the east.',
        tileX: 66,
        tileY: 46,
        targetCampId: 'camp_ork_east',
        goldReward: 20,
        cardDraws: 2,
      },
      {
        id: 'obj_destroy_north',
        type: 'destroy',
        name: 'Destroy Northern Outpost',
        description: 'Demolish the ork fortification to the north.',
        tileX: 40,
        tileY: 12,
        targetCampId: 'camp_ork_north',
        goldReward: 20,
        cardDraws: 2,
      },
      {
        id: 'obj_recover_relay',
        type: 'recover',
        name: 'Recover Vox Relay',
        description: 'Send a unit to the relay site to recover it.',
        tileX: 14,
        tileY: 24,
        goldReward: 25,
        cardDraws: 2,
      },
    ],
    enemyCamps: [
      {
        id: 'camp_ork_east',
        tileX: 66,
        tileY: 46,
        aggroRadius: CAMP_AGGRO_DEFAULT + 1,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 5, stats: ENEMY_GRUNT },
          { type: 'enemy_archer', texture: 'unit-enemy-ranged', count: 3, stats: ENEMY_ARCHER },
          { type: 'enemy_brute', texture: 'unit-enemy-brute', count: 1, stats: ENEMY_BRUTE },
        ],
        building: {
          texture: 'building-barracks',
          buildingType: 'enemy_outpost',
          stats: { maxHp: 120, tileWidth: 2, tileHeight: 2 },
        },
        spawner: {
          spawnInterval: 25000,
          spawnGroup: [
            { type: 'enemy_grunt', texture: 'unit-enemy', stats: ENEMY_GRUNT, count: 2 },
            { type: 'enemy_archer', texture: 'unit-enemy-ranged', stats: ENEMY_ARCHER, count: 1 },
          ],
          maxActiveUnits: 8,
          patrolRadius: 10,
        },
      },
      {
        id: 'camp_ork_north',
        tileX: 40,
        tileY: 12,
        aggroRadius: CAMP_AGGRO_DEFAULT + 1,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 4, stats: ENEMY_GRUNT },
          { type: 'enemy_archer', texture: 'unit-enemy-ranged', count: 2, stats: ENEMY_ARCHER },
          { type: 'enemy_brute', texture: 'unit-enemy-brute', count: 1, stats: ENEMY_BRUTE },
        ],
        building: {
          texture: 'building-barracks',
          buildingType: 'enemy_outpost',
          stats: { maxHp: 120, tileWidth: 2, tileHeight: 2 },
        },
        spawner: {
          spawnInterval: 25000,
          spawnGroup: [
            { type: 'enemy_grunt', texture: 'unit-enemy', stats: ENEMY_GRUNT, count: 2 },
            { type: 'enemy_archer', texture: 'unit-enemy-ranged', stats: ENEMY_ARCHER, count: 1 },
          ],
          maxActiveUnits: 8,
          patrolRadius: 10,
        },
      },
      {
        id: 'camp_relay_guard',
        tileX: 14,
        tileY: 24,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 3, stats: ENEMY_GRUNT },
          { type: 'enemy_archer', texture: 'unit-enemy-ranged', count: 2, stats: ENEMY_ARCHER },
        ],
      },
      {
        id: 'camp_south_flank',
        tileX: 60,
        tileY: 66,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 4, stats: ENEMY_GRUNT },
        ],
        patrolPath: [
          { x: 60, y: 66 }, { x: 68, y: 66 }, { x: 68, y: 58 }, { x: 60, y: 58 },
        ],
      },
      {
        id: 'camp_west_ambush',
        tileX: 12,
        tileY: 50,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 3, stats: ENEMY_GRUNT },
          { type: 'enemy_brute', texture: 'unit-enemy-brute', count: 1, stats: ENEMY_BRUTE },
        ],
      },
    ],
  },

  // ── Mission 3: Hard ───────────────────────────────────────────
  {
    id: 'exterminatus',
    name: 'Exterminatus Protocol',
    description: 'Slay the Warboss, purge the nesting grounds, and recover the holy relic. The Emperor demands total victory.',
    difficulty: 3,
    playerStartX: 40,
    playerStartY: 70,
    startingGold: 20,
    supplyDropIntervalMs: SUPPLY_DROP_INTERVAL_MS,
    terrain: {
      waterCoverage: 0.10,
      stoneCoverage: 0.05,
      forestCoverage: 0.08,
      goldMineCount: 8,
      riverCount: 2,
    },
    objectives: [
      {
        id: 'obj_destroy_warboss',
        type: 'destroy',
        name: 'Destroy the Warboss Camp',
        description: 'Eliminate the Warboss and his stronghold.',
        tileX: 40,
        tileY: 8,
        targetCampId: 'camp_warboss',
        goldReward: 30,
        cardDraws: 3,
      },
      {
        id: 'obj_purge_west',
        type: 'purge',
        name: 'Purge Western Nest',
        description: 'Clear all hostiles from the western spawning ground.',
        tileX: 10,
        tileY: 36,
        purgeRadius: 8,
        goldReward: 25,
        cardDraws: 2,
      },
      {
        id: 'obj_purge_east',
        type: 'purge',
        name: 'Purge Eastern Nest',
        description: 'Clear all hostiles from the eastern spawning ground.',
        tileX: 70,
        tileY: 36,
        purgeRadius: 8,
        goldReward: 25,
        cardDraws: 2,
      },
    ],
    enemyCamps: [
      // Warboss camp — heavily fortified
      {
        id: 'camp_warboss',
        tileX: 40,
        tileY: 8,
        aggroRadius: CAMP_AGGRO_DEFAULT + 2,
        units: [
          { type: 'enemy_boss', texture: 'unit-enemy-brute', count: 1, stats: ENEMY_BOSS },
          { type: 'enemy_brute', texture: 'unit-enemy-brute', count: 2, stats: ENEMY_BRUTE },
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 4, stats: ENEMY_GRUNT },
          { type: 'enemy_archer', texture: 'unit-enemy-ranged', count: 3, stats: ENEMY_ARCHER },
        ],
        building: {
          texture: 'building-barracks',
          buildingType: 'enemy_outpost',
          stats: { maxHp: 250, tileWidth: 2, tileHeight: 2 },
        },
        spawner: {
          spawnInterval: 20000,
          spawnGroup: [
            { type: 'enemy_grunt', texture: 'unit-enemy', stats: ENEMY_GRUNT, count: 3 },
            { type: 'enemy_archer', texture: 'unit-enemy-ranged', stats: ENEMY_ARCHER, count: 1 },
          ],
          maxActiveUnits: 10,
          patrolRadius: 12,
        },
      },
      // West nest
      {
        id: 'camp_west_nest',
        tileX: 10,
        tileY: 36,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 6, stats: ENEMY_GRUNT },
          { type: 'enemy_archer', texture: 'unit-enemy-ranged', count: 2, stats: ENEMY_ARCHER },
        ],
      },
      // East nest
      {
        id: 'camp_east_nest',
        tileX: 70,
        tileY: 36,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 6, stats: ENEMY_GRUNT },
          { type: 'enemy_archer', texture: 'unit-enemy-ranged', count: 2, stats: ENEMY_ARCHER },
        ],
      },
      // Forward guard camps
      {
        id: 'camp_mid_left',
        tileX: 20,
        tileY: 20,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 4, stats: ENEMY_GRUNT },
          { type: 'enemy_brute', texture: 'unit-enemy-brute', count: 1, stats: ENEMY_BRUTE },
        ],
        building: {
          texture: 'building-barracks',
          buildingType: 'enemy_outpost',
          stats: { maxHp: 100, tileWidth: 2, tileHeight: 2 },
        },
        spawner: {
          spawnInterval: 25000,
          spawnGroup: [{ type: 'enemy_grunt', texture: 'unit-enemy', stats: ENEMY_GRUNT, count: 2 }],
          maxActiveUnits: 6,
          patrolRadius: 8,
        },
      },
      {
        id: 'camp_mid_right',
        tileX: 60,
        tileY: 20,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 4, stats: ENEMY_GRUNT },
          { type: 'enemy_brute', texture: 'unit-enemy-brute', count: 1, stats: ENEMY_BRUTE },
        ],
        building: {
          texture: 'building-barracks',
          buildingType: 'enemy_outpost',
          stats: { maxHp: 100, tileWidth: 2, tileHeight: 2 },
        },
        spawner: {
          spawnInterval: 25000,
          spawnGroup: [{ type: 'enemy_grunt', texture: 'unit-enemy', stats: ENEMY_GRUNT, count: 2 }],
          maxActiveUnits: 6,
          patrolRadius: 8,
        },
      },
      // Patrol camps near player start
      {
        id: 'camp_south_patrol_l',
        tileX: 20,
        tileY: 58,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 3, stats: ENEMY_GRUNT },
        ],
        patrolPath: [
          { x: 20, y: 58 }, { x: 28, y: 58 }, { x: 28, y: 50 }, { x: 20, y: 50 },
        ],
      },
      {
        id: 'camp_south_patrol_r',
        tileX: 60,
        tileY: 58,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 3, stats: ENEMY_GRUNT },
        ],
        patrolPath: [
          { x: 60, y: 58 }, { x: 68, y: 58 }, { x: 68, y: 50 }, { x: 60, y: 50 },
        ],
      },
    ],
  },

  // ── Mission 4: Space Hulk ──────────────────────────────────────
  {
    id: 'space_hulk_alpha',
    name: 'Purge the Derelict',
    description: 'Board the space hulk "Malediction of Sorrow" and purge the xenos infestation from its corridors.',
    difficulty: 2,
    playerStartX: 10,
    playerStartY: 40,
    startingGold: 25,
    supplyDropIntervalMs: SUPPLY_DROP_INTERVAL_MS,
    terrain: {
      mapType: 'space_hulk',
      corridorWidth: 3,
      goldMineCount: 5,
    },
    objectives: [
      {
        id: 'obj_destroy_bridge',
        type: 'destroy',
        name: 'Destroy Bridge Infestation',
        description: 'Clear the xenos nest from the bridge of the derelict.',
        tileX: 60,
        tileY: 20,
        targetCampId: 'camp_bridge',
        goldReward: 20,
        cardDraws: 2,
      },
      {
        id: 'obj_purge_enginarium',
        type: 'purge',
        name: 'Purge the Enginarium',
        description: 'Eliminate all hostiles in the engine chambers.',
        tileX: 40,
        tileY: 65,
        purgeRadius: 6,
        goldReward: 20,
        cardDraws: 2,
      },
      {
        id: 'obj_recover_relic',
        type: 'recover',
        name: 'Recover Sacred Relic',
        description: 'Retrieve the holy relic from the chapel vault.',
        tileX: 70,
        tileY: 50,
        goldReward: 25,
        cardDraws: 2,
      },
    ],
    enemyCamps: [
      {
        id: 'camp_bridge',
        tileX: 60,
        tileY: 20,
        aggroRadius: CAMP_AGGRO_DEFAULT + 1,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 5, stats: ENEMY_GRUNT },
          { type: 'enemy_archer', texture: 'unit-enemy-ranged', count: 3, stats: ENEMY_ARCHER },
          { type: 'enemy_brute', texture: 'unit-enemy-brute', count: 1, stats: ENEMY_BRUTE },
        ],
        building: {
          texture: 'building-barracks',
          buildingType: 'enemy_outpost',
          stats: { maxHp: 140, tileWidth: 2, tileHeight: 2 },
        },
        spawner: {
          spawnInterval: 25000,
          spawnGroup: [
            { type: 'enemy_grunt', texture: 'unit-enemy', stats: ENEMY_GRUNT, count: 2 },
            { type: 'enemy_archer', texture: 'unit-enemy-ranged', stats: ENEMY_ARCHER, count: 1 },
          ],
          maxActiveUnits: 8,
          patrolRadius: 8,
        },
      },
      {
        id: 'camp_enginarium',
        tileX: 40,
        tileY: 65,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 6, stats: ENEMY_GRUNT },
          { type: 'enemy_archer', texture: 'unit-enemy-ranged', count: 2, stats: ENEMY_ARCHER },
        ],
      },
      {
        id: 'camp_chapel',
        tileX: 70,
        tileY: 50,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 4, stats: ENEMY_GRUNT },
          { type: 'enemy_brute', texture: 'unit-enemy-brute', count: 1, stats: ENEMY_BRUTE },
        ],
      },
      {
        id: 'camp_corridor_patrol',
        tileX: 30,
        tileY: 30,
        aggroRadius: CAMP_AGGRO_DEFAULT,
        units: [
          { type: 'enemy_grunt', texture: 'unit-enemy', count: 3, stats: ENEMY_GRUNT },
        ],
        patrolPath: [
          { x: 30, y: 30 }, { x: 40, y: 30 }, { x: 40, y: 40 }, { x: 30, y: 40 },
        ],
      },
    ],
  },
];
