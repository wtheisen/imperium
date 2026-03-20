# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server on port 3000
- `npm run build` — typecheck and bundle (`tsc && vite build`)
- `npm run preview` — serve production build locally
- `npm test` — run Vitest test suite (`vitest run`)
- `npm run test:watch` — run tests in watch mode

## Deployment

GitHub Pages via Actions workflow (`.github/workflows/deploy.yml`). Pushes to `main` auto-deploy to `imperium.williamtheisen.com`. The `public/CNAME` file configures the custom domain.

## Architecture

TypeScript + Three.js isometric card-based RTS/tower defense game with a Warhammer 40K theme. Built with Vite. Phaser has been removed — the game uses a custom `SceneManager` and Three.js for all 3D rendering.

### Scene Flow
BootScene → MissionSelectScene (full-screen campaign map) → DropSiteScene → GameScene + UIScene (overlay) → GameOverScene
Side scenes: ShopScene, DeckEditScene, TechTreeScene

### Core Patterns

**EventBus** (`src/EventBus.ts`): Global event emitter used for all cross-scene and cross-system communication. Every system that subscribes must clean up listeners in `destroy()` or `shutdown()`. Be careful with event ordering — some events (like `terrain-ready`) fire before all listeners are registered. Use dedicated events (e.g. `minimap-terrain`) when a consumer is created later in the lifecycle.

**SceneManager** (`src/scenes/SceneManager.ts`): Custom scene manager replacing Phaser's. Scenes implement `GameSceneInterface` with `create()`, optional `update(delta)`, and `shutdown()`. Supports concurrent scenes via `launch()` (e.g. UIScene overlays GameScene).

**Entity-Component System** (`src/entities/` + `src/components/`): `Entity` has a string-keyed component map. Access via `entity.getComponent<T>('name')` returning `T | undefined`. Components: Health, Mover, Combat, Gatherer, Aura, Production, Equipment, Ability, SelectionRing, LevelBadge, TechPassive.

**Systems** (`src/systems/`): EntityManager wires components onto spawned entities. Other systems: CombatSystem, EconomySystem, MissionSystem, PathfindingSystem (easystarjs), SelectionSystem, CommandSystem, FogOfWarSystem, SpawnerSystem, XpTracker.

**3D Renderer** (`src/renderer/`): Three.js-based. `GameRenderer` orchestrates the scene. `TileMapMesh` builds terrain geometry from procedural textures (`TerrainTextures.ts`). `EntityRenderer` syncs entity positions to 3D meshes. `FogRenderer` draws fog of war as a translucent plane. `CameraController` handles orbit/pan/zoom/edge-scroll. `InputBridge` converts screen clicks to tile coordinates.

**Isometric Coordinates**: `IsoHelper.tileToScreen()` / `IsoHelper.screenToTile()` in `src/map/IsoHelper.ts`. Map is 40×40 tiles. 3D world uses 1 unit = 1 tile.

### Card System
Card types: `unit | building | ordnance | doctrine | equipment` — each uses different optional fields on the `Card` interface (`src/cards/Card.ts`). All card definitions live in `src/cards/CardDatabase.ts`. Card execution logic is in `CardEffects.ts`.

- **Doctrines**: Persistent global buffs (max 3 active), managed by `DoctrineManager`
- **Equipment/Wargear**: Attach to units via `EquipmentComponent`, provide stat boosts, passives, or activated abilities
- **Ordnance**: AoE effects (damage, heal, stasis, vortex), some single-use
- **Keyboard hotkeys**: Keys 1-9 select cards from hand, showing placement preview at cursor. Key 0 draws a card (costs 3g).

### UI Architecture
All UI is HTML/CSS overlays (no canvas-based UI). Themed with an "imperial strategos terminal" aesthetic:
- **Fonts**: Teko (display/headers) + Share Tech Mono (body/monospace) via Google Fonts
- **Colors**: Brass/gold `#c8982a` accents on dark `#0a0a0e` backgrounds, warm muted text `#c8bfa0`
- **Recurring elements**: Diagonal hazard stripes at low opacity, gradient brass dividers, `8px letter-spacing:2px` section labels, subtle scanlines
- **Always use `/frontend-design` skill** when creating or modifying UI screens to maintain theme consistency

Key UI files:
- `src/scenes/UIScene.ts` — In-game HUD: top resource bar + bottom bar (hand | minimap | unit panel)
- `src/ui/CommandPanel.ts` — Unit/building selection detail panel (renders into bottom bar)
- `src/ui/ObjectiveDisplay.ts` — Mission objectives panel (top-right)
- `src/ui/DoctrinePanel.ts` — Active doctrines display (top-left)
- `src/ui/Minimap.ts` — Minimap (renders into bottom bar, listens for `minimap-terrain` event)
- `src/ui/ShopUI.ts` — Supply pod shop overlay

### Game Domain
- **Player units**: Servitor (worker/gatherer), Space Marine (melee), Guardsman (ranged), Scout (fast recon)
- **Enemy units**: Ork Boy (melee), Ork Shoota (ranged), Ork Nob (brute)
- **Buildings**: Drop Ship (HQ — heals, passive gold, trains servitors), Barracks (+ATK aura, trains units), Tarantula (auto-turret), Aegis (barricade wall, high armor)
- **Economy**: Requisition (gold) earned from objectives, kills, supply drops, gathering from gold mines. Spent to play cards.
- **Missions**: Define terrain, objectives, enemy camps, starting positions in `src/missions/MissionDatabase.ts`
- **Drop site selection**: Player chooses landing zone before each mission (`DropSiteScene`)
- **Teams**: `EntityTeam = 'player' | 'enemy'`

### Camera
- Orbit: middle-drag or Alt+left-drag
- Pan: right-drag or edge-of-screen (8px margin)
- Zoom: scroll wheel
- Rotate: Q/E keys

## Key Files

- `src/config.ts` — All balance constants (tile size, gold values, hand size, camera, etc.). Change numbers here first for balance tweaks.
- `src/cards/CardDatabase.ts` — All card definitions. Add new cards here.
- `src/cards/Card.ts` — Card type/interface definitions (CardType, WargearData, etc.)
- `src/systems/EntityManager.ts` — Entity spawning and component wiring for units and buildings.
- `src/scenes/GameScene.ts` — Main game loop, event wiring, VFX, camera setup.
- `src/scenes/UIScene.ts` — In-game HUD (top bar + bottom bar with hand/minimap/unit panel).
- `src/renderer/GameRenderer.ts` — Three.js scene, lighting, render loop.
- `src/renderer/CameraController.ts` — Camera orbit/pan/zoom/edge-scroll.
- `src/renderer/TileMapMesh.ts` — 3D terrain tile mesh generation.
- `src/renderer/TerrainTextures.ts` — Procedural terrain texture generation.
- `src/renderer/FogRenderer.ts` — Fog of war plane (Y=0.65, above all terrain).
- `src/missions/MissionDatabase.ts` — Mission definitions with terrain, objectives, enemy camps.
- `src/state/PlayerState.ts` — Persistent player progression (XP, unlocks).
- `PLAN_building_economy_redesign.md` — Active design doc for planned building/economy changes.
- `PLAN_procedural_missions.md` — Design doc for procedural mission generator (7 archetypes, difficulty scaling).
- `PLAN_campaign_map.md` — Design doc for campaign progression map (planet surface theater-of-war).

## Useful Skills

- `/frontend-design` — Create polished frontend interfaces and web components. **Use this for all UI work** to maintain the imperial strategos theme.
- `/commit` — Create well-formatted git commits
- `/simplify` — Review changed code for reuse, quality, and efficiency
