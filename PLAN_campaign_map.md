# Plan: Campaign Progression Map

## Context

The flat mission list in `MissionSelectScene` gives players no meaningful spatial or strategic context when choosing where to deploy next — it's a numbered menu, not a war map. This redesign replaces it with a full-screen theater-of-war planet surface map in the style of Helldivers 2: all 12 missions are visible as deployable zones across a contested planet, no gating, difficulty communicated purely through visual language. Clicking a node pops a floating mission detail modal over the map instead of the current side panel.

The north star is a multi-tier Helldivers-style hierarchy (sectors → planets → theater of war), but V1 is scoped to a single planet surface with the 12 existing hand-crafted missions. Node positions are hardcoded; the data model is refactored to data-driven when the sectors layer is added.

---

## 1. Full-Screen Map Layout

### `src/scenes/MissionSelectScene.ts`

Replace the two-column layout (`left: mission list | right: detail panel`) with a single full-screen map view:

```
┌──────────────────────────────────────────────────────┐
│  TOP BAR (simplified — see §5)                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│   PLANET SURFACE MAP                                 │
│   (full remaining height)                            │
│                                                      │
│   [node]   [node]                                    │
│       [node]     [node]                              │
│   [node]  [node]     [node]                          │
│                                                      │
│              [MODAL — appears on node click]         │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Map container fills `flex: 1` below the top bar. Nodes are `position: absolute` inside a `position: relative` map container, placed using percentage coordinates so the layout scales with the viewport.

**Map background layers (CSS, no images):**
- Base: `linear-gradient(160deg, #0c0a06 0%, #14100a 50%, #0a0c08 100%)` — warm dark planetary surface tone
- Terrain noise: `repeating-linear-gradient` at very low opacity in two directions creating a subtle grid/terrain pattern
- Atmospheric haze: radial gradient vignette, heavier at edges
- Scanline + hazard stripe animations reused from existing `ms-stripe-scroll` / `ms-scanline` keyframes
- Planet curvature hint: subtle radial gradient centered top-center, brighter toward the top ("atmosphere glow")

---

## 2. Mission Node Data & Positions

### Hardcoded node layout (V1)

Define a `CAMPAIGN_NODES` constant at the top of `MissionSelectScene.ts`:

```typescript
interface CampaignNode {
  missionId: string;
  x: number;  // % from left of map container
  y: number;  // % from top of map container
}

const CAMPAIGN_NODES: CampaignNode[] = [
  // ── Difficulty 1 — STANDARD (southern landing zones) ──
  { missionId: 'purge_outskirts',   x: 28, y: 72 },
  { missionId: 'hold_the_line',     x: 62, y: 78 },

  // ── Difficulty 2 — HAZARDOUS (mid-continent band) ──
  { missionId: 'secure_relay',      x: 18, y: 52 },
  { missionId: 'vox_array',         x: 42, y: 58 },
  { missionId: 'scavenge_evacuate', x: 72, y: 55 },
  { missionId: 'night_raid',        x: 55, y: 42 },
  { missionId: 'space_hulk_alpha',  x: 82, y: 30 },  // orbital — far right

  // ── Difficulty 3 — EXTREMIS (northern contested zones) ──
  { missionId: 'exterminatus',      x: 22, y: 28 },
  { missionId: 'armored_assault',   x: 45, y: 22 },
  { missionId: 'green_tide',        x: 68, y: 32 },
  { missionId: 'deep_strike',       x: 85, y: 18 },  // orbital — far right

  // ── Difficulty 4 — HELLDIVE (enemy heartland) ──
  { missionId: 'exterminatus_omega', x: 40, y: 10 },
];
```

**Node rendering notes:**
- Space hulk missions (`mapType === 'space_hulk'`) positioned in the upper-right "orbital" cluster with a distinct hexagonal border instead of circular
- Difficulty 4 node positioned near the top center — the "enemy HQ" of the planet
- Difficulty 1 nodes near the bottom — the beachhead region, closer to the player's implied drop position

---

## 3. Node Visual Design

Each node is rendered as an absolutely-positioned `div` centered on its `(x%, y%)` coordinate.

### Node states

**Contested (not yet completed):**
```css
border: 1px solid {theme.color}80
background: radial-gradient(circle, {theme.color}18 0%, transparent 70%)
box-shadow: 0 0 12px {theme.color}40, inset 0 0 8px {theme.color}20
animation: cm-node-pulse 3s ease-in-out infinite  /* gentle glow pulse */
```
Enemy activity indicator: small animated `::after` pseudo-element — 2-3 orbiting dot particles suggesting ork movement.

**Pacified (completed):**
```css
border: 1px solid #4a9e4a80
background: radial-gradient(circle, #4a9e4a18 0%, transparent 70%)
box-shadow: 0 0 8px #4a9e4a30
/* no pulse animation — quiet, settled */
```
Imperial seal: small aquila glyph (`✦` or `⊕`) rendered inside the node in `#4a9e4a40`.

**Selected (currently focused):**
```css
border: 1px solid {theme.color}
box-shadow: 0 0 20px {theme.color}60
transform: scale(1.15)
```

### Node inner content
```
[ SYMBOL ]
[ MISSION NAME (Teko, 11px, letter-spacing: 1px) ]
[ DIFF BARS ▮▮▮ ]
```
Symbol by terrain type:
- `outdoor` → `⊕` (crosshair)
- `space_hulk` → `◈` (diamond with center)
- Default → `△` (triangle/drop zone)

### New keyframe

```css
@keyframes cm-node-pulse {
  0%, 100% { box-shadow: 0 0 12px {color}40, inset 0 0 8px {color}20; }
  50%       { box-shadow: 0 0 24px {color}70, inset 0 0 16px {color}40; }
}
@keyframes cm-node-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
```

---

## 4. Mission Detail Modal

### Trigger

`click` on any node → position and show the modal. No page re-render — update modal content and reposition it.

### Modal positioning

Modal is `position: absolute` inside the map container. Default anchor: node center + 180px right + 40px up. Clamp to map bounds:
- If `nodeX > 65%` → open to the left of the node instead
- If `nodeY < 25%` → open below the node instead

### Modal content

Reuses the existing `buildStatBox()`, difficulty theme, and objective list from the current detail panel. Extracted into a `buildMissionModal(mission, completed)` helper.

```
┌─────────────────────────────────┐
│ [DIFF SYMBOL] MISSION NAME      │
│ ──────────────────────────────  │
│ Threat Level: ▮▮▮ EXTREMIS      │
│ Map Type: PLANETARY SURFACE     │
│                                 │
│ MISSION BRIEFING                │
│ [description text]              │
│                                 │
│ TACTICAL OBJECTIVES             │
│ [objective list]                │
│                                 │
│ [STAT BOXES: REQ / OBJ / CAMPS] │
│                                 │
│ [SKULL MODIFIERS — if complete] │
│                                 │
│             [ DEPLOY ▶ ]        │
└─────────────────────────────────┘
```

**Modal chrome:**
```css
background: linear-gradient(160deg, rgba(14,12,8,0.97) 0%, rgba(10,10,14,0.97) 100%)
border: 1px solid rgba(200,152,42,0.3)
box-shadow: 0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(200,152,42,0.08)
backdrop-filter: blur(4px)
width: 340px
max-height: 70vh
overflow-y: auto
animation: ms-card-in 0.2s ease-out  /* reuses existing keyframe */
```

**Dismiss:** click anywhere outside the modal (or press Escape) to close it. No re-render needed — just hide the modal div and clear `selectedMissionId`.

### Skull modifiers in modal

Move `buildSkullModifiers()` output into the modal footer (only rendered when `completed === true`). Remove from where it was previously (the old right-panel bottom).

---

## 5. Simplified Top Bar

Keep the top bar structure. Remove redundant buttons, leaving:

```
[← back accent bar]  IMPERIAL COMMAND // STRATEGOS TERMINAL
                                       [DECK SELECTOR buttons]  [EDIT DECKS]  [COMMAND ▾]
```

The `COMMAND ▾` button replaces the separate `TECH TREES`, `SUPPLY DEPOT`, and `SHIP` buttons — it opens a small dropdown menu with those three options. This frees horizontal space and reduces visual noise.

**Dropdown implementation:** a small absolutely-positioned `div` below the COMMAND button, toggled on click, containing three items using the same button style. Dismiss on outside click.

---

## 6. PlayerState

No new fields required. `completedMissions: Set<string>` drives contested/pacified node state directly.

`unlockedNodes: Set<string>` remains dormant — reserved for the future sectors/planets layer where completing a mission on one planet may unlock a new planet in the sector map.

---

## 7. Files Summary

| File | Changes |
|---|---|
| `src/scenes/MissionSelectScene.ts` | Full rewrite: two-panel layout → full-screen map + modal. Add `CAMPAIGN_NODES`, `buildMap()`, `buildMissionModal()`, `buildCommandDropdown()`. Simplify top bar. Move skull modifiers into modal. |
| `src/state/PlayerState.ts` | No changes. |
| `src/missions/MissionDatabase.ts` | No changes. |
| `src/missions/MissionDefinition.ts` | No changes. |

All changes are self-contained in `MissionSelectScene.ts`. The scene's `create()` / `shutdown()` / `wireEvents()` structure is preserved — only the HTML template and event wiring change.

---

## Existing Code to Reuse

- `injectStyles()` + existing `@keyframes` (`ms-card-in`, `ms-scanline`, `ms-stripe-scroll`, `ms-glow-pulse`, `ms-flicker`) — extend, don't replace
- `DIFF_THEMES` record — unchanged, drives node and modal colors
- `MAP_TYPE_LABELS` record — drives map type display in modal header
- `buildStatBox()` — reused verbatim in modal
- `buildSkullModifiers()` — moved into modal, otherwise unchanged
- `buildDeckSelector()` — kept in simplified top bar
- `getSceneManager().start('DropSiteScene', { mission })` — deploy button wires to this exactly as before
- `toggleModifier()` / `savePlayerState()` — skull modifier toggles in modal work identically
- `isMissionLocked()` — **deleted**; no gating in V1

---

## Implementation Order

1. **Map skeleton** — Replace `buildLayout()` with `buildMap()` that renders a full-screen map container with background layers and the simplified top bar. No nodes yet. Verify the background renders correctly at various viewport sizes.

2. **Node rendering** — Add `CAMPAIGN_NODES` constant. Render all 12 nodes at their hardcoded positions with correct difficulty colors, terrain icons, and contested/pacified state from `completedMissions`.

3. **Node interaction** — Wire `click` handlers on nodes to show/hide the mission detail modal. Implement modal positioning logic (right-side default, flip to left when near edge).

4. **Mission detail modal** — Port content from the old `buildLayout()` right panel into `buildMissionModal()`. Include briefing, stat boxes, objectives, skull modifiers (if completed), and deploy button. Wire deploy and skull toggle events.

5. **Command dropdown** — Replace the three separate nav buttons (Tech Trees, Supply Depot, Ship) with a single `COMMAND ▾` dropdown. Wire all three scene transitions.

6. **Visual polish** — Add node pulse animation for contested zones, pacified state indicators (aquila glyph, quieter glow), modal entrance animation, and dismiss-on-outside-click behavior.

---

## Verification

1. **Map renders**: All 12 nodes visible at launch, correctly positioned across the map surface. No list/panel layout visible.
2. **Difficulty colors**: Difficulty-1 nodes green, diff-2 gold, diff-3 red, diff-4 purple — matching `DIFF_THEMES`.
3. **Contested/pacified**: Complete a mission, return to map — that node's styling switches to pacified (green glow, aquila mark, no pulse).
4. **Modal positioning**: Click a left-edge node → modal opens to the right. Click a right-edge node → modal opens to the left. Click a top-edge node → modal opens below. Modal never clips outside the map container.
5. **Modal content**: Briefing text, objectives, stat boxes, and deploy button all present. Skull modifier panel only appears for completed missions.
6. **Deploy flow**: Click DEPLOY in modal → transitions to DropSiteScene with correct mission. Mission plays normally.
7. **Skull modifiers**: Toggle modifiers in modal → `activeModifiers` updates, bonus RP shown, save persists across reload.
8. **Command dropdown**: Click COMMAND ▾ → dropdown shows Tech Trees / Supply Depot / Ship. Each routes to correct scene.
9. **Deck selector**: Switching decks from the top bar updates `selectedDeckIndex` and visually reflects the change.
10. `npm run build` — no TypeScript errors.

---

## Future Work (V2+)

- **Sectors layer**: A galaxy/sector map where each sector contains a planet. Clicking a planet enters the theater-of-war surface map for that planet. `unlockedNodes` will track which planets have been reached. Node positions become data-driven at this point.
- **Planet variety**: Different biome backgrounds per planet (desert ochre, jungle dark-green, ice-blue, space hulk orbital black). Reuse terrain type system from `MissionDefinition.terrain.mapType`.
- **Event nodes**: Non-mission nodes (Medicae Station for healing, Abandoned Depot for cards, Ork Cache for encounters) placed on the map as a V2 addition once the node graph is data-driven.
- **Procedural missions**: When a mission generator is built, it feeds into the same `CampaignNode` interface — generated missions get a node like any hand-crafted one.
