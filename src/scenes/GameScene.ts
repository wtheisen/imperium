import { EventBus } from '../EventBus';
import { AudioManager } from '../audio/AudioManager';
import { MapManager } from '../map/MapManager';
import { PlacementValidator } from '../map/PlacementValidator';
import { IsoHelper } from '../map/IsoHelper';
import { PathfindingSystem } from '../systems/PathfindingSystem';
import { EntityManager } from '../systems/EntityManager';
import { SelectionSystem } from '../systems/SelectionSystem';
import { CommandSystem } from '../systems/CommandSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { MissionSystem } from '../systems/MissionSystem';
import { CardEffects } from '../cards/CardEffects';
import { EnemyAI } from '../ai/EnemyAI';
import { EnemyPlacement } from '../ai/EnemyPlacement';
import { FogOfWarSystem } from '../systems/FogOfWarSystem';
import { SpawnerSystem } from '../systems/SpawnerSystem';
import { HealthComponent } from '../components/HealthComponent';
import { EquipmentComponent } from '../components/EquipmentComponent';
import { Card } from '../cards/Card';
import { Building } from '../entities/Building';
import { MissionDefinition } from '../missions/MissionDefinition';
import { ObjectiveMarker } from '../missions/ObjectiveMarker';
import { MISSIONS } from '../missions/MissionDatabase';
import { SupplyPod } from '../entities/SupplyPod';
import { XpTracker } from '../systems/XpTracker';
import { TutorialSystem } from '../systems/TutorialSystem';
import { TimerManager } from '../utils/TimerManager';
import { InputEvent } from '../renderer/InputBridge';
import { GameSceneInterface, getSceneManager } from './SceneManager';
import { getGameRenderer } from '../renderer/GameRenderer';
import { getActiveModifiers, getCardInstance, resetDeployedFlags, savePlayerState } from '../state/PlayerState';
import { generateVeteranName } from '../state/VeteranNames';
import { VET_TIER_THRESHOLDS, MIN_VET_XP_THRESHOLD } from '../config';
import { Unit } from '../entities/Unit';
import { getCachedMergedEffects } from '../state/DifficultyModifiers';
import { POIManager } from '../systems/POIManager';
import { PackManager } from '../systems/PackManager';
import { resolveEnvironmentModifiers, EnvironmentEffects } from '../systems/EnvironmentModifierSystem';
import { CARD_DATABASE } from '../cards/CardDatabase';
import { PACK_BURN_GOLD_MULTIPLIER } from '../config';
import { TacticalPauseManager } from '../systems/TacticalPauseManager';
import { ScoutRevealSystem } from '../systems/ScoutRevealSystem';
import { BattleRecorder } from '../systems/BattleRecorder';
import { MutatorEffectsSystem } from '../systems/MutatorEffectsSystem';

export class GameScene implements GameSceneInterface {
  id = 'GameScene';

  private mapManager!: MapManager;
  private validator!: PlacementValidator;
  private pathfinding!: PathfindingSystem;
  private entityManager!: EntityManager;
  private selectionSystem!: SelectionSystem;
  private commandSystem!: CommandSystem;
  private combatSystem!: CombatSystem;
  private economySystem!: EconomySystem;
  private missionSystem!: MissionSystem;
  private cardEffects!: CardEffects;
  private enemyAI!: EnemyAI;
  private fogOfWar!: FogOfWarSystem;
  private spawnerSystem!: SpawnerSystem;
  private xpTracker!: XpTracker;
  private audioManager!: AudioManager;
  private pendingCard: any = null;
  private pendingFromKeyboard: boolean = false;
  private pendingShipOrdnance: { card: Card; slotIndex: number } | null = null;
  private townHall: Building | null = null;
  private mission!: MissionDefinition;
  private objectiveMarkers: ObjectiveMarker[] = [];
  private supplyPods: SupplyPod[] = [];
  private supplyPodIdCounter = 0;
  private tutorialSystem!: TutorialSystem;
  private paused: boolean = false;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  private poiManager: POIManager | null = null;
  private packManager: PackManager | null = null;
  private takenPackCards: string[] = [];
  private envEffects: EnvironmentEffects | null = null;
  private mutatorEffects: MutatorEffectsSystem | null = null;
  private fallenVeterans: { name: string }[] = [];
  private tacticalPause!: TacticalPauseManager;
  private scoutReveal: ScoutRevealSystem | null = null;
  private battleRecorder!: BattleRecorder;

  create(data?: { mission?: MissionDefinition }): void {
    this.mission = data?.mission || MISSIONS[0];

    // Setup map
    this.mapManager = new MapManager();
    this.mapManager.loadMissionTerrain(this.mission);
    this.validator = new PlacementValidator(this.mapManager);


    // Feed terrain data to the 3D renderer (include protected positions for decorations)
    const protectedPositions: { x: number; y: number; radius: number }[] = [];
    protectedPositions.push({ x: this.mission.playerStartX, y: this.mission.playerStartY, radius: 5 });
    for (const camp of this.mission.enemyCamps) {
      protectedPositions.push({ x: camp.tileX, y: camp.tileY, radius: 3 });
    }
    for (const obj of this.mission.objectives) {
      protectedPositions.push({ x: obj.tileX, y: obj.tileY, radius: 3 });
    }
    if (this.mission.goldMines) {
      for (const mine of this.mission.goldMines) {
        protectedPositions.push({ x: mine.tileX, y: mine.tileY, radius: 2 });
      }
    }
    EventBus.emit('terrain-ready', {
      terrainGrid: this.mapManager.getTerrainGrid(),
      protectedPositions,
      mapType: this.mission.terrain?.mapType,
    });

    // Emit gold mine positions for 3D models
    const mines = this.mapManager.getAllMines();
    for (const mine of mines) {
      EventBus.emit('gold-mine-3d', mine);
    }

    // Setup pathfinding
    this.pathfinding = new PathfindingSystem();
    this.pathfinding.setGrid(this.mapManager.getWalkabilityGrid());

    // Setup entity management
    this.entityManager = new EntityManager(this.validator);

    // Setup economy with mission starting gold
    this.economySystem = new EconomySystem(this.mission.startingGold);

    // Setup card effects
    this.cardEffects = new CardEffects(this.entityManager, this.economySystem);

    // Setup RTS controls
    this.selectionSystem = new SelectionSystem(this.entityManager);
    this.commandSystem = new CommandSystem(this.selectionSystem, this.pathfinding, this.entityManager, this.mapManager);

    // Setup tactical pause
    this.tacticalPause = new TacticalPauseManager();
    this.commandSystem.setTacticalPause(this.tacticalPause);

    // Setup combat
    this.combatSystem = new CombatSystem(this.entityManager);

    // Setup mission system
    this.missionSystem = new MissionSystem(this.entityManager, this.mission);
    this.enemyAI = new EnemyAI(this.entityManager, this.pathfinding);

    // Spawn landing craft at drop site and center camera
    this.spawnLandingCraft();
    EventBus.emit('minimap-pan', { tileX: this.mission.playerStartX, tileY: this.mission.playerStartY });

    // Resolve environment modifiers before enemy placement so HP/damage multipliers apply
    this.envEffects = resolveEnvironmentModifiers(this.mission.environmentModifiers);
    this.entityManager.setEnvironmentEffects(this.envEffects);
    this.cardEffects.setEnvironmentEffects(this.envEffects);

    // Place enemy camps from mission definition
    EnemyPlacement.populate(this.mission, this.entityManager);

    // Setup active mutator effects (iron_rain, toxic_atmosphere, etc.)
    this.mutatorEffects = new MutatorEffectsSystem(this.entityManager, this.envEffects);

    // Emit active modifiers for in-game HUD
    if (this.mission.environmentModifiers && this.mission.environmentModifiers.length > 0) {
      EventBus.emit('active-mutators', { modifiers: this.mission.environmentModifiers });
    }

    // Setup spawner system for continuous enemy production
    this.spawnerSystem = new SpawnerSystem(this.entityManager, this.mission.enemyCamps);

    // Setup POI manager — merge mission-defined + procedurally generated
    const generatedPOIs = this.mapManager.getGeneratedPOIs();
    const allPOIs = [...(this.mission.pointsOfInterest ?? []), ...generatedPOIs];
    this.poiManager = new POIManager(this.entityManager, allPOIs);

    // Setup pack manager — merge mission-defined + procedurally generated
    const generatedPacks = this.mapManager.getGeneratedPacks();
    const allPacks = [...(this.mission.packSpawns ?? []), ...generatedPacks];
    this.packManager = new PackManager(this.entityManager, allPacks);

    // Create objective markers for required + optional objectives
    for (const obj of this.mission.objectives) {
      this.objectiveMarkers.push(new ObjectiveMarker(obj));
    }
    if (this.mission.optionalObjectives) {
      for (const obj of this.mission.optionalObjectives) {
        this.objectiveMarkers.push(new ObjectiveMarker(obj));
      }
    }
    // Emit collect item markers for collect objectives
    for (const obj of [...this.mission.objectives, ...(this.mission.optionalObjectives ?? [])]) {
      if (obj.type === 'collect' && obj.collectPositions) {
        for (let i = 0; i < obj.collectPositions.length; i++) {
          const pos = obj.collectPositions[i];
          EventBus.emit('collect-marker-3d', {
            objectiveId: obj.id, posIndex: i,
            tileX: pos.tileX, tileY: pos.tileY,
          });
        }
      }
    }

    // Reset per-mission deploy tracking on all card instances
    resetDeployedFlags();

    // Setup XP tracking
    this.xpTracker = new XpTracker();

    // Setup battle recorder for after-action report
    this.battleRecorder = new BattleRecorder();

    // Setup fog of war
    this.fogOfWar = new FogOfWarSystem(this.entityManager);

    // Setup scout reveal system — alerts when fog reveals key features
    this.scoutReveal = new ScoutRevealSystem(
      this.mission.enemyCamps,
      mines,
      allPOIs,
      allPacks.map(p => ({ tileX: p.tileX, tileY: p.tileY })),
    );

    // EventBus listeners
    EventBus.on('card-drag-start', this.onCardDragStart, this);
    EventBus.on('card-drag-released', this.onCardDragReleased, this);
    EventBus.on('card-drag-move', this.onCardDragMove, this);
    EventBus.on('card-drag-cancel', this.onCardDragCancel, this);
    EventBus.on('building-placed', this.onBuildingPlaced, this);
    EventBus.on('entity-died', this.onEntityDied, this);
    EventBus.on('card-played', this.onCardPlayed, this);
    EventBus.on('mission-complete', this.onMissionComplete, this);
    EventBus.on('supply-pod-incoming', this.onSupplyPodIncoming, this);
    EventBus.on('pan-to-objective', this.onPanToObjective, this);
    EventBus.on('tech-cleave', this.onTechCleave, this);
    EventBus.on('unequip-wargear', this.onUnequipWargear, this);
    EventBus.on('wargear-orphaned', this.onWargearOrphaned, this);
    EventBus.on('objective-completed', this.onObjectiveCompleted, this);
    EventBus.on('mine-tick', this.onMineTick, this);
    EventBus.on('veteran-killed', this.onVeteranKilled, this);
    EventBus.on('input-pointer-move', this.onInputMove3D, this);
    EventBus.on('input-pointer-down', this.onInputDown3D, this);
    EventBus.on('ordnance-vfx-3d', this.onOrdnanceVfx, this);
    EventBus.on('entity-died', this.onEntityDiedCameraShake, this);
    EventBus.on('pack-decision', this.onPackDecision, this);

    // Audio
    this.audioManager = new AudioManager();

    // Launch UI scene (pass pre-built deck from drop site if available)
    getSceneManager().launch('UIScene', { mission: this.mission, deck: (data as any)?.deck });

    // Tutorial system (only active on first mission)
    this.tutorialSystem = new TutorialSystem();

    // Emit terrain data for Minimap (created by UIScene above, so it's now listening)
    EventBus.emit('minimap-terrain', this.mapManager.getTerrainGrid());

    // Context menu prevention
    const canvas = document.querySelector('canvas');
    if (canvas) canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Escape key
    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.pendingFromKeyboard) {
        const ci = this.pendingCard?.cardIndex ?? -1;
        this.pendingCard = null;
        this.pendingFromKeyboard = false;
        this.pendingShipOrdnance = null;
        EventBus.emit('placement-preview-3d', { tileX: 0, tileY: 0, valid: false, visible: false });
        if (ci >= 0) EventBus.emit('card-play-failed', { reason: 'cancelled', cardIndex: ci });
      }
      if (e.key === 'p' || e.key === 'P') {
        this.paused = !this.paused;
        if (this.paused) {
          this.tacticalPause.pause();
          EventBus.emit('game-paused');
        } else {
          // Flush all queued tactical orders before resuming
          this.flushTacticalPauseQueue();
          this.tacticalPause.resume();
          EventBus.emit('game-resumed');
        }
      }
    };
    document.addEventListener('keydown', this.escHandler);
  }

  private spawnLandingCraft(): void {
    this.townHall = this.entityManager.spawnBuilding(
      this.mission.playerStartX, this.mission.playerStartY,
      'drop_ship',
      { maxHp: 200, tileWidth: 2, tileHeight: 2 },
      'player'
    );
  }

  // ── 3D Input Handlers ──────────────────────────────────────

  private onInputMove3D(evt: InputEvent): void {
    if (evt.tileX >= 0 && evt.tileY >= 0) {
      EventBus.emit('tile-hover-3d', { tileX: evt.tileX, tileY: evt.tileY, visible: true });
      if (this.mapManager.isGoldMine(evt.tileX, evt.tileY)) {
        const remaining = this.mapManager.getMineRemaining(evt.tileX, evt.tileY);
        EventBus.emit('mine-tooltip-3d', { tileX: evt.tileX, tileY: evt.tileY, remaining, visible: true });
      } else {
        EventBus.emit('mine-tooltip-3d', { tileX: 0, tileY: 0, remaining: 0, visible: false });
      }

      // Show placement preview when a card is selected via keyboard
      if (this.pendingCard && this.pendingFromKeyboard && IsoHelper.isInBounds(evt.tileX, evt.tileY)) {
        const card = this.pendingCard.card;
        const w = card.tileWidth || 1;
        const h = card.tileHeight || 1;
        const canPlace = card.type === 'ordnance'
          ? true
          : card.type === 'equipment'
            ? this.hasEquippableUnitNear(evt.tileX, evt.tileY, card)
            : this.validator.canPlace(evt.tileX, evt.tileY, w, h);
        const unitStats = card.entityType ? CardEffects.getUnitStats(card.entityType) : undefined;
        EventBus.emit('placement-preview-3d', {
          tileX: evt.tileX, tileY: evt.tileY, valid: canPlace, visible: true,
          cardType: card.type, entityType: card.entityType, cardName: card.name,
          squadSize: unitStats?.squadSize || 1,
          ordnanceRadius: card.ordnanceRadius,
        });
      }
    } else {
      EventBus.emit('tile-hover-3d', { tileX: 0, tileY: 0, visible: false });
      EventBus.emit('mine-tooltip-3d', { tileX: 0, tileY: 0, remaining: 0, visible: false });

      if (this.pendingCard && this.pendingFromKeyboard) {
        EventBus.emit('placement-preview-3d', { tileX: 0, tileY: 0, valid: false, visible: false });
      }
    }
  }

  private onInputDown3D(evt: InputEvent): void {
    if (evt.button !== 0) return;
    if (!this.pendingCard || !this.pendingFromKeyboard) return;

    EventBus.emit('placement-preview-3d', { tileX: 0, tileY: 0, valid: false, visible: false });

    if (evt.tileX < 0 || !IsoHelper.isInBounds(evt.tileX, evt.tileY)) {
      if (!this.pendingShipOrdnance) {
        EventBus.emit('card-play-failed', { reason: 'out-of-bounds', cardIndex: this.pendingCard?.cardIndex ?? -1 });
      }
      this.pendingCard = null;
      this.pendingFromKeyboard = false;
      this.pendingShipOrdnance = null;
      return;
    }

    // Ship ordnance: bypass gold cost, use castOrdnance directly
    if (this.pendingShipOrdnance) {
      const { card, slotIndex } = this.pendingShipOrdnance;
      if (this.tacticalPause.paused) {
        this.tacticalPause.queueCardPlay({
          card, cardIndex: -1, tileX: evt.tileX, tileY: evt.tileY,
          isShipOrdnance: true, slotIndex,
        });
      } else {
        const success = this.cardEffects.castOrdnance(card, evt.tileX, evt.tileY);
        if (success) {
          EventBus.emit('ship-ordnance-fired', { slotIndex });
          EventBus.emit('card-played-3d-vfx', { tileX: evt.tileX, tileY: evt.tileY, cardType: 'ordnance' });
        }
      }
      this.pendingShipOrdnance = null;
      this.pendingCard = null;
      this.pendingFromKeyboard = false;
      return;
    }

    const card = this.pendingCard.card;
    const ci = this.pendingCard.cardIndex;

    if (this.tacticalPause.paused) {
      // Queue the card play for execution on unpause, checking projected gold
      if (this.tacticalPause.getProjectedGoldRemaining(this.economySystem.getGold()) < (card.cost ?? 0)) {
        EventBus.emit('card-play-failed', { reason: 'insufficient-gold', cardIndex: ci });
        this.pendingCard = null;
        this.pendingFromKeyboard = false;
        return;
      }
      this.tacticalPause.queueCardPlay({ card, cardIndex: ci, tileX: evt.tileX, tileY: evt.tileY });
      this.pendingCard = null;
      this.pendingFromKeyboard = false;
      return;
    }

    const success = this.cardEffects.execute(card, evt.tileX, evt.tileY);
    if (success) {
      EventBus.emit('card-played', { card, cardIndex: ci, tileX: evt.tileX, tileY: evt.tileY });
    } else {
      EventBus.emit('card-play-failed', { reason: 'cannot-place', cardIndex: ci });
    }

    this.pendingCard = null;
    this.pendingFromKeyboard = false;
  }

  private hasEquippableUnitNear(tileX: number, tileY: number, card: any): boolean {
    for (const u of this.entityManager.getUnits('player')) {
      if (!u.active) continue;
      if (card.equipFilter) {
        const allowed = card.equipFilter.split(',').map((s: string) => s.trim());
        if (!allowed.includes(u.unitType)) continue;
      }
      if (Math.abs(u.tileX - tileX) + Math.abs(u.tileY - tileY) <= 1) {
        const eq = u.getComponent('equipment') as any;
        if (!eq || eq.hasSlot()) return true;
      }
    }
    return false;
  }

  private onCardDragStart(data: any): void {
    if (data.isShipOrdnance) {
      this.pendingShipOrdnance = { card: data.card, slotIndex: data.slotIndex };
      this.pendingCard = data;
      this.pendingFromKeyboard = true;
      return;
    }
    this.pendingCard = data;
    this.pendingFromKeyboard = !data.screenX;
  }

  private onCardDragReleased(data: { card: any; cardIndex: number; screenX: number; screenY: number; isShipOrdnance?: boolean; slotIndex?: number }): void {
    EventBus.emit('placement-preview-3d', { tileX: 0, tileY: 0, valid: false, visible: false });

    const tile = getGameRenderer().inputBridge.screenToTile(data.screenX, data.screenY);
    if (!tile || !IsoHelper.isInBounds(tile.tileX, tile.tileY)) {
      if (!data.isShipOrdnance) {
        EventBus.emit('card-play-failed', { reason: 'out-of-bounds', cardIndex: data.cardIndex });
      }
      this.pendingCard = null;
      this.pendingShipOrdnance = null;
      return;
    }

    // Ship ordnance via drag
    if (data.isShipOrdnance && data.slotIndex !== undefined) {
      if (this.tacticalPause.paused) {
        this.tacticalPause.queueCardPlay({
          card: data.card, cardIndex: -1, tileX: tile.tileX, tileY: tile.tileY,
          isShipOrdnance: true, slotIndex: data.slotIndex,
        });
      } else {
        const success = this.cardEffects.castOrdnance(data.card, tile.tileX, tile.tileY);
        if (success) {
          EventBus.emit('ship-ordnance-fired', { slotIndex: data.slotIndex });
          EventBus.emit('card-played-3d-vfx', { tileX: tile.tileX, tileY: tile.tileY, cardType: 'ordnance' });
        }
      }
      this.pendingCard = null;
      this.pendingShipOrdnance = null;
      return;
    }

    if (this.tacticalPause.paused) {
      if (this.tacticalPause.getProjectedGoldRemaining(this.economySystem.getGold()) < (data.card.cost ?? 0)) {
        EventBus.emit('card-play-failed', { reason: 'insufficient-gold', cardIndex: data.cardIndex });
        this.pendingCard = null;
        return;
      }
      this.tacticalPause.queueCardPlay({
        card: data.card, cardIndex: data.cardIndex, tileX: tile.tileX, tileY: tile.tileY,
      });
      this.pendingCard = null;
      return;
    }

    const success = this.cardEffects.execute(data.card, tile.tileX, tile.tileY);
    if (success) {
      EventBus.emit('card-played', { card: data.card, cardIndex: data.cardIndex, tileX: tile.tileX, tileY: tile.tileY });
    } else {
      EventBus.emit('card-play-failed', { reason: 'cannot-place', cardIndex: data.cardIndex });
    }
    this.pendingCard = null;
  }

  private onCardDragMove(data: any): void {
    this.pendingCard = data;
    const tile = getGameRenderer().inputBridge.screenToTile(data.screenX, data.screenY);
    if (tile && IsoHelper.isInBounds(tile.tileX, tile.tileY)) {
      const card = data.card;
      const w = card.tileWidth || 1;
      const h = card.tileHeight || 1;
      const canPlace = card.type === 'ordnance'
        ? true
        : card.type === 'equipment'
          ? this.hasEquippableUnitNear(tile.tileX, tile.tileY, card)
          : this.validator.canPlace(tile.tileX, tile.tileY, w, h);
      const unitStats = card.entityType ? CardEffects.getUnitStats(card.entityType) : undefined;
      EventBus.emit('placement-preview-3d', {
        tileX: tile.tileX, tileY: tile.tileY, valid: canPlace, visible: true,
        cardType: card.type, entityType: card.entityType, cardName: card.name,
        squadSize: unitStats?.squadSize || 1,
        ordnanceRadius: card.ordnanceRadius,
      });
    } else {
      EventBus.emit('placement-preview-3d', { tileX: 0, tileY: 0, valid: false, visible: false });
    }
  }

  private onCardDragCancel(): void {
    this.pendingCard = null;
    this.pendingFromKeyboard = false;
    this.pendingShipOrdnance = null;
    EventBus.emit('placement-preview-3d', { tileX: 0, tileY: 0, valid: false, visible: false });
  }

  private onBuildingPlaced({ tiles }: { building: Building; tiles: { x: number; y: number }[] }): void {
    for (const tile of tiles) {
      this.pathfinding.setTileWalkable(tile.x, tile.y, false);
    }
  }

  private onCardPlayed({ card, tileX, tileY }: { card: any; cardIndex: number; tileX: number; tileY: number }): void {
    EventBus.emit('card-played-3d-vfx', { tileX, tileY, cardType: card.type });
  }

  private onEntityDied({ entity }: { entity: any }): void {
    if (entity === this.townHall) {
      this.xpTracker.commitToPlayerState();
      const battleHonours = this.processSurvivors();
      const sm = getSceneManager();
      sm.stop('UIScene');
      sm.stop('GameScene');
      sm.start('GameOverScene', {
        victory: false,
        missionId: this.mission.id,
        mission: this.mission,
        missionName: this.mission.name,
        objectivesCompleted: this.missionSystem.objectiveStatuses.filter((s) => s.completed).length,
        totalObjectives: this.missionSystem.objectiveStatuses.length,
        sessionXp: this.xpTracker.getSessionXp(),
        takenPackCards: this.takenPackCards,
        battleHonours,
        battleReport: this.battleRecorder.getReport(),
      });
      return;
    }

    if (entity) {
      EventBus.emit('entity-died-3d-vfx', { tileX: entity.tileX, tileY: entity.tileY, team: entity.team });
    }
  }

  /**
   * Process survivors at mission end: promote qualifying units to veterans
   * or advance existing veterans. Returns battle honours data for GameOverScene.
   */
  private processSurvivors(): { promoted: { name: string; cardId: string }[]; fallen: { name: string }[] } {
    const promoted: { name: string; cardId: string }[] = [];
    const fallen: { name: string }[] = [];

    const survivors = this.entityManager.getUnits('player')
      .filter(u => u.active && u.cardInstanceId);

    for (const unit of survivors) {
      const inst = getCardInstance(unit.cardInstanceId!);
      if (!inst) continue;

      // Must earn minimum XP this mission to qualify
      if (inst.xp < MIN_VET_XP_THRESHOLD) continue;

      const newTier = VET_TIER_THRESHOLDS.reduce<1 | 2 | 3>(
        (best, threshold, i) => inst.xp >= threshold && i >= 1 ? (i as 1 | 2 | 3) : best,
        1
      );

      if (!inst.veteranData) {
        // First promotion — generate a name
        const name = generateVeteranName(inst.cardId);
        inst.veteranData = {
          name,
          tier: newTier,
          kills: 0,
          missionsCompleted: 1,
          unlockedNodes: [],
        };
        promoted.push({ name, cardId: inst.cardId });
        EventBus.emit('veteran-promoted', { instanceId: inst.instanceId, name });
      } else {
        inst.veteranData.missionsCompleted += 1;
        if (newTier > inst.veteranData.tier) {
          inst.veteranData.tier = newTier;
        }
      }
    }

    savePlayerState();
    return { promoted, fallen: [...this.fallenVeterans] };
  }

  private onMissionComplete(data: any): void {
    this.xpTracker.commitToPlayerState();
    const battleHonours = this.processSurvivors();
    const sm = getSceneManager();
    sm.stop('UIScene');
    sm.stop('GameScene');

    const missionData = {
      victory: true,
      missionId: this.mission.id,
      mission: this.mission,
      missionName: this.mission.name,
      objectivesCompleted: this.missionSystem.objectiveStatuses.length,
      totalObjectives: this.missionSystem.objectiveStatuses.length,
      optionalCompleted: data?.optionalCompleted ?? 0,
      optionalTotal: data?.optionalTotal ?? 0,
      sessionXp: this.xpTracker.getSessionXp(),
      takenPackCards: this.takenPackCards,
      battleHonours,
      battleReport: this.battleRecorder.getReport(),
    };

    if (this.takenPackCards.length > 0) {
      sm.start('SalvageScene', missionData);
    } else {
      sm.start('GameOverScene', missionData);
    }
  }

  private onSupplyPodIncoming(data: { tileX: number; tileY: number; gold: number; cardDraws: number }): void {
    // Block supply drops if modifier is active (player skulls or environment)
    const effects = getCachedMergedEffects(getActiveModifiers);
    if (effects.noSupplyDrops) return;
    if (this.envEffects?.noSupplyDrops) return;
    const podId = `pod-${++this.supplyPodIdCounter}`;
    EventBus.emit('supply-pod-3d', { id: podId, tileX: data.tileX, tileY: data.tileY });
    const pod = new SupplyPod(data.tileX, data.tileY, data.gold, data.cardDraws);
    (pod as any).__podId3D = podId;
    this.supplyPods.push(pod);
  }

  private onObjectiveCompleted(_data: any): void {
    EventBus.emit('reset-discards', { bonus: 0 });
  }

  private onVeteranKilled({ name }: { name: string }): void {
    this.fallenVeterans.push({ name });
  }

  private onMineTick({ mineX, mineY }: { mineX: number; mineY: number }): void {
    this.mapManager.depleteMine(mineX, mineY, 1);
    // Update 3D mine model
    const remaining = this.mapManager.getMineRemaining(mineX, mineY);
    const ratio = this.mapManager.getMineRatio(mineX, mineY);
    EventBus.emit('gold-mine-update-3d', { tileX: mineX, tileY: mineY, remaining, ratio });
  }

  private onTechCleave({ tileX, tileY, damage, source }: { tileX: number; tileY: number; damage: number; source: any }): void {
    for (const enemy of this.entityManager.getEntitiesByTeam('enemy')) {
      if (!enemy.active) continue;
      if (Math.abs(enemy.tileX - tileX) + Math.abs(enemy.tileY - tileY) <= 1) {
        const health = enemy.getComponent<HealthComponent>('health');
        if (health) health.takeDamage(damage, source);
      }
    }
  }

  private onUnequipWargear({ unit, slotIndex }: { unit: any; slotIndex: number }): void {
    const equipComp = unit.getComponent('equipment') as EquipmentComponent | undefined;
    if (!equipComp) return;
    const card = equipComp.unequip(slotIndex);
    if (card) EventBus.emit('wargear-return-to-hand', { card });
  }

  private onWargearOrphaned({ card }: { card: Card }): void {
    EventBus.emit('wargear-to-discard', { card });
  }

  private onOrdnanceVfx(_data: any): void {
    getGameRenderer().cameraController.shake(0.15, 300);
  }

  private onEntityDiedCameraShake({ entity }: { entity: any }): void {
    // Shake on boss-type enemy deaths (Nobs, buildings)
    if (entity?.team === 'enemy') {
      const health = entity.getComponent?.('health');
      if (health && health.maxHp >= 80) {
        getGameRenderer().cameraController.shake(0.1, 200);
      }
    }
  }

  private onPackDecision({ packId, decisions }: { packId: string; decisions: { cardId: string; action: string }[] }): void {
    for (const d of decisions) {
      if (d.action === 'take') {
        this.takenPackCards.push(d.cardId);
        // Add card to deck mid-mission (goes to discard pile)
        EventBus.emit('pack-card-taken', { cardId: d.cardId });
      } else {
        // Burn for gold
        const card = CARD_DATABASE[d.cardId];
        const burnGold = card ? card.cost * PACK_BURN_GOLD_MULTIPLIER : 5;
        this.economySystem.addGold(burnGold);
      }
    }
  }

  private onPanToObjective({ tileX, tileY }: { tileX: number; tileY: number }): void {
    getGameRenderer().cameraController.panTo(tileX, tileY);
  }

  private flushTacticalPauseQueue(): void {
    const { orders, cardPlays } = this.tacticalPause.flush();

    // Execute queued unit orders
    for (const order of orders) {
      this.commandSystem.executeQueuedOrder(order);
    }

    // Execute queued card plays
    for (const play of cardPlays) {
      if (play.isShipOrdnance) {
        const success = this.cardEffects.castOrdnance(play.card, play.tileX, play.tileY);
        if (success && play.slotIndex !== undefined) {
          EventBus.emit('ship-ordnance-fired', { slotIndex: play.slotIndex });
          EventBus.emit('card-played-3d-vfx', { tileX: play.tileX, tileY: play.tileY, cardType: 'ordnance' });
        }
      } else {
        const success = this.cardEffects.execute(play.card, play.tileX, play.tileY);
        if (success) {
          EventBus.emit('card-played', { card: play.card, cardIndex: play.cardIndex, tileX: play.tileX, tileY: play.tileY });
        }
      }
    }
  }

  update(delta: number): void {
    if (this.paused) {
      // Still sync entities so renderer keeps drawing, but skip all game logic
      EventBus.emit('entities-sync', this.entityManager.getAllEntities());
      return;
    }

    // Update timers
    TimerManager.get().update(delta);

    this.entityManager.update(delta);
    this.combatSystem.update(delta);
    this.economySystem.update(delta);
    this.missionSystem.update(delta);
    this.enemyAI.update(delta);
    this.fogOfWar.update(delta);
    this.spawnerSystem.update(delta);
    this.mutatorEffects?.update(delta);
    this.pathfinding.update();
    this.commandSystem.update(delta);
    this.selectionSystem.update(delta);
    if (this.poiManager) this.poiManager.update();
    if (this.packManager) this.packManager.update();

    // Sync entities to 3D renderer
    EventBus.emit('entities-sync', this.entityManager.getAllEntities());

    // Update objective markers
    for (const marker of this.objectiveMarkers) {
      marker.update(delta);
    }

    this.checkSupplyPodPickup();
  }

  private checkSupplyPodPickup(): void {
    if (this.supplyPods.length === 0) return;
    const playerUnits = this.entityManager.getUnits('player');
    for (let i = this.supplyPods.length - 1; i >= 0; i--) {
      const pod = this.supplyPods[i];
      if (pod.opened) { this.supplyPods.splice(i, 1); continue; }
      for (const unit of playerUnits) {
        if (!unit.active) continue;
        if (Math.abs(unit.tileX - pod.tileX) <= 1 && Math.abs(unit.tileY - pod.tileY) <= 1) {
          const podId = (pod as any).__podId3D;
          if (podId) EventBus.emit('supply-pod-opened-3d', { id: podId });
          pod.open();
          EventBus.emit('supply-drop', { gold: pod.gold, cardDraws: pod.cardDraws });
          this.supplyPods.splice(i, 1);
          break;
        }
      }
    }
  }

  shutdown(): void {
    EventBus.off('card-drag-start', this.onCardDragStart, this);
    EventBus.off('card-drag-released', this.onCardDragReleased, this);
    EventBus.off('card-drag-move', this.onCardDragMove, this);
    EventBus.off('card-drag-cancel', this.onCardDragCancel, this);
    EventBus.off('building-placed', this.onBuildingPlaced, this);
    EventBus.off('entity-died', this.onEntityDied, this);
    EventBus.off('card-played', this.onCardPlayed, this);
    EventBus.off('mission-complete', this.onMissionComplete, this);
    EventBus.off('supply-pod-incoming', this.onSupplyPodIncoming, this);
    EventBus.off('pan-to-objective', this.onPanToObjective, this);
    EventBus.off('tech-cleave', this.onTechCleave, this);
    EventBus.off('unequip-wargear', this.onUnequipWargear, this);
    EventBus.off('wargear-orphaned', this.onWargearOrphaned, this);
    EventBus.off('objective-completed', this.onObjectiveCompleted, this);
    EventBus.off('mine-tick', this.onMineTick, this);
    EventBus.off('veteran-killed', this.onVeteranKilled, this);
    EventBus.off('input-pointer-move', this.onInputMove3D, this);
    EventBus.off('input-pointer-down', this.onInputDown3D, this);
    EventBus.off('ordnance-vfx-3d', this.onOrdnanceVfx, this);
    EventBus.off('entity-died', this.onEntityDiedCameraShake, this);
    EventBus.off('pack-decision', this.onPackDecision, this);
    this.packManager?.destroy();

    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }

    for (const marker of this.objectiveMarkers) marker.destroy();
    this.objectiveMarkers = [];
    for (const pod of this.supplyPods) pod.destroy();
    this.supplyPods = [];

    if (this.tacticalPause?.paused) {
      this.tacticalPause.resume();
      EventBus.emit('game-resumed');
    }
    this.tacticalPause?.clear();
    this.paused = false;

    this.poiManager?.destroy();
    this.tutorialSystem?.destroy();
    this.audioManager?.destroy();
    this.battleRecorder?.destroy();
    this.xpTracker?.destroy();
    this.spawnerSystem?.destroy();
    this.mutatorEffects?.destroy();
    this.scoutReveal?.destroy();
    this.fogOfWar?.destroy();
    this.entityManager?.destroy();
    this.economySystem?.destroy();
    this.missionSystem?.destroy();
    this.selectionSystem?.destroy();
    this.commandSystem?.destroy();
    this.combatSystem?.destroy();

    TimerManager.get().clear();
  }
}
