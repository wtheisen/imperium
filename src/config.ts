export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const MAP_WIDTH = 80;
export const MAP_HEIGHT = 80;

export const HAND_SIZE = 5;
export const STARTING_GOLD = 30;
export const PASSIVE_INCOME_PER_WAVE = 10;
export const KILL_GOLD_BASE = 2;
export const WAVE_COMPLETION_BONUS = 20;

export const PREP_DURATION_MS = 30000;

// Mission system
export const SUPPLY_DROP_INTERVAL_MS = 90000;
export const SUPPLY_DROP_GOLD = 10;
export const SUPPLY_DROP_CARD_DRAWS = 1;
export const OBJECTIVE_COMPLETION_BONUS = 15;
export const OBJECTIVE_CARD_DRAWS = 2;
export const CAMP_AGGRO_DEFAULT = 6;

// Mine depletion
export const NEAR_MINE_GOLD = 120;
export const DEFAULT_MINE_GOLD = 200;
export const FAR_MINE_GOLD = 350;

export const MIN_DECK_SIZE = 8;
export const MAX_DECK_SIZE = 30;

export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 2.0;
export const CAMERA_ZOOM_STEP = 0.1;

// Edge scrolling
export const EDGE_SCROLL_SIZE = 30;
export const EDGE_SCROLL_SPEED = 6;

// Discard system
export const DISCARDS_PER_OBJECTIVE = 2;

// Veterancy
/** Minimum XP a unit must earn in a mission to qualify for veteran promotion. */
export const MIN_VET_XP_THRESHOLD = 30;
/** Cumulative XP thresholds for each veteran tier (0=recruit, 1=battle-hardened, 2=veteran, 3=hero). */
export const VET_TIER_THRESHOLDS = [0, 30, 120, 300];

// Audio
export const DEFAULT_VOLUME = 0.3;

export const DEPTH_OFFSET_TILE = 0;
export const DEPTH_OFFSET_BUILDING = 1;
export const DEPTH_OFFSET_UNIT = 2;
export const DEPTH_OFFSET_PROJECTILE = 3;
export const DEPTH_OFFSET_EFFECT = 4;

// Meta-currency rewards
export const MISSION_REWARD_BASE = 50;
export const MISSION_REWARD_PER_DIFFICULTY = 25;
export const MISSION_REWARD_PER_OBJECTIVE = 15;
export const DEFEAT_REWARD_FRACTION = 0.3;

// Shop
export const SHOP_PRICE_MULTIPLIER = 3;

// Spawner system
export const SPAWNER_BASE_INTERVAL = 30000;
export const ROAM_PATROL_INTERVAL = 45000;
export const ROAM_PATROL_SIZE = 3;
export const REINFORCEMENT_DELAY = 5000;
export const REINFORCEMENT_SIZE_BASE = 4;
export const PRESSURE_ESCALATION_INTERVAL = 60000;
export const PRESSURE_MAX = 2.0;

// Extraction phase
export const EXTRACTION_DEFAULT_TIMER_MS = 45000;
export const EXTRACTION_WAVE_INTERVAL_MS = 10000;
export const EXTRACTION_WAVE_SIZE_BASE = 6;
export const EXTRACTION_ZONE_RADIUS = 4;

// New objective types
export const SURVIVE_WAVE_INTERVAL_MS = 15000;
export const SURVIVE_WAVE_SIZE_BASE = 4;
export const ACTIVATE_CHANNEL_AGGRO_RADIUS = 12;
export const POI_PICKUP_RADIUS = 2;

// Pack system
export const PACK_PICKUP_RADIUS = 2;
export const PACK_BURN_GOLD_MULTIPLIER = 2;
export const SALVAGE_CREDIT_BASE = 5;
export const SALVAGE_DUPLICATE_BONUS = 3;
export const CARDS_PER_PACK = 3;

// Ship ordnance
export const SHIP_ORDNANCE_BASE_SLOTS = 2;
export const SHIP_ORDNANCE_BASE_CHARGES = 2;

// Procedural PoI / Pack generation
export const POI_BASE_COUNT = 4;
export const POI_PER_DIFFICULTY = 2;
export const POI_MIN_SPACING = 8;
export const POI_MIN_DIST_FROM_START = 6;
export const POI_MIN_DIST_FROM_CAMP = 4;
export const POI_MIN_DIST_FROM_MINE = 4;
export const PACK_BASE_COUNT = 2;
export const PACK_PER_DIFFICULTY = 1;
export const PACK_MIN_DIST_FROM_START = 12;
