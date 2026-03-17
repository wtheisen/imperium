# Plan: Building & Economy Redesign

## Context
Buildings feel purposeless — why build a Barracks when you can just play unit cards? The economy is flat (infinite mines, no expansion pressure). This redesign makes buildings compelling by:
1. **Depletable mines** force map expansion — gold runs out, you must push to new nodes
2. **Card units are elite** (tech bonuses + jokers), **trained units are cheap vanilla** — differentiated value propositions
3. **Each building gets a clear role** — Tarantula gains vision + slow aura, Aegis gains armor aura + self-repair

---

## 1. Depletable Gold Mines

### MapManager — `src/map/MapManager.ts`

Add per-mine state tracking:
```typescript
interface MineData { remaining: number; maxGold: number; }
private mineData: Map<string, MineData> = new Map();
```

New methods:
- `initMine(x, y, goldAmount)` — called when placing mines, inserts into `mineData`
- `getMineRemaining(x, y): number` — returns remaining gold
- `getMineRatio(x, y): number` — returns remaining/maxGold for visuals
- `depleteMine(x, y, amount): number` — subtracts, returns actual taken. If hits 0, calls `exhaustMine()`
- `exhaustMine(x, y)` — sets terrain to GRASS, changes tile sprite to `'tile-grass'`, removes from `mineData`, emits `'mine-exhausted'` event

Update `placeFeatures()` and `loadMissionTerrain()` to call `initMine()` with gold amounts. Near-start mines: 200g. Far/default mines: 300g.

**Visual depletion tint** on tile sprites:
- Ratio > 0.66 → no tint
- 0.33–0.66 → `0xccaa66`
- < 0.33 → `0x886644`
- Call `updateMineTint(x, y)` after each `depleteMine()`

### GathererComponent — `src/components/GathererComponent.ts`

In `gathering` state, after `this.carried++`, emit:
```typescript
EventBus.emit('mine-tick', { mineX: this.mineX, mineY: this.mineY });
```

Add listener in constructor for `'mine-exhausted'`:
- If `event.tileX === this.mineX && event.tileY === this.mineY`:
  - If carrying gold → set state to `'moving-to-drop'`
  - If empty → set state to `'idle'`
- Clean up listener in `destroy()`

### GameScene — `src/scenes/GameScene.ts`

Wire mine depletion:
- Listen for `'mine-tick'` → call `this.mapManager.depleteMine(mineX, mineY, 1)`
- No need to listen for `'mine-exhausted'` here — GathererComponent handles it

### Config — `src/config.ts`

```typescript
export const NEAR_MINE_GOLD = 200;
export const DEFAULT_MINE_GOLD = 300;
export const FAR_MINE_GOLD = 500;
```

### Mission Definitions — `src/missions/MissionDefinition.ts` + `MissionDatabase.ts`

Add optional `goldMines?: { tileX: number; tileY: number; goldAmount: number }[]` to MissionDefinition. Update missions with strategic mine placement (close small mines, far rich mines).

---

## 2. Card vs Building Unit Differentiation

### EntityManager — `src/systems/EntityManager.ts` (line 125-132)

`handleUnitTrained()` currently calls `applyTechTreeBonuses(unit, this)` + adds `LevelBadgeComponent`. **Remove both calls.** Trained units get base stats only.

```typescript
private handleUnitTrained({ unitType, texture, stats, tileX, tileY }): void {
  this.spawnUnit(tileX, tileY, texture, unitType, stats, 'player');
  // No tech bonuses, no level badge — vanilla unit
}
```

Card units (via `CardEffects.spawnUnit()`) keep: `applyTechTreeBonuses()` + `jokerManager.applyModifiers()` + `LevelBadgeComponent`. This already works as-is.

**Result**: Card units = elite (bonuses + instant). Trained units = cheap vanilla (queue time, no bonuses). LevelBadge presence is visual distinction.

---

## 3. Training Cost Rebalancing

### ProductionComponent — `src/components/ProductionComponent.ts`

Update `TRAINABLE_UNITS` costs (training is ~60-65% of card cost):

| Unit | Card Cost | Old Train Cost | New Train Cost |
|---|---|---|---|
| Servitor | 5G | 5G | **5G** (unchanged) |
| Scout | 8G | 8G | **5G** |
| Guardsman | 15G | 12G | **8G** |
| Marine | 12G | 15G | **8G** |

---

## 4. Building Redesign (Existing 4)

### Fortress — Economy HQ (no changes needed)
Already well-defined: heals nearby units, passive gold, trains servitors, drop point for gathering. Depletable mines make it even more important.

### Barracks — Army Factory (no changes needed)
+2 ATK aura + card draw bonus + now-cheaper training = clear value proposition with the differentiation above.

### Tarantula — Territory Control

**AuraComponent — `src/components/AuraComponent.ts`**

Extend `AuraConfig`:
```typescript
slowPercent?: number;   // % speed reduction on enemies in radius
slowRadius?: number;
```

Add `tickSlow()` method (follows `tickDamageBoost()` pattern):
- Track slowed entities in `private slowedEntities: Map<string, number>` (entityId → original speed)
- Enemies entering radius: reduce speed by `slowPercent%`, store original
- Enemies leaving radius: restore original speed
- Cleanup in `destroy()`: restore all slowed enemies

**FogOfWarSystem — `src/systems/FogOfWarSystem.ts` (line 185-189)**

Add tarantula vision:
```typescript
if (entity instanceof Building) {
  if (entity.buildingType === 'tarantula') return 7; // extended vision
  return entity.buildingType === 'fortress' ? SIGHT_RADIUS_TOWNHALL : SIGHT_RADIUS_BUILDING;
}
```

**EntityManager — `src/systems/EntityManager.ts`**

Add tarantula aura setup (after the existing aegis block):
```typescript
} else if (buildingType === 'tarantula') {
  building.addComponent('aura', new AuraComponent(building, {
    slowPercent: 30,
    slowRadius: 4,
  }, getAllEntities));
}
```

### Aegis — Fortification

**AuraComponent — `src/components/AuraComponent.ts`**

Extend `AuraConfig`:
```typescript
armorBoost?: number;        // +armor to nearby friendlies
armorRadius?: number;
selfRepairPerTick?: number; // HP self-repair per tick
selfRepairInterval?: number;
```

Add `tickArmorBoost()` (same pattern as `tickDamageBoost()` but modifies `health.armor` instead of `combat.damage`). Track in `private armorBoostedEntities: Set<string>`.

Add self-repair timer in `update()`:
```typescript
if (this.config.selfRepairPerTick) {
  this.repairTimer += delta;
  if (this.repairTimer >= (this.config.selfRepairInterval || 8000)) {
    this.repairTimer = 0;
    const health = this.entity.getComponent<HealthComponent>('health');
    if (health && health.currentHp < health.maxHp) health.heal(this.config.selfRepairPerTick);
  }
}
```

**EntityManager — `src/systems/EntityManager.ts`**

Update aegis setup:
```typescript
} else if (buildingType === 'aegis') {
  const health = building.getComponent<HealthComponent>('health');
  if (health) health.armor = 5;
  building.addComponent('aura', new AuraComponent(building, {
    armorBoost: 2,
    armorRadius: 3,
    selfRepairPerTick: 3,
    selfRepairInterval: 8000,
  }, getAllEntities));
}
```

---

## 5. UI Updates

### Mine tooltip — `src/scenes/GameScene.ts`

Add `private mineTooltip: Phaser.GameObjects.Text` created in `create()`.

In `onPointerMove()`, after tile hover diamond, if tile is a gold mine show remaining gold:
```typescript
if (this.mapManager.isGoldMine(tile.tileX, tile.tileY)) {
  const remaining = this.mapManager.getMineRemaining(tile.tileX, tile.tileY);
  this.mineTooltip.setText(`Gold: ${remaining}`);
  this.mineTooltip.setPosition(screen.x, screen.y - 24);
  this.mineTooltip.setVisible(true);
} else {
  this.mineTooltip.setVisible(false);
}
```

### CommandPanel building descriptions — `src/ui/CommandPanel.ts`

Update `BUILDING_DESCRIPTIONS`:
```typescript
fortress: 'Heals nearby units, passive gold income',
tarantula: 'Auto-turret, extended vision, slows enemies',
aegis: '5 armor wall, +2 armor aura, self-repair',
barracks: '+2 ATK aura, +1 card/wave, trains units',
```

Extend aura display to show new properties:
```typescript
if (cfg.slowPercent) auraParts.push(`${cfg.slowPercent}% slow`);
if (cfg.armorBoost) auraParts.push(`+${cfg.armorBoost} ARM aura`);
if (cfg.selfRepairPerTick) auraParts.push(`Self-repair`);
```

---

## Files Summary

| File | Changes |
|---|---|
| `src/map/MapManager.ts` | MineData tracking, depletion logic, visual tint, exhaustion |
| `src/components/GathererComponent.ts` | Emit `mine-tick`, listen for `mine-exhausted` |
| `src/components/AuraComponent.ts` | Add slow, armorBoost, selfRepair aura types |
| `src/systems/EntityManager.ts` | Remove tech bonuses from trained units, add tarantula/aegis auras |
| `src/systems/FogOfWarSystem.ts` | Tarantula extended vision radius |
| `src/components/ProductionComponent.ts` | Training cost rebalance |
| `src/scenes/GameScene.ts` | Wire mine-tick, mine tooltip |
| `src/ui/CommandPanel.ts` | Updated descriptions, new aura display |
| `src/config.ts` | Mine gold constants |
| `src/missions/MissionDefinition.ts` | Optional goldMines field |
| `src/missions/MissionDatabase.ts` | Per-mission mine placement |

## Existing Code to Reuse
- `AuraComponent.tickDamageBoost()` pattern for slow/armor auras (`src/components/AuraComponent.ts`)
- `AuraComponent.destroy()` cleanup pattern for new aura types
- `MapManager.tileSprites[][]` for visual mine updates (`src/map/MapManager.ts`)
- `GathererComponent` state machine — just add event emission + exhaustion listener
- `EventBus` emit/on pattern used throughout for mine-tick/mine-exhausted
- `FogOfWarSystem.getSightRadius()` building type check pattern

## Implementation Order
1. **Depletable mines** (MapManager + GathererComponent + GameScene + config)
2. **Card vs trained differentiation** (single change in EntityManager.handleUnitTrained)
3. **Training cost rebalance** (number changes in ProductionComponent)
4. **Building abilities** (AuraComponent extensions + EntityManager setup + FogOfWarSystem)
5. **UI polish** (mine tooltip, updated descriptions, aura display)

## Verification
1. **Mine depletion**: Assign servitor to mine → gold decreases → mine tile darkens → at 0 tile becomes grass, servitor goes idle
2. **Expansion pressure**: Close mines deplete early, forcing push to far mines
3. **Card vs trained**: Play marine card → gets tech bonuses + level badge. Train marine from barracks → base stats only, no badge. Train cost is 8G vs 12G card cost
4. **Tarantula**: Place turret → extended fog reveal, enemies in radius slowed 30%
5. **Aegis**: Place wall → nearby friendlies get +2 armor, wall slowly self-repairs
6. **UI**: Hover mine → shows "Gold: 187", building panel shows new descriptions
7. `npm run build` — no TypeScript errors
