# Plan: Unit Veterancy & Persistent Squads

## Context

Missions feel disconnected — every deployment is anonymous and expendable. There's no narrative thread running through a campaign, no reason to care whether a specific unit lives or dies beyond the immediate tactical situation. Veterancy gives card copies persistent identity across missions: kill counts, tech tree progression, a name, and wargear that travel with them. Losing 'Brother Theron' mid-campaign should sting.

The core model: **veterancy is card-copy state, not a separate roster.** Each physical copy of a card in your collection becomes a `CardInstance` object. A `CardInstance` that has survived enough missions with enough XP earns a name and begins accumulating its own tech tree unlocks and wargear. The global `unitXp` and `unlockedNodes` in PlayerState are replaced entirely by per-instance equivalents.

---

## 1. Data Model — CardInstance

### `src/state/PlayerState.ts`

Replace `collection: Record<string, number>` with `collection: Record<string, CardInstance[]>`.

```typescript
export interface VeteranData {
  name: string;                  // e.g. "Brother Theron"
  tier: 0 | 1 | 2 | 3;          // 0=recruit, 1=battle-hardened, 2=veteran, 3=hero
  kills: number;
  missionsCompleted: number;
  unlockedNodes: string[];       // per-instance tech tree unlocks
  equippedWargear?: string;      // cardId of persistent wargear (e.g. 'power_fist')
}

export interface CardInstance {
  instanceId: string;            // uuid, generated at collection time
  cardId: string;                // points to CardDatabase entry
  xp: number;                    // accumulated XP across missions
  veteranData?: VeteranData;     // undefined = fresh recruit
}
```

Add to `PlayerStateData`:
```typescript
collection: Record<string, CardInstance[]>;   // replaces Record<string, number>
```

Remove from `PlayerStateData`:
```typescript
unitXp: Record<string, UnitXpData>;           // removed — XP lives on CardInstance
unlockedNodes: Set<string>;                   // removed — unlocks live on CardInstance
```

### Migration in `loadPlayerState()`

Bump `version` to `2`. On load, detect old format:
```typescript
if (data.version < 2 || typeof data.collection?.marine === 'number') {
  // old format: Record<string, number>
  const oldCollection: Record<string, number> = data.collection || {};
  state.collection = {};
  for (const [cardId, qty] of Object.entries(oldCollection)) {
    state.collection[cardId] = Array.from({ length: qty }, () => ({
      instanceId: crypto.randomUUID(),
      cardId,
      xp: 0,
    }));
  }
  state.version = 2;
} else {
  // new format — revive Sets inside veteranData if needed
  state.collection = data.collection || {};
}
```

### Serialization

`savePlayerState()` already JSON-stringifies — `CardInstance[]` serializes cleanly. No Set conversions needed (unlike the old `unlockedNodes: Set<string>`).

---

## 2. XP & Kill Tracking — per-instance

### `src/entities/Unit.ts`

Add optional `cardInstanceId` field:
```typescript
public cardInstanceId?: string;   // set when deployed from a card; undefined for trained units
```

### `src/systems/XpTracker.ts`

Change `addXp()` to write XP back to the `CardInstance` in PlayerState:
```typescript
import { getCardInstance } from '../state/PlayerState';

private addXp(unit: Unit, amount: number, kill = false): void {
  unit.xp += amount;
  if (!unit.cardInstanceId) return;
  const inst = getCardInstance(unit.cardInstanceId);
  if (!inst) return;
  inst.xp += amount;
  if (kill && inst.veteranData) inst.veteranData.kills += 1;
}
```

Update `onEntityDied` to pass `kill = true`:
```typescript
this.addXp(killer, 10, /* kill */ true);
```

Remove `addUnitXp()` calls. Remove `commitToPlayerState()` (already a no-op).

### New helper in `src/state/PlayerState.ts`

```typescript
export function getCardInstance(instanceId: string): CardInstance | undefined {
  for (const instances of Object.values(state.collection)) {
    const found = instances.find(i => i.instanceId === instanceId);
    if (found) return found;
  }
  return undefined;
}

export function getCardInstancesByCardId(cardId: string): CardInstance[] {
  return state.collection[cardId] ?? [];
}
```

---

## 3. Card Deployment — binding instanceId

### `src/cards/CardEffects.ts`

When playing a unit card, look up the first undeployed `CardInstance` for that cardId and bind it:

```typescript
// Before spawnUnit():
const instances = getCardInstancesByCardId(card.id);
const instance = instances.find(i => !i._deployedThisMission);
if (instance) instance._deployedThisMission = true;

const unit = spawnUnit(...);
if (instance) unit.cardInstanceId = instance.instanceId;
```

Add transient field to `CardInstance` (not saved):
```typescript
_deployedThisMission?: boolean;  // reset before each mission
```

Reset in `GameScene.create()` before mission starts:
```typescript
for (const instances of Object.values(getPlayerState().collection)) {
  for (const inst of instances) inst._deployedThisMission = false;
}
```

---

## 4. Mission-End Survivor Detection

### `src/scenes/GameScene.ts`

At mission end (listen for `'mission-complete'` and `'mission-failed'` events):

```typescript
private handleMissionEnd(): void {
  const survivors = this.entityManager.getUnits('player')
    .filter(u => u.active && u.cardInstanceId);

  for (const unit of survivors) {
    const inst = getCardInstance(unit.cardInstanceId!);
    if (!inst) continue;

    // Minimum XP threshold: 30 XP to qualify (roughly 3 kills or equivalent damage)
    const qualifies = inst.xp >= MIN_VET_XP_THRESHOLD;
    if (!qualifies) continue;

    if (!inst.veteranData) {
      // First promotion — generate name and create veteranData
      inst.veteranData = {
        name: generateVeteranName(inst.cardId),
        tier: 1,
        kills: 0,  // kills tracked live via XpTracker
        missionsCompleted: 1,
        unlockedNodes: [],
      };
      EventBus.emit('veteran-promoted', { instanceId: inst.instanceId, name: inst.veteranData.name });
    } else {
      inst.veteranData.missionsCompleted += 1;
      inst.veteranData.tier = computeVetTier(inst.xp) as 0 | 1 | 2 | 3;
    }
  }

  savePlayerState();
}
```

### `src/config.ts`

```typescript
export const MIN_VET_XP_THRESHOLD = 30;   // ~3 kills or equivalent damage
export const VET_TIER_THRESHOLDS = [0, 30, 120, 300];  // XP for tiers 0-3
```

### Permadeath — on unit death

In `XpTracker.onEntityDied()`, check if the dying entity is a player card unit:
```typescript
private onEntityDied({ entity }: { entity: Entity; killer?: Entity }): void {
  // existing kill-credit logic above...

  // Permadeath: clear veteran data if a named unit dies
  if (entity instanceof Unit && entity.team === 'player' && entity.cardInstanceId) {
    const inst = getCardInstance(entity.cardInstanceId);
    if (inst?.veteranData) {
      inst.veteranData = undefined;  // revert to recruit
      inst.xp = 0;
      EventBus.emit('veteran-killed', { instanceId: inst.instanceId });
    }
  }
}
```

---

## 5. Name Generation

### New file: `src/state/VeteranNames.ts`

```typescript
const MARINE_FIRST = ['Theron', 'Cato', 'Severus', 'Lucius', 'Maximus', 'Varro', 'Aquila', 'Decimus'];
const MARINE_PREFIX = ['Brother', 'Sergeant', 'Veteran', 'Champion'];

const GUARD_SURNAME = ['Holt', 'Vance', 'Marsh', 'Rennick', 'Stoker', 'Duval', 'Cross'];
const GUARD_PREFIX = ['Private', 'Corporal', 'Trooper'];

const SCOUT_NAME = ['Kael', 'Dusk', 'Rael', 'Crow', 'Nox', 'Sable'];

export function generateVeteranName(cardId: string): string {
  if (cardId === 'marine') {
    return `${pick(MARINE_PREFIX)} ${pick(MARINE_FIRST)}`;
  }
  if (cardId === 'guardsman') {
    return `${pick(GUARD_PREFIX)} ${pick(GUARD_SURNAME)}`;
  }
  if (cardId === 'scout') {
    return `Scout ${pick(SCOUT_NAME)}`;
  }
  if (cardId === 'servitor') {
    return `Servitor-${Math.floor(Math.random() * 9000) + 1000}`;
  }
  return `Veteran ${cardId}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
```

---

## 6. Tech Tree — per-card

### `src/state/TechTree.ts`

`canUnlockNode()` and `unlockNode()` must accept a `CardInstance` instead of reading from global state:

```typescript
export function canUnlockNodeForInstance(nodeId: string, inst: CardInstance): boolean {
  if (inst.veteranData?.unlockedNodes.includes(nodeId)) return false;
  const node = findNode(nodeId);
  if (!node) return false;
  for (const prereq of node.prerequisites) {
    if (!inst.veteranData?.unlockedNodes.includes(prereq)) return false;
  }
  const available = inst.xp - xpSpentByInstance(inst);
  return available >= node.xpCost;
}

export function unlockNodeForInstance(nodeId: string, inst: CardInstance): boolean {
  if (!canUnlockNodeForInstance(nodeId, inst)) return false;
  inst.veteranData!.unlockedNodes.push(nodeId);
  savePlayerState();
  return true;
}

function xpSpentByInstance(inst: CardInstance): number {
  if (!inst.veteranData) return 0;
  return inst.veteranData.unlockedNodes
    .map(id => findNode(id)?.xpCost ?? 0)
    .reduce((a, b) => a + b, 0);
}
```

Keep legacy `canUnlockNode()` / `unlockNode()` signatures as thin wrappers that do nothing (they currently read from the removed global `unlockedNodes` set) — mark them `@deprecated` so they can be cleaned up later.

### `src/state/TechTreeEffects.ts` — `applyTechTreeBonuses()`

Change signature to accept unlocked nodes directly:
```typescript
export function applyTechTreeBonuses(unit: Unit, unlockedNodes: string[]): void {
  // existing logic, but reads from unlockedNodes param instead of global state
}
```

In `CardEffects.ts`, pass `inst.veteranData?.unlockedNodes ?? []` when spawning a veteran unit.

---

## 7. Persistent Wargear

### `src/cards/CardEffects.ts`

After spawning the unit and applying tech bonuses, check for persistent wargear:
```typescript
if (inst?.veteranData?.equippedWargear) {
  const wargearCard = CARD_DATABASE[inst.veteranData.equippedWargear];
  if (wargearCard) applyEquipment(unit, wargearCard);  // existing equipment logic
}
```

Wargear assignment (DeckEditScene or future equip screen): set `inst.veteranData.equippedWargear = cardId`. The wargear card is consumed from collection (qty decremented by 1) when first equipped — it "belongs" to the veteran now. On permadeath, the wargear card is returned to collection.

---

## 8. Visual Distinction

### `src/renderer/EntityRenderer.ts`

When building a unit mesh, check `unit.cardInstanceId` for veteran status:
```typescript
const inst = unit.cardInstanceId ? getCardInstance(unit.cardInstanceId) : undefined;
if (inst?.veteranData) {
  const tier = inst.veteranData.tier;
  const tints = [0xffffff, 0xd4a843, 0xffd700, 0xff9900];  // recruit → hero
  mesh.material.color.setHex(tints[tier]);
}
```

### `src/ui/CommandPanel.ts`

In unit selection panel, if selected unit has a `cardInstanceId` with `veteranData`, replace the generic type description with:
```
[NAME]  ·  Tier: [Veteran/Hero/Battle-Hardened]
Kills: [n]  ·  Missions: [n]
XP: [n] / [next tier threshold]
[Wargear: Power Fist]
```

---

## 9. Battle Honours in GameOverScene

### `src/scenes/GameOverScene.ts`

Listen for `'veteran-promoted'` events during the mission (or collect them in GameScene and pass to GameOverScene via scene data). Render a "Battle Honours" section:

```
━━━ BATTLE HONOURS ━━━
Brother Theron         Promoted to Battle-Hardened
Servitor-4471          First Campaign
```

Also show `'veteran-killed'` as:
```
━━━ FALLEN ━━━
Sergeant Cato          Killed in action  (reverts to Recruit)
```

---

## Files Summary

| File | Changes |
|---|---|
| `src/state/PlayerState.ts` | `CardInstance` / `VeteranData` types, migrate `collection`, add `getCardInstance()`, remove `unitXp` / `unlockedNodes` |
| `src/state/VeteranNames.ts` | **New** — 40K name generator by unit type |
| `src/state/TechTree.ts` | Per-instance `canUnlockNodeForInstance()` / `unlockNodeForInstance()` |
| `src/state/TechTreeEffects.ts` | `applyTechTreeBonuses()` takes `unlockedNodes: string[]` param |
| `src/entities/Unit.ts` | Add `cardInstanceId?: string`, `_deployedThisMission?: boolean` |
| `src/systems/XpTracker.ts` | Write XP to `CardInstance`, kill count, permadeath revert on player unit death |
| `src/cards/CardEffects.ts` | Bind `cardInstanceId` on deploy, apply vet tech bonuses + persistent wargear |
| `src/scenes/GameScene.ts` | Reset `_deployedThisMission` on mission start; call `handleMissionEnd()` |
| `src/renderer/EntityRenderer.ts` | Gold/tier mesh tint for veteran units |
| `src/ui/CommandPanel.ts` | Show veteran name, tier, kills, XP, wargear in selection panel |
| `src/scenes/GameOverScene.ts` | Battle Honours section (promotions + fallen) |
| `src/config.ts` | `MIN_VET_XP_THRESHOLD`, `VET_TIER_THRESHOLDS` |

## Existing Code to Reuse

- `XpTracker.addXp()` — extend to write back to `CardInstance`
- `applyTechTreeBonuses()` in TechTreeEffects — just change the data source
- `EquipmentComponent` / `applyEquipment()` in CardEffects — reuse for persistent wargear auto-apply
- `LevelBadgeComponent.level` — can reflect vet tier instead of global unlock count
- `EventBus` emit/on pattern for `veteran-promoted` / `veteran-killed` events

## Implementation Order

1. **Data model** — `CardInstance` type + `collection` migration in PlayerState. Verify save/load roundtrip.
2. **cardInstanceId binding** — Unit field + CardEffects deploy binding + GameScene reset.
3. **XP write-back** — XpTracker writes to CardInstance. Verify XP accumulates per instance.
4. **Permadeath** — XpTracker clears veteranData on player unit death.
5. **Survivor promotion** — GameScene mission-end handler + `generateVeteranName()`.
6. **Tech tree per-instance** — New `canUnlockNodeForInstance()` + update CardEffects to pass instance unlocks to `applyTechTreeBonuses()`.
7. **Persistent wargear** — Equip logic in CardEffects + wargear return on permadeath.
8. **Visual distinction** — EntityRenderer tint + CommandPanel veteran display.
9. **Battle Honours** — GameOverScene promotions/fallen section.
10. **DeckEditScene** — Visual distinction for veteran card copies.

## Verification

1. **Migration**: Start with old save (collection as counts) → load → collection becomes CardInstance arrays with correct instanceIds. `npm run build` clean.
2. **XP binding**: Deploy a Marine card → fight enemies → check `CardInstance.xp` increases. Deploy second Marine card copy → verify XP is tracked separately.
3. **Name generation**: Survive mission with 30+ XP → GameOverScene Battle Honours shows name. Redeploy same card next mission → unit spawns with name/tint.
4. **Permadeath**: Named veteran dies in battle → card reverts to `veteranData: undefined`, `xp: 0` in PlayerState. GameOverScene shows "Fallen" section.
5. **Tech tree**: Veteran with enough XP → can unlock nodes that apply only to that card copy. Second copy of same card type has no unlocks.
6. **Persistent wargear**: Equip Power Fist to veteran in DeckEditScene → next mission deploy that card → unit spawns already wielding Power Fist without playing wargear card.
7. **Mesh tint**: Tier-1 vet has gold tint, tier-3 has orange tint. Fresh recruits are white/default.
8. `npm run build` — no TypeScript errors.

## Open Questions

- **Wargear permadeath**: When a veteran with persistent wargear dies and reverts, does the wargear card return to collection? (Suggested: yes — it "comes off" the dead veteran.)
- **XP reset on revert**: Should `inst.xp` reset to 0 on permadeath, or keep accumulating from the next deployment? (Suggested: reset, so the "fresh recruit" truly starts over.)
- **Trained units**: Units trained from Barracks have no `cardInstanceId` — they can never become veterans. This is intentional: card units are elite, trained units are cannon fodder.
- **Name collision**: Two Marines could theoretically get the same auto-generated name. Track used names in PlayerState to prevent duplicates?
