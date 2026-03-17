# Imperium

**A real-time strategy deck builder set in the grim darkness of the far future.**

Build your deck. Choose your landing zone. Command your forces. Purge the xenos.

[Play Now](https://imperium.williamtheisen.com)

---

## What Is This?

Imperium is a browser-based RTS/tower defense hybrid where you command Imperial forces through card-based deployment. Instead of traditional build queues, you draw cards from a customizable deck to deploy units, construct buildings, cast ordnance strikes, equip wargear, and activate doctrines.

The game runs entirely in the browser -- no install, no login, no backend. Built with TypeScript, Three.js, and Vite.

## Gameplay

### The Loop

1. **Select a mission** from the command terminal
2. **Choose your drop site** on the procedurally generated terrain
3. **Play cards** from your hand to deploy Space Marines, Guardsmen, vehicles, turrets, and support abilities
4. **Command your forces** in real-time -- select units, issue move/attack orders, capture objectives
5. **Complete objectives** to earn requisition and card rewards
6. **Upgrade between missions** -- buy new cards at the Supply Depot, build new decks, unlock tech tree upgrades

### Card Types

| Type | Count | Description |
|------|-------|-------------|
| **Units** | 9 | Servitors, Space Marines, Guardsmen, Scouts, Ogryn, Techmarine, Rhino, Leman Russ, Sentinel |
| **Buildings** | 4 | Drop Ship (HQ), Barracks, Tarantula Turret, Aegis Defence Line, Sanctum |
| **Ordnance** | 10 | Lance Strikes, Stasis Bombs, Vortex Charges, Healing, Rally Orders, Smoke Barrages |
| **Doctrines** | 20 | Persistent global buffs -- economy boosts, combat modifiers, passive abilities |
| **Equipment** | 13 | Wargear that attaches to units -- Power Fists, Jump Packs, Storm Shields, Iron Halos |

56 cards total across 5 types.

### Missions

- **Purge the Outskirts** -- Clear ork nests from the landing zone (Standard)
- **Secure the Relay** -- Destroy outposts and recover the vox relay (Hazardous)
- **Exterminatus Protocol** -- Slay the Warboss and purge nesting grounds (Extremis)
- **Purge the Derelict** -- Board a space hulk and clear its corridors (Hazardous)

Each mission features procedurally generated terrain with rivers, forests, stone formations, and gold mines. Enemy camps continuously spawn reinforcements that escalate over time.

### Skull Modifiers

Completed missions unlock difficulty modifiers for bonus requisition points:

- **Iron Skull** -- Enemies have +25% HP
- **Wrath of the Xenos** -- Enemies deal +25% damage
- **Green Tide** -- Enemy spawns 40% faster
- **Austerity Decree** -- 25% less gold income
- **No Resupply** -- No supply drops
- **Glass Cannon** -- Player units have 25% less HP

Stack multiple skulls for greater challenge and greater reward.

## Controls

| Action | Input |
|--------|-------|
| Select units | Left-click / drag box |
| Move / Attack | Right-click |
| Orbit camera | Middle-drag or Alt+left-drag |
| Pan camera | Right-drag or screen edges |
| Zoom | Scroll wheel |
| Rotate | Q / E |
| Play card | Keys 1-9 select from hand, click to place |
| Draw card | Key 0 (costs 3 requisition) |
| Pause | P |

## Tech Stack

- **TypeScript** -- Strict types throughout
- **Three.js** -- 3D rendering with procedural terrain, fog of war, particle VFX
- **Vite** -- Dev server and production bundling
- **Vitest** -- Test suite
- **EasyStar.js** -- A* pathfinding
- **EventEmitter3** -- Global event bus for cross-system communication

No game engine framework -- custom scene manager, entity-component system, and renderer built from scratch.

## Architecture

```
src/
  cards/          Card definitions, database, effects, doctrine manager
  components/     ECS components (Health, Mover, Combat, Gatherer, Equipment, ...)
  entities/       Entity base class, Unit, Building, Projectile, SupplyPod
  systems/        Game systems (Combat, Economy, Pathfinding, Selection, Spawner, FogOfWar)
  renderer/       Three.js renderer, camera, terrain mesh, entity mesh factory, VFX
  scenes/         Scene manager + scenes (Boot, MissionSelect, DropSite, Game, UI, GameOver, ...)
  missions/       Mission definitions and objective system
  state/          Player progression, tech trees, difficulty modifiers
  ai/             Enemy AI and placement
  map/            Tile map, isometric helpers, placement validation
  ui/             HTML overlay panels (command panel, minimap, objectives, doctrines)
  audio/          Sound manager
```

**Key patterns:**
- **EventBus** for all cross-system communication
- **Entity-Component System** with string-keyed components
- **Custom Scene Manager** with concurrent scene support (GameScene + UIScene overlay)
- **Procedural terrain** with height maps, water animation, and terrain decorations
- **All UI is HTML/CSS overlays** themed as an Imperial strategos terminal

## Development

```bash
npm install
npm run dev       # Start dev server on localhost:3000
npm run build     # TypeScript check + production bundle
npm test          # Run test suite
```

## Deployment

Pushes to `main` auto-deploy to [imperium.williamtheisen.com](https://imperium.williamtheisen.com) via GitHub Pages Actions workflow.

## License

All rights reserved.
