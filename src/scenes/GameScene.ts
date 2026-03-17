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
import { DoctrineManager } from '../cards/DoctrineManager';
import { EnemyAI } from '../ai/EnemyAI';
import { EnemyPlacement } from '../ai/EnemyPlacement';
import { FogOfWarSystem } from '../systems/FogOfWarSystem';
import { HealthComponent } from '../components/HealthComponent';
import { EquipmentComponent } from '../components/EquipmentComponent';
import { Card } from '../cards/Card';
import { Building } from '../entities/Building';
import { MissionDefinition } from '../missions/MissionDefinition';
import { ObjectiveMarker } from '../missions/ObjectiveMarker';
import { MISSIONS } from '../missions/MissionDatabase';
import { SupplyPod } from '../entities/SupplyPod';
import { XpTracker } from '../systems/XpTracker';
import { TimerManager } from '../utils/TimerManager';
import { InputEvent } from '../renderer/InputBridge';
import { GameSceneInterface, getSceneManager } from './SceneManager';

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
  private doctrineManager!: DoctrineManager;
  private enemyAI!: EnemyAI;
  private fogOfWar!: FogOfWarSystem;
  private xpTracker!: XpTracker;
  private audioManager!: AudioManager;
  private pendingCard: any = null;
  private pendingFromKeyboard: boolean = false;
  private townHall: Building | null = null;
  private mission!: MissionDefinition;
  private objectiveMarkers: ObjectiveMarker[] = [];
  private supplyPods: SupplyPod[] = [];
  private supplyPodIdCounter = 0;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  create(data?: { mission?: MissionDefinition }): void {
    this.mission = data?.mission || MISSIONS[0];

    // Setup map
    this.mapManager = new MapManager();
    this.mapManager.loadMissionTerrain(this.mission);
    this.validator = new PlacementValidator(this.mapManager);
    this.mapManager.render();

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
    this.doctrineManager = new DoctrineManager();

    // Setup card effects
    this.cardEffects = new CardEffects(this.entityManager, this.economySystem, this.doctrineManager);

    // Setup RTS controls
    this.selectionSystem = new SelectionSystem(this.entityManager);
    this.commandSystem = new CommandSystem(this.selectionSystem, this.pathfinding, this.entityManager, this.mapManager);

    // Setup combat
    this.combatSystem = new CombatSystem(this.entityManager);

    // Setup mission system
    this.missionSystem = new MissionSystem(this.entityManager, this.mission);
    this.enemyAI = new EnemyAI(this.entityManager, this.pathfinding);

    // Spawn landing craft at drop site and center camera
    this.spawnLandingCraft();
    EventBus.emit('minimap-pan', { tileX: this.mission.playerStartX, tileY: this.mission.playerStartY });

    // Place enemy camps from mission definition
    EnemyPlacement.populate(this.mission, this.entityManager);

    // Create objective markers
    for (const obj of this.mission.objectives) {
      this.objectiveMarkers.push(new ObjectiveMarker(obj));
    }

    // Setup XP tracking
    this.xpTracker = new XpTracker();

    // Setup fog of war
    this.fogOfWar = new FogOfWarSystem(this.entityManager);

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
    EventBus.on('doctrine-replace-confirm', this.onDoctrineReplaceConfirm, this);
    EventBus.on('card-played', this.onCardPlayedDoctrineEffects, this);
    EventBus.on('entity-died', this.onEntityDiedDoctrineEffects, this);
    EventBus.on('mine-tick', this.onMineTick, this);
    EventBus.on('input-pointer-move', this.onInputMove3D, this);
    EventBus.on('input-pointer-down', this.onInputDown3D, this);

    // Audio
    this.audioManager = new AudioManager();

    // Launch UI scene
    getSceneManager().launch('UIScene', { mission: this.mission });

    // Emit terrain data for Minimap (created by UIScene above, so it's now listening)
    EventBus.emit('minimap-terrain', this.mapManager.getTerrainGrid());

    // Context menu prevention
    const canvas = document.querySelector('canvas');
    if (canvas) canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Escape key
    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.pendingFromKeyboard) {
        this.pendingCard = null;
        this.pendingFromKeyboard = false;
        EventBus.emit('placement-preview-3d', { tileX: 0, tileY: 0, valid: false, visible: false });
        EventBus.emit('card-play-failed', { reason: 'cancelled' });
      }
    };
    document.addEventListener('keydown', this.escHandler);
  }

  private spawnLandingCraft(): void {
    this.townHall = this.entityManager.spawnBuilding(
      this.mission.playerStartX, this.mission.playerStartY,
      'building-drop_ship', 'drop_ship',
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
        const canPlace = (card.type === 'ordnance' || card.type === 'doctrine')
          ? true
          : card.type === 'equipment'
            ? this.hasEquippableUnitNear(evt.tileX, evt.tileY, card)
            : this.validator.canPlace(evt.tileX, evt.tileY, w, h);
        const unitStats = card.entityType ? CardEffects.getUnitStats(card.entityType) : undefined;
        EventBus.emit('placement-preview-3d', {
          tileX: evt.tileX, tileY: evt.tileY, valid: canPlace, visible: true,
          cardType: card.type, entityType: card.entityType, cardName: card.name,
          squadSize: unitStats?.squadSize || 1,
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
      EventBus.emit('card-play-failed', { reason: 'out-of-bounds' });
      this.pendingCard = null;
      this.pendingFromKeyboard = false;
      return;
    }

    const card = this.pendingCard.card;
    const success = this.cardEffects.execute(card, evt.tileX, evt.tileY);
    if (success) {
      EventBus.emit('card-played', { card, cardIndex: this.pendingCard.cardIndex, tileX: evt.tileX, tileY: evt.tileY });
    } else {
      EventBus.emit('card-play-failed', { reason: 'cannot-place' });
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
    this.pendingCard = data;
    this.pendingFromKeyboard = !data.screenX;
  }

  private onCardDragReleased(data: { card: any; cardIndex: number; screenX: number; screenY: number }): void {
    EventBus.emit('placement-preview-3d', { tileX: 0, tileY: 0, valid: false, visible: false });

    const gameRenderer = (window as any).__gameRenderer;
    const tile = gameRenderer?.inputBridge?.screenToTile(data.screenX, data.screenY);
    if (!tile) {
      EventBus.emit('card-play-failed', { reason: 'out-of-bounds' });
      this.pendingCard = null;
      return;
    }

    if (!IsoHelper.isInBounds(tile.tileX, tile.tileY)) {
      EventBus.emit('card-play-failed', { reason: 'out-of-bounds' });
      this.pendingCard = null;
      return;
    }

    const success = this.cardEffects.execute(data.card, tile.tileX, tile.tileY);
    if (success) {
      EventBus.emit('card-played', { card: data.card, cardIndex: data.cardIndex, tileX: tile.tileX, tileY: tile.tileY });
    } else {
      EventBus.emit('card-play-failed', { reason: 'cannot-place' });
    }
    this.pendingCard = null;
  }

  private onCardDragMove(data: any): void {
    this.pendingCard = data;
    const gameRenderer = (window as any).__gameRenderer;
    const tile = gameRenderer?.inputBridge?.screenToTile(data.screenX, data.screenY);
    if (tile && IsoHelper.isInBounds(tile.tileX, tile.tileY)) {
      const card = data.card;
      const w = card.tileWidth || 1;
      const h = card.tileHeight || 1;
      const canPlace = (card.type === 'ordnance' || card.type === 'doctrine')
        ? true
        : card.type === 'equipment'
          ? this.hasEquippableUnitNear(tile.tileX, tile.tileY, card)
          : this.validator.canPlace(tile.tileX, tile.tileY, w, h);
      const unitStats = card.entityType ? CardEffects.getUnitStats(card.entityType) : undefined;
      EventBus.emit('placement-preview-3d', {
        tileX: tile.tileX, tileY: tile.tileY, valid: canPlace, visible: true,
        cardType: card.type, entityType: card.entityType, cardName: card.name,
        squadSize: unitStats?.squadSize || 1,
      });
    } else {
      EventBus.emit('placement-preview-3d', { tileX: 0, tileY: 0, valid: false, visible: false });
    }
  }

  private onCardDragCancel(): void {
    this.pendingCard = null;
    this.pendingFromKeyboard = false;
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
      });
      return;
    }

    if (entity) {
      EventBus.emit('entity-died-3d-vfx', { tileX: entity.tileX, tileY: entity.tileY, team: entity.team });
    }
  }

  private onMissionComplete(_data: any): void {
    this.xpTracker.commitToPlayerState();
    const sm = getSceneManager();
    sm.stop('UIScene');
    sm.stop('GameScene');
    sm.start('GameOverScene', {
      victory: true,
      missionId: this.mission.id,
      mission: this.mission,
      missionName: this.mission.name,
      objectivesCompleted: this.missionSystem.objectiveStatuses.length,
      totalObjectives: this.missionSystem.objectiveStatuses.length,
      sessionXp: this.xpTracker.getSessionXp(),
    });
  }

  private onSupplyPodIncoming(data: { tileX: number; tileY: number; gold: number; cardDraws: number }): void {
    const podId = `pod-${++this.supplyPodIdCounter}`;
    EventBus.emit('supply-pod-3d', { id: podId, tileX: data.tileX, tileY: data.tileY });
    const pod = new SupplyPod(data.tileX, data.tileY, data.gold, data.cardDraws);
    (pod as any).__podId3D = podId;
    this.supplyPods.push(pod);
  }

  private onObjectiveCompleted(_data: any): void {
    const discardBonus = this.doctrineManager.getDiscardBonus();
    EventBus.emit('reset-discards', { bonus: discardBonus });
    this.doctrineManager.onObjectiveStart();
  }

  private onDoctrineReplaceConfirm({ replaceIndex, newDoctrine }: { replaceIndex: number; newDoctrine: Card }): void {
    const removed = this.doctrineManager.replaceDoctrine(replaceIndex, newDoctrine);
    if (removed) EventBus.emit('wargear-to-discard', { card: removed });
    for (const unit of this.entityManager.getUnits('player')) {
      this.doctrineManager.applyModifiers(unit);
    }
    EventBus.emit('doctrines-changed', { doctrines: this.doctrineManager.getActiveDoctrines() });
  }

  private onCardPlayedDoctrineEffects(_data: any): void {
    const gold = this.doctrineManager.getOnCardPlayedGold();
    if (gold > 0) {
      this.economySystem.addGold(gold);
      EventBus.emit('doctrine-triggered', { doctrineEffect: 'tithe_collector' });
    }
  }

  private onEntityDiedDoctrineEffects({ entity }: { entity: any }): void {
    if (entity?.team === 'enemy') {
      const gold = this.doctrineManager.getOnEnemyKilledGold();
      if (gold > 0) {
        this.economySystem.addGold(gold);
        EventBus.emit('doctrine-triggered', { doctrineEffect: 'scavenger_rites' });
      }
    }
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

  private onPanToObjective({ tileX, tileY }: { tileX: number; tileY: number }): void {
    const gameRenderer = (window as any).__gameRenderer;
    if (gameRenderer?.cameraController) {
      gameRenderer.cameraController.panTo(tileX, tileY);
    }
  }

  update(delta: number): void {
    // Update timers
    TimerManager.get().update(delta);

    this.entityManager.update(delta);
    this.combatSystem.update(delta);
    this.missionSystem.update(delta);
    this.enemyAI.update(delta);
    this.fogOfWar.update(delta);
    this.pathfinding.update();
    this.selectionSystem.update(delta);

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
    EventBus.off('doctrine-replace-confirm', this.onDoctrineReplaceConfirm, this);
    EventBus.off('card-played', this.onCardPlayedDoctrineEffects, this);
    EventBus.off('entity-died', this.onEntityDiedDoctrineEffects, this);
    EventBus.off('mine-tick', this.onMineTick, this);
    EventBus.off('input-pointer-move', this.onInputMove3D, this);
    EventBus.off('input-pointer-down', this.onInputDown3D, this);

    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }

    for (const marker of this.objectiveMarkers) marker.destroy();
    this.objectiveMarkers = [];
    for (const pod of this.supplyPods) pod.destroy();
    this.supplyPods = [];

    this.audioManager?.destroy();
    this.xpTracker?.destroy();
    this.fogOfWar?.destroy();
    this.entityManager?.destroy();
    this.economySystem?.destroy();
    this.missionSystem?.destroy();
    this.selectionSystem?.destroy();
    this.commandSystem?.destroy();

    TimerManager.get().clear();
  }
}
