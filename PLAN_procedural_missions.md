# Plan: Procedural Mission Generator

## Context

The game ships with 12 hand-crafted missions covering difficulties 1–4. Once players complete them they have no replayable content. Terrain generation, POI/pack placement, and enemy stats are already parameterized — a procedural generator simply needs to compose `MissionDefinition` objects from these existing knobs. The generator lives entirely in a new file and feeds the same code paths as hand-crafted missions: zero changes to `GameScene`, `MapManager`, or any combat system.

---

## 1. Architecture Decision: Where Generation Happens

**Generate at the `MissionSelectScene` level**, producing a complete `MissionDefinition` that the game loop consumes unchanged.

Alternatives considered:
- **Inside MapManager at load time**: Would couple terrain generation to mission structure; harder to show a preview in the select screen.
- **Server-side / pre-seeded library**: Overkill; the terrain system already handles seeded randomness client-side.
- **Fully random each tick**: Too noisy — named archetypes give players a sense of what they're signing up for.

**Chosen**: New file `src/missions/ProceduralMissionGenerator.ts` exports `generateMission(difficulty, seed?)`. `MissionSelectScene` calls it and injects the result into the MISSIONS array as a virtual entry (no persistence needed unless we want shareable seeds later).

---

## 2. Template Composition vs Fully Random

**Hybrid: archetype-anchored composition.**

A "mission archetype" fixes the objective pattern (which types, how many, in what spatial relationship to each other), the camp layout pattern, and the set of allowed environment modifiers. Within those constraints, every other parameter is randomized. This gives:

- **Structural coherence** — a "Recover + Destroy" mission always feels like a recovery-with-escort, not a random collection of objectives.
- **Narrative coherence** — archetype drives name/description template selection, so the text matches the gameplay.
- **Replayability** — terrain seed, camp tile positions, unit counts, and modifiers vary every run.

### Archetypes (7 total, covering all objective types)

| Archetype ID | Primary Obj | Secondary Obj | Map Type | Flavor |
|---|---|---|---|---|
| `purge_and_destroy` | purge×2 | destroy×1 | outdoor | Classic sweep |
| `destroy_and_recover` | destroy×1 | recover×1 | outdoor | Raid & retrieve |
| `hold_and_strike` | survive×1 | destroy×1 | outdoor | Defensive push |
| `activate_sequence` | activate×2 | — | outdoor or hulk | Sabotage op |
| `scavenge_and_extract` | collect×1 | — | outdoor | Race against clock |
| `deep_infiltration` | activate×1 | collect×1 | space_hulk | Interior boarding |
| `total_purge` | destroy×2 | survive×1 | outdoor | Endgame helldive |

---

## 3. Difficulty Parameterization

Difficulty (`1`–`4`, matching `MissionDefinition.difficulty`) controls every numerical knob:

### DifficultyConfig table

| Parameter | D1 | D2 | D3 | D4 |
|---|---|---|---|---|
| `startingGold` | 30–35 | 25–30 | 20–25 | 15–20 |
| `goldMineCount` | 5–6 | 6–8 | 7–8 | 8 |
| Grunt count per objective camp | 3–4 | 4–5 | 5–6 | 6–8 |
| Archer count per objective camp | 1–2 | 2–3 | 3–4 | 4–5 |
| Brute count per objective camp | 0 | 0–1 | 1–2 | 2–3 |
| Boss count (warboss camp only) | 0 | 0 | 0–1 | 1 |
| Objective building HP | 80–100 | 100–140 | 150–200 | 200–300 |
| Spawner interval (ms) | 35000 | 28000 | 22000 | 18000 |
| Spawner max active units | 5–6 | 7–8 | 9–10 | 12–14 |
| `aggroRadius` boost | 0 | +1 | +1–2 | +2–3 |
| `surviveDurationMs` (survive obj) | 45s | 60s | 75s | 90s |
| `channelDurationMs` (activate obj) | 15s | 20s | 25s | 30s |
| `collectTotal` (collect obj) | 2–3 | 3–4 | 4–5 | 5–6 |
| Env modifier count | 0 | 0–1 | 1 | 1–2 |
| `extractionTimerMs` | — | 45s | 50s | 60s |

Stat scaling for enemy units uses the existing `ENEMY_GRUNT`/`ENEMY_ARCHER`/`ENEMY_BRUTE`/`ENEMY_BOSS` constants. No new stat tables needed — difficulty controls *composition* (how many of each type), not per-unit numbers.

---

## 4. Spatial Placement: Strategic Objective Layout

The 80×80 map with player start at south-center (~`tileX:40, tileY:68–74`) is divided into named zones:

```
  [NW]    [NORTH]    [NE]
  y:8–20  y:8–16     y:8–20
  x:8–26  x:28–52    x:54–72

[WEST]  [CENTER]  [EAST]
y:25–55 y:28–55   y:25–55
x:8–20  x:30–50   x:60–72

       [MID_W] [MID_E]
       y:40–58 y:40–58
       x:16–30 x:50–64

       [SOUTH] ← player start
       y:60–74, x:34–46
```

### Placement rules

1. **Primary objectives** go in `NORTH`, `NW`, or `NE` (furthest from player — forces map traversal).
2. **Secondary objectives** go in `CENTER`, `WEST`, `EAST`, or `MID_*` (mid-distance — creates branching decisions).
3. **Objective guard camp** is placed AT the objective tile (same `tileX/tileY`).
4. **Flanking camps** (1–2 extra) go in opposite mid zones to create multi-direction pressure: if primary is NW, a flank appears in MID_E.
5. **Patrol camps** (1–2) go in SOUTH or MID zone between player and objectives, using patrol paths that loop 20–30 tiles.
6. **Minimum spacing** between any two camps: 12 tiles. Retry up to 10 times if violated, then relax to 8.

Zone center coordinates (tile units):

```typescript
const ZONE_CENTERS: Record<string, { x: number; y: number }> = {
  north:   { x: 40, y: 10 },
  nw:      { x: 16, y: 14 },
  ne:      { x: 64, y: 14 },
  west:    { x: 12, y: 38 },
  east:    { x: 68, y: 38 },
  center:  { x: 40, y: 36 },
  mid_w:   { x: 22, y: 48 },
  mid_e:   { x: 58, y: 48 },
};
```

Each camp position = zone center + `rng()` jitter of ±6 tiles, clamped to `[4, MAP_WIDTH-4]`.

---

## 5. Name & Description Generation

A seeded pick from themed template lists keeps flavor without hardcoding. Templates use slot substitution for zone and objective nouns.

```typescript
const NAME_TEMPLATES: Record<string, string[]> = {
  purge_and_destroy: [
    'Cleanse the {zone}', 'Purge Protocol: {zone}', 'Total Annihilation',
    'Emperor\'s Wrath', 'Xenos Hunt',
  ],
  destroy_and_recover: [
    'Raid and Retrieve', 'Strike and Extract', 'Asset Recovery: {zone}',
    'Operation {codename}',
  ],
  // ... one array per archetype
};

const CODENAMES = ['Iron Tide', 'Blood Price', 'Skull Throne', 'Crimson Oath',
  'Emperor\'s Blade', 'Terra\'s Will', 'Warp\'s Edge', 'Dusk Hammer'];

const ZONE_NOUNS: Record<string, string> = {
  north: 'the Northern Ruins', nw: 'the Western Wastes',
  ne: 'the Eastern Ridge', center: 'the Central Garrison', ...
};
```

---

## 6. Environment Modifier Selection

Allowed modifiers per archetype:

| Archetype | Allowed modifiers |
|---|---|
| `purge_and_destroy` | ork_frenzy, armored_advance |
| `destroy_and_recover` | dense_fog, night_raid |
| `hold_and_strike` | ork_frenzy, supply_shortage |
| `activate_sequence` | dense_fog, night_raid |
| `scavenge_and_extract` | supply_shortage, armored_advance |
| `deep_infiltration` | dense_fog |
| `total_purge` | ork_frenzy, armored_advance, night_raid |

At D1: pick 0 modifiers. At D2: pick 0 or 1 at random. At D3: pick 1. At D4: pick 1–2.

PlayerState `activeModifiers` are merged in: if the player has toggled a modifier in the challenge menu, it is always added regardless of difficulty.

---

## 7. Integration with PlayerState

- `activeModifiers: string[]` (already in `PlayerStateData`) → passed to `generateMission()` and merged into `environmentModifiers`.
- Difficulty level for generated missions: derived from `PlayerState.campaignProgress` (missions completed) clamped to 1–4. Default: difficulty passed explicitly from the MissionSelectScene UI.
- Generated missions are **not persisted** — a new call to `generateMission()` with the same seed produces the same mission (seed is shown in the UI for sharing).

---

## 8. New Data Structures

```typescript
// src/missions/ProceduralMissionGenerator.ts

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
  /** extra non-objective camps: patrol/flank layout pattern */
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
  modifierCount: number;
  hasExtractionTimer: boolean;
  extractionTimerMs: number;
}
```

---

## 9. Optional Objectives

Each generated mission has a 40% chance to include one optional objective:
- Type is picked from objective types NOT already in the primary slot list.
- Placed in a mid-zone not occupied by a primary objective.
- Reward: 15g + 1 card draw (fixed, not difficulty-scaled).

---

## 10. Files to Create / Modify

| File | Action | Description |
|---|---|---|
| `src/missions/ProceduralMissionGenerator.ts` | **Create** | Core generator: archetypes, difficulty configs, placement logic |
| `src/scenes/MissionSelectScene.ts` | **Modify** | Add "Generate Mission" button + difficulty selector; inject generated mission into slot |
| `src/config.ts` | **Modify** | Add `PROC_MISSION_MIN_CAMP_SPACING = 12` constant |

No changes to: `GameScene`, `MapManager`, `MissionDefinition`, `MissionDatabase`, `EntityManager`, combat systems. Generated missions are structurally identical to hand-crafted ones.

---

## 11. ProceduralMissionGenerator API

```typescript
/**
 * Generate a procedural mission.
 * @param difficulty  1–4
 * @param seed        Optional seed for reproducibility. Omit for random.
 * @param modifiers   Active player modifiers from PlayerState.activeModifiers
 * @param archetypeId Optional archetype override; random if omitted
 */
export function generateMission(
  difficulty: number,
  seed?: number,
  modifiers?: string[],
  archetypeId?: string,
): MissionDefinition;

/** Generate a seed string suitable for display + sharing (6-char alphanumeric) */
export function generateSeedString(): string;

/** Parse a seed string back to a number */
export function parseSeedString(s: string): number;
```

Internally the function:
1. Picks archetype (random or specified).
2. Creates seeded RNG from `seed` (or `Date.now()` if omitted).
3. Samples difficulty config ranges.
4. Places objectives into zones, applies jitter, assigns IDs.
5. Builds guard camp at each objective site.
6. Builds flanking/patrol camps per `campLayout`.
7. Selects environment modifiers.
8. Assembles terrain params (random seed derived from mission seed).
9. Returns complete `MissionDefinition`.

---

## 12. MissionSelectScene Integration

- Add a **"GENERATE OPERATION"** button in the mission list, styled with the existing brass/imperial aesthetic.
- Below it: difficulty stars selector (1–4) and a seed input field (pre-filled with `generateSeedString()`).
- Clicking the button calls `generateMission()` and appends the result as a virtual entry at the top of the displayed list.
- The entry card shows: name, difficulty, archetype flavor icon, seed string, and a "NEW SEED" reroll button.
- Selecting the generated entry and clicking "DEPLOY" launches it via the normal `DropSiteScene` → `GameScene` flow.

---

## 13. Implementation Order

1. **`ProceduralMissionGenerator.ts`** — archetypes, difficulty table, zone placement, name generation, `generateMission()`. No UI yet; manually test via browser console.
2. **Unit tests** (`src/missions/ProceduralMissionGenerator.test.ts`) — verify structural validity of generated missions at each difficulty. Check: all objective `targetCampId`s exist in `enemyCamps`, no two camps closer than 8 tiles, `startingGold` in expected range, `environmentModifiers` only contains valid modifier strings.
3. **`MissionSelectScene.ts`** — wire in the "Generate Operation" button and seed UI. Inject generated mission into the displayed list.
4. **`config.ts`** — add spacing constant.

---

## 14. Verification Steps

1. **Structural validity**: Call `generateMission(d)` for d=1,2,3,4. Assert TypeScript types compile, all objective `targetCampId`s reference existing camps, `tileX/Y` in bounds.
2. **Reproducibility**: Call with same seed twice, assert deep equality of output.
3. **Difficulty scaling**: D1 generated mission has `startingGold >= 30`, no brutes, no env modifiers. D4 has boss, 2 modifiers, extraction timer.
4. **Spatial validity**: No two camp positions within 8 tiles of each other. Player start protected (no camp within radius 5).
5. **Game loop**: Load a generated mission via MissionSelectScene → DropSiteScene → GameScene. Confirm: terrain generates, objectives appear on minimap, enemy camps spawn correctly, victory condition triggers on objective completion.
6. **PlayerState modifiers**: Toggle `ork_frenzy` in PlayerState, generate mission — confirm modifier appears in `environmentModifiers`.
7. `npm run build` — no TypeScript errors.
8. `npm test` — procedural generator tests pass.

---

## Existing Code to Reuse

- `createRng()` / `fbm()` in `src/utils/MathUtils.ts` — seeded RNG and noise, already used by MapManager
- `ENEMY_GRUNT/ARCHER/BRUTE/BOSS` from `src/ai/EnemyStats.ts` — unit stats, no new stat tables
- `SUPPLY_DROP_INTERVAL_MS`, `CAMP_AGGRO_DEFAULT` from `src/config.ts` — base values
- `TerrainParams` interface in `MissionDefinition.ts` — all terrain knobs already defined
- `EnvironmentModifier` union type — already covers all needed modifiers
- `ObjectiveDefinition` / `EnemyCampDefinition` interfaces — generator just fills them
- MissionSelectScene existing button/card styles — no new CSS needed for the generate button
