# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server on port 3000
- `npm run build` — typecheck and bundle (`tsc && vite build`)
- `npm run preview` — serve production build locally
- No test framework is configured; use `npm run build` to verify type correctness

## Architecture

TypeScript + Phaser 3 isometric card-based RTS/tower defense game with a Warhammer 40K theme. Built with Vite.

### Scene Flow
BootScene → MissionSelectScene → GameScene + UIScene (overlay) → GameOverScene
Side scenes: ShopScene, DeckEditScene, TechTreeScene

### Core Patterns

**EventBus** (`src/EventBus.ts`): Global Phaser EventEmitter used for all cross-scene and cross-system communication. Every system that subscribes must clean up listeners in `destroy()` or `shutdown()`.

**Entity-Component System** (`src/entities/` + `src/components/`): `Entity` extends `Phaser.GameObjects.Sprite` with a string-keyed component map. Access via `entity.getComponent<T>('name')` returning `T | undefined`. Components: Health, Mover, Combat, Gatherer, Aura, Production, Equipment, Ability, SelectionRing, LevelBadge, TechPassive.

**Systems** (`src/systems/`): EntityManager wires components onto spawned entities. Other systems: CombatSystem, EconomySystem, MissionSystem, PathfindingSystem (easystarjs), SelectionSystem, CommandSystem, FogOfWarSystem, WaveSystem, XpTracker.

**Isometric Coordinates**: All tile↔screen conversions go through `IsoHelper.tileToScreen()` / `IsoHelper.screenToTile()` in `src/map/IsoHelper.ts`. Map is 40×40 tiles, each 64×32px.

**All textures are procedurally generated** in `BootScene.ts` using Phaser Graphics — there are no external image assets. Texture keys follow: `unit-{type}`, `building-{type}`, `tile-{type}`, `spell-{type}`.

### Card System
Card types: `unit | building | spell | doctrine | equipment` — each uses different optional fields on the `Card` interface (`src/cards/Card.ts`). All card definitions live in `src/cards/CardDatabase.ts`. Card execution logic is in `CardEffects.ts`.

- **Doctrines**: Persistent global buffs (max 3 active), managed by `DoctrineManager`
- **Equipment/Wargear**: Attach to units via `EquipmentComponent`, provide stat boosts, passives, or activated abilities
- **Spells**: AoE effects (damage, heal, stasis, vortex), some single-use

### Game Domain
- **Player units**: Servitor (worker/gatherer), Space Marine (melee), Guardsman (ranged), Scout (fast recon)
- **Enemy units**: Ork Boy (melee), Ork Shoota (ranged), Ork Nob (brute)
- **Buildings**: Fortress (HQ — heals, passive gold, trains servitors), Barracks (+ATK aura, trains units), Tarantula (auto-turret), Aegis (barricade wall, high armor)
- **Economy**: Gold (requisition) earned from objectives, kills, supply drops, gathering from gold mines. Spent to play cards.
- **Missions**: Define terrain, objectives, enemy camps, starting positions in `src/missions/MissionDatabase.ts`
- **Teams**: `EntityTeam = 'player' | 'enemy'`

## Key Files

- `src/config.ts` — All balance constants (tile size, gold values, hand size, camera, etc.). Change numbers here first for balance tweaks.
- `src/cards/CardDatabase.ts` — All card definitions. Add new cards here.
- `src/cards/Card.ts` — Card type/interface definitions (CardType, WargearData, etc.)
- `src/systems/EntityManager.ts` — Entity spawning and component wiring for units and buildings.
- `src/scenes/GameScene.ts` — Main game loop, event wiring, VFX, camera setup.
- `src/scenes/BootScene.ts` — All procedural texture generation. Add new art here.
- `src/scenes/UIScene.ts` — HUD overlay (hand, gold, objectives, command panel).
- `src/missions/MissionDatabase.ts` — Mission definitions with terrain, objectives, enemy camps.
- `src/state/PlayerState.ts` — Persistent player progression (XP, unlocks).
- `PLAN_building_economy_redesign.md` — Active design doc for planned building/economy changes.

## Useful Skills

- `/frontend-design` — Create polished frontend interfaces and web components
- `/commit` — Create well-formatted git commits
- `/simplify` — Review changed code for reuse, quality, and efficiency
- `/figma:implement-design` — Translate Figma designs to production code (if Figma MCP connected)
