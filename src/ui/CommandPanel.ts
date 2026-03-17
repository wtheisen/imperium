import { EventBus } from '../EventBus';
import { Card } from '../cards/Card';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { HealthComponent } from '../components/HealthComponent';
import { CombatComponent } from '../components/CombatComponent';
import { MoverComponent } from '../components/MoverComponent';
import { EquipmentComponent } from '../components/EquipmentComponent';
import { LevelBadgeComponent } from '../components/LevelBadgeComponent';
import { ProductionComponent, TRAINABLE_UNITS, TrainableUnit } from '../components/ProductionComponent';
import { AuraComponent, AuraConfig } from '../components/AuraComponent';
import { getTechTree, canUnlockNode, unlockNode, TechNode } from '../state/TechTree';
import { getPlayerState } from '../state/PlayerState';
import { HotkeyGrid, HotkeyLayout, HotkeyCell } from './HotkeyGrid';

interface SelectionData {
  entities: Unit[];
  building?: Building;
}

/* ── Injected styles ─────────────────────────────────────────────── */

const PANEL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Share+Tech+Mono&family=Cinzel:wght@400;700&display=swap');

  #command-panel {
    width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    font-family: 'Share Tech Mono', 'Courier New', monospace;
    font-size: 11px;
    color: #c8bfa0;
    background: transparent;
  }

  #command-panel::-webkit-scrollbar { width: 4px; }
  #command-panel::-webkit-scrollbar-track { background: transparent; }
  #command-panel::-webkit-scrollbar-thumb {
    background: #3d3526;
    border-radius: 2px;
  }
  #command-panel::-webkit-scrollbar-thumb:hover {
    background: #6b5a2e;
  }

  /* ── Header ─────────────────────────────────────────────── */
  #command-panel .cp-header {
    padding: 4px 2px 4px;
    font-family: 'Teko', sans-serif;
    font-size: 18px;
    font-weight: 600;
    color: #e8dcc0;
    letter-spacing: 1px;
    text-transform: uppercase;
    border-bottom: 1px solid rgba(200,152,42,0.08);
    position: relative;
  }
  #command-panel .cp-header::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, rgba(200,152,42,0.2), transparent);
  }
  #command-panel .cp-header-sub {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px;
    font-weight: 400;
    color: rgba(200,191,160,0.3);
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-top: 1px;
  }

  /* ── Sections ───────────────────────────────────────────── */
  #command-panel .cp-section {
    padding: 5px 2px;
    border-bottom: 1px solid rgba(200,152,42,0.06);
    position: relative;
  }
  #command-panel .cp-section:last-child { border-bottom: none; }

  #command-panel .cp-label {
    font-size: 8px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: rgba(200,152,42,0.35);
    margin-bottom: 3px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  #command-panel .cp-label::before {
    content: '';
    width: 2px;
    height: 8px;
    background: rgba(200,152,42,0.25);
    flex-shrink: 0;
  }

  /* ── Stats ──────────────────────────────────────────────── */
  #command-panel .cp-stat {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 2px 0;
    line-height: 1.4;
  }
  #command-panel .cp-stat-name {
    color: #7a7260;
    font-size: 10px;
  }
  #command-panel .cp-stat-val {
    color: #d4c8a0;
    font-weight: 500;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  #command-panel .cp-stat-highlight {
    color: #e8d48b;
  }

  /* ── HP Bar ─────────────────────────────────────────────── */
  #command-panel .cp-hp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0 2px;
  }
  #command-panel .cp-hp-val {
    font-size: 12px;
    font-weight: 500;
    color: #d4c8a0;
    min-width: 70px;
    font-variant-numeric: tabular-nums;
  }
  #command-panel .cp-hp-bar-bg {
    flex: 1;
    height: 6px;
    background: rgba(30,26,18,0.8);
    border-radius: 1px;
    overflow: hidden;
    border: 1px solid rgba(60,52,36,0.5);
  }
  #command-panel .cp-hp-bar {
    height: 100%;
    border-radius: 0;
    transition: width 0.25s ease-out;
    position: relative;
  }
  #command-panel .cp-hp-bar.hp-high {
    background: linear-gradient(90deg, #3a7a3a, #4a9a4a);
    box-shadow: 0 0 4px rgba(74,154,74,0.3);
  }
  #command-panel .cp-hp-bar.hp-mid {
    background: linear-gradient(90deg, #8a7a2a, #aa9a3a);
    box-shadow: 0 0 4px rgba(170,154,58,0.3);
  }
  #command-panel .cp-hp-bar.hp-low {
    background: linear-gradient(90deg, #8a2a2a, #aa3a3a);
    box-shadow: 0 0 4px rgba(170,58,58,0.3);
  }

  /* ── Armor badge ────────────────────────────────────────── */
  #command-panel .cp-armor {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: #8a9ab0;
    margin-top: 2px;
  }
  #command-panel .cp-armor-icon {
    width: 10px;
    height: 10px;
    border: 1px solid #6a7a90;
    border-radius: 1px;
    background: linear-gradient(135deg, #4a5a6a 0%, #3a4a5a 100%);
    display: inline-block;
  }

  /* ── Buttons ────────────────────────────────────────────── */
  #command-panel .cp-btn {
    display: inline-block;
    background: linear-gradient(180deg, rgba(42,36,24,0.6) 0%, rgba(26,22,16,0.8) 100%);
    border: 1px solid #3d3526;
    color: #b0a480;
    padding: 5px 10px;
    margin: 2px 4px 2px 0;
    cursor: pointer;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.3px;
    border-radius: 1px;
    transition: all 0.12s ease-out;
    position: relative;
  }
  #command-panel .cp-btn:hover {
    background: linear-gradient(180deg, rgba(107,90,46,0.3) 0%, rgba(42,36,24,0.6) 100%);
    border-color: #6b5a2e;
    color: #e8d48b;
    box-shadow: 0 0 8px rgba(107,90,46,0.15);
  }
  #command-panel .cp-btn:active {
    transform: translateY(1px);
    background: rgba(26,22,16,0.9);
  }
  #command-panel .cp-btn-full {
    display: block;
    width: 100%;
    text-align: center;
    box-sizing: border-box;
  }

  /* ── Queue progress ─────────────────────────────────────── */
  #command-panel .cp-queue-bar-bg {
    width: 100%;
    height: 4px;
    background: rgba(30,26,18,0.8);
    border-radius: 1px;
    margin: 4px 0;
    overflow: hidden;
    border: 1px solid rgba(60,52,36,0.4);
  }
  #command-panel .cp-queue-bar {
    height: 100%;
    background: linear-gradient(90deg, #6b5a2e, #c8a84e);
    transition: width 0.3s ease-out;
    box-shadow: 0 0 6px rgba(200,168,78,0.2);
  }
  #command-panel .cp-queue-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1px 0;
    font-size: 10px;
  }
  #command-panel .cp-queue-current { color: #c8a84e; }
  #command-panel .cp-queue-waiting { color: #4a4436; }

  /* ── Equipment slots ────────────────────────────────────── */
  #command-panel .cp-slot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 0;
  }
  #command-panel .cp-slot-name {
    color: #d4a850;
    font-size: 11px;
    font-weight: 500;
  }
  #command-panel .cp-slot-empty {
    color: #3d3526;
    font-style: italic;
    font-size: 10px;
  }
  #command-panel .cp-wargear-effects {
    padding: 2px 0 4px 8px;
    border-left: 1px solid #2a2418;
    margin: 1px 0 3px 4px;
  }
  #command-panel .cp-wargear-fx {
    font-size: 9px;
    color: #8a9a70;
    line-height: 1.5;
  }
  #command-panel .cp-wargear-fx-ability {
    color: #c0a0d0;
  }
  #command-panel .cp-wargear-fx-passive {
    color: #80b0c0;
  }

  /* ── Aura ────────────────────────────────────────────────── */
  #command-panel .cp-aura-line {
    font-size: 10px;
    color: #6aacda;
    padding: 1px 0;
    line-height: 1.5;
  }

  /* ── Multi-select unit group ────────────────────────────── */
  #command-panel .cp-group {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  #command-panel .cp-group-count {
    font-size: 16px;
    font-weight: 700;
    color: #e8d48b;
    font-family: 'Cinzel', serif;
    min-width: 28px;
    text-align: center;
  }
  #command-panel .cp-group-info { flex: 1; }

  /* ── XP / Level ──────────────────────────────────────────── */
  #command-panel .cp-xp-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 2px 0;
  }
  #command-panel .cp-level-badge {
    font-family: 'Cinzel', serif;
    font-size: 14px;
    font-weight: 700;
    color: #c8a84e;
    min-width: 20px;
    text-align: center;
    text-shadow: 0 0 4px rgba(200,168,78,0.3);
  }
  #command-panel .cp-xp-info { flex: 1; }
  #command-panel .cp-xp-text {
    font-size: 9px;
    color: #6b6350;
    margin-bottom: 2px;
  }
  #command-panel .cp-xp-bar-bg {
    width: 100%;
    height: 4px;
    background: rgba(30,26,18,0.8);
    border-radius: 1px;
    overflow: hidden;
    border: 1px solid rgba(60,52,36,0.4);
  }
  #command-panel .cp-xp-bar {
    height: 100%;
    background: linear-gradient(90deg, #6b5a2e, #c8a84e);
    box-shadow: 0 0 4px rgba(200,168,78,0.2);
    transition: width 0.3s ease-out;
  }

  /* ── Tech Tree inline ────────────────────────────────────── */
  #command-panel .cp-tech-toggle {
    display: block;
    width: 100%;
    text-align: center;
    box-sizing: border-box;
    margin-top: 4px;
  }
  #command-panel .cp-tech-tree {
    margin-top: 6px;
  }
  #command-panel .cp-tech-tier {
    display: flex;
    justify-content: center;
    gap: 4px;
    margin-bottom: 4px;
    position: relative;
  }
  #command-panel .cp-tech-tier::before {
    content: '';
    position: absolute;
    top: -2px;
    left: 50%;
    width: 1px;
    height: 4px;
    background: #3d3526;
  }
  #command-panel .cp-tech-tier:first-child::before { display: none; }
  #command-panel .cp-tech-node {
    flex: 1;
    max-width: 130px;
    padding: 5px 6px;
    border: 1px solid #2a2418;
    border-radius: 2px;
    background: rgba(20,18,14,0.8);
    font-size: 9px;
    line-height: 1.3;
    cursor: default;
    transition: all 0.12s ease-out;
    position: relative;
  }
  #command-panel .cp-tech-node.unlocked {
    border-color: #6b5a2e;
    background: rgba(42,36,24,0.5);
  }
  #command-panel .cp-tech-node.unlocked .cp-tech-name {
    color: #e8d48b;
  }
  #command-panel .cp-tech-node.available {
    border-color: #c8a84e;
    cursor: pointer;
    box-shadow: 0 0 6px rgba(200,168,78,0.15);
  }
  #command-panel .cp-tech-node.available:hover {
    background: rgba(107,90,46,0.2);
    box-shadow: 0 0 10px rgba(200,168,78,0.25);
  }
  #command-panel .cp-tech-node.locked {
    opacity: 0.4;
  }
  #command-panel .cp-tech-name {
    font-weight: 500;
    color: #7a7260;
    font-size: 10px;
    margin-bottom: 1px;
  }
  #command-panel .cp-tech-desc {
    color: #5a5440;
    font-size: 8px;
  }
  #command-panel .cp-tech-cost {
    color: #c8a84e;
    font-size: 8px;
    margin-top: 2px;
    font-weight: 500;
  }
  #command-panel .cp-tech-check {
    color: #4a9a4a;
    font-weight: 700;
    margin-right: 2px;
  }
  #command-panel .cp-tech-connector {
    display: flex;
    justify-content: center;
    margin-bottom: 2px;
  }
  #command-panel .cp-tech-line {
    width: 1px;
    height: 6px;
    background: #3d3526;
  }
  #command-panel .cp-tech-fork {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    margin-bottom: 2px;
    position: relative;
  }
  #command-panel .cp-tech-fork::after {
    content: '';
    position: absolute;
    top: 0;
    left: 25%;
    right: 25%;
    height: 1px;
    background: #3d3526;
  }

  /* ── Hotkey Grid ─────────────────────────────────────────── */
  #command-panel .cp-hk-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 2px;
    padding: 2px 0;
  }
  #command-panel .cp-hk-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4px 2px;
    min-height: 32px;
    border: 1px solid #2a2418;
    border-radius: 2px;
    background: rgba(20,18,14,0.6);
    cursor: pointer;
    transition: all 0.1s ease-out;
    overflow: hidden;
  }
  #command-panel .cp-hk-cell:hover {
    background: rgba(107,90,46,0.2);
    border-color: #6b5a2e;
  }
  #command-panel .cp-hk-cell.disabled {
    opacity: 0.35;
    cursor: default;
    pointer-events: none;
  }
  #command-panel .cp-hk-cell.empty {
    border-color: rgba(42,36,24,0.3);
    background: rgba(10,10,14,0.3);
    cursor: default;
    pointer-events: none;
  }
  #command-panel .cp-hk-key {
    font-family: 'Teko', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #c8982a;
    line-height: 1;
  }
  #command-panel .cp-hk-cell.empty .cp-hk-key {
    color: rgba(200,152,42,0.15);
  }
  #command-panel .cp-hk-label {
    font-size: 7px;
    color: #8a7e68;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1.1;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  #command-panel .cp-hk-sub {
    font-size: 7px;
    color: #6b6350;
    line-height: 1;
  }
  #command-panel .cp-hk-cd-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(200,152,42,0.15);
    pointer-events: none;
    transition: height 0.25s linear;
  }
`;

export class CommandPanel {
  private container: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private styleEl: HTMLStyleElement;
  private selectedUnits: Unit[] = [];
  private selectedBuilding: Building | undefined;
  private showTechTree: boolean = false;
  private lastRenderTime: number = 0;
  private dirty: boolean = true;
  private hotkeyGrid: HotkeyGrid;

  constructor(hotkeyGrid: HotkeyGrid) {
    this.hotkeyGrid = hotkeyGrid;

    // Inject styles
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = PANEL_STYLES;
    document.head.appendChild(this.styleEl);

    this.container = document.createElement('div');
    this.container.id = 'command-panel';

    this.contentEl = document.createElement('div');
    this.container.appendChild(this.contentEl);

    // Render into the bottom bar unit section if available
    const section = document.getElementById('hud-section-unit');
    if (section) {
      section.innerHTML = '';
      section.appendChild(this.container);
    } else {
      document.body.appendChild(this.container);
    }

    EventBus.on('selection-changed', this.onSelectionChanged, this);
  }

  private onSelectionChanged(data: SelectionData): void {
    this.selectedUnits = data.entities || [];
    this.selectedBuilding = data.building;
    this.showTechTree = false;
    this.dirty = true;
    this.render();
  }

  update(): void {
    if (this.selectedUnits.length === 0 && !this.selectedBuilding) return;
    // Throttle frame-based re-renders to 4/sec to avoid destroying DOM mid-click
    const now = performance.now();
    if (now - this.lastRenderTime < 250) return;
    this.render();
  }

  private render(): void {
    this.lastRenderTime = performance.now();
    const hasSelection = this.selectedUnits.length > 0 || !!this.selectedBuilding;
    this.container.style.display = 'block';
    if (!hasSelection) {
      this.contentEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;
        height:100%;font-size:9px;letter-spacing:2px;color:rgba(200,191,160,0.1);">NO SELECTION</div>`;
      return;
    }

    let html = '';

    if (this.selectedBuilding) {
      html = this.renderBuilding(this.selectedBuilding);
    } else if (this.selectedUnits.length === 1) {
      html = this.renderSingleUnit(this.selectedUnits[0]);
    } else if (this.selectedUnits.length > 1) {
      html = this.renderMultiUnit(this.selectedUnits);
    }

    this.contentEl.innerHTML = html;
    this.bindButtons();
  }

  // ── Unit rendering ───────────────────────────────────────────

  private renderSingleUnit(unit: Unit): string {
    const health = unit.getComponent<HealthComponent>('health');
    const combat = unit.getComponent<CombatComponent>('combat');
    const mover = unit.getComponent<MoverComponent>('mover');
    const equip = unit.getComponent<EquipmentComponent>('equipment');
    const levelBadge = unit.getComponent<LevelBadgeComponent>('levelBadge');

    const typeName = this.formatName(unit.unitType);
    let s = `<div class="cp-header">${typeName}<div class="cp-header-sub">${unit.team} unit</div></div>`;

    // HP
    if (health) {
      s += this.renderHealthBar(health);
    }

    // XP & Level (player units only)
    if (unit.team === 'player') {
      s += this.renderXpSection(unit);
    }

    // Combat stats
    if (combat) {
      s += `<div class="cp-section">`;
      s += `<div class="cp-label">Combat</div>`;
      s += `<div class="cp-stat"><span class="cp-stat-name">ATK</span><span class="cp-stat-val cp-stat-highlight">${combat.getDamage()}</span></div>`;
      s += `<div class="cp-stat"><span class="cp-stat-name">Range</span><span class="cp-stat-val">${combat.getRange()}</span></div>`;
      s += `<div class="cp-stat"><span class="cp-stat-name">Cooldown</span><span class="cp-stat-val">${(combat.getCooldown() / 1000).toFixed(1)}s</span></div>`;
      if (mover) {
        s += `<div class="cp-stat"><span class="cp-stat-name">Speed</span><span class="cp-stat-val">${mover.getSpeed().toFixed(1)}</span></div>`;
      }
      s += `</div>`;
    } else if (mover) {
      s += `<div class="cp-section">`;
      s += `<div class="cp-stat"><span class="cp-stat-name">Speed</span><span class="cp-stat-val">${mover.getSpeed().toFixed(1)}</span></div>`;
      s += `</div>`;
    }

    // Equipment slots
    if (equip) {
      const equipped = equip.getEquipped();
      s += `<div class="cp-section">`;
      s += `<div class="cp-label">Wargear ${equipped.length}/2</div>`;
      for (let i = 0; i < 2; i++) {
        if (i < equipped.length) {
          const card = equipped[i];
          s += `<div class="cp-slot">`;
          s += `<span class="cp-slot-name">${card.name}</span>`;
          s += `<button class="cp-btn cp-unequip-btn" data-unit-id="${unit.entityId}" data-slot="${i}">Drop</button>`;
          s += `</div>`;
          s += this.renderWargearEffects(card);
        } else {
          s += `<div class="cp-slot"><span class="cp-slot-empty">— empty slot —</span></div>`;
        }
      }
      s += `</div>`;
    }

    // Hotkey grid
    s += this.renderHotkeyGrid();

    return s;
  }

  private renderMultiUnit(units: Unit[]): string {
    let s = `<div class="cp-header">${units.length} Units<div class="cp-header-sub">selected</div></div>`;

    // Group by type
    const groups = new Map<string, Unit[]>();
    for (const u of units) {
      const arr = groups.get(u.unitType) || [];
      arr.push(u);
      groups.set(u.unitType, arr);
    }

    for (const [type, group] of groups) {
      const totalHp = group.reduce((sum, u) => {
        const h = u.getComponent<HealthComponent>('health');
        return sum + (h ? h.currentHp : 0);
      }, 0);
      const totalMaxHp = group.reduce((sum, u) => {
        const h = u.getComponent<HealthComponent>('health');
        return sum + (h ? h.maxHp : 0);
      }, 0);
      const pct = totalMaxHp > 0 ? (totalHp / totalMaxHp) * 100 : 0;
      const hpClass = pct > 50 ? 'hp-high' : pct > 25 ? 'hp-mid' : 'hp-low';

      s += `<div class="cp-section">`;
      s += `<div class="cp-group">`;
      s += `<span class="cp-group-count">${group.length}</span>`;
      s += `<div class="cp-group-info">`;
      s += `<div style="color:#c4b998;font-size:11px;font-weight:500">${this.formatName(type)}</div>`;
      s += `<div class="cp-hp-bar-bg"><div class="cp-hp-bar ${hpClass}" style="width:${pct}%"></div></div>`;
      s += `<div style="font-size:9px;color:#6b6350;margin-top:1px">${Math.ceil(totalHp)} / ${totalMaxHp} HP</div>`;
      s += `</div></div></div>`;
    }

    // Hotkey grid
    s += this.renderHotkeyGrid();

    return s;
  }

  // ── Building rendering ───────────────────────────────────────

  private renderBuilding(building: Building): string {
    const health = building.getComponent<HealthComponent>('health');
    const production = building.getComponent<ProductionComponent>('production');
    const aura = building.getComponent<AuraComponent>('aura');
    const combat = building.getComponent<CombatComponent>('combat');

    const typeName = this.formatName(building.buildingType);
    let s = `<div class="cp-header">${typeName}<div class="cp-header-sub">structure</div></div>`;

    // HP
    if (health) {
      s += this.renderHealthBar(health);
    }

    // Combat stats (turrets)
    if (combat) {
      s += `<div class="cp-section">`;
      s += `<div class="cp-label">Armament</div>`;
      s += `<div class="cp-stat"><span class="cp-stat-name">ATK</span><span class="cp-stat-val cp-stat-highlight">${combat.getDamage()}</span></div>`;
      s += `<div class="cp-stat"><span class="cp-stat-name">Range</span><span class="cp-stat-val">${combat.getRange()}</span></div>`;
      s += `</div>`;
    }

    // Aura info
    if (aura) {
      s += this.renderAuraInfo(aura.getConfig());
    }

    // Production queue display
    if (production) {
      const queue = production.getQueue();
      if (queue.length > 0) {
        s += `<div class="cp-section">`;
        s += `<div class="cp-label">Queue ${queue.length}/${production.maxQueueSize}</div>`;
        const progress = production.getCurrentProgress();
        const currentName = queue[0].unit.name;
        s += `<div class="cp-queue-item"><span class="cp-queue-current">${currentName}</span><span class="cp-stat-val">${Math.floor(progress * 100)}%</span></div>`;
        s += `<div class="cp-queue-bar-bg"><div class="cp-queue-bar" style="width:${progress * 100}%"></div></div>`;
        for (let i = 1; i < queue.length; i++) {
          s += `<div class="cp-queue-item"><span class="cp-queue-waiting">${queue[i].unit.name}</span><span class="cp-queue-waiting">queued</span></div>`;
        }
        s += `</div>`;
      }
    }

    // Hotkey grid (includes train buttons + requisition via Z/X/C/V/B row)
    s += this.renderHotkeyGrid();

    return s;
  }

  // ── XP & Tech Tree renderers ─────────────────────────────────

  private renderXpSection(unit: Unit): string {
    const unitXp = unit.xp;
    const levelBadge = unit.getComponent<LevelBadgeComponent>('levelBadge');
    const level = levelBadge?.level ?? 0;
    const tree = getTechTree(unit.unitType);
    const totalNodes = tree.length;

    // Find next tier cost for XP bar progress
    const tierCosts = [15, 30, 50, 75]; // approximate costs per tier
    const nextCost = level < tierCosts.length ? tierCosts[level] : tierCosts[tierCosts.length - 1];
    const xpBarPct = Math.min(100, (unitXp / nextCost) * 100);

    let s = `<div class="cp-section">`;
    s += `<div class="cp-xp-row">`;
    s += `<span class="cp-level-badge">${level}</span>`;
    s += `<div class="cp-xp-info">`;
    s += `<div class="cp-xp-text">${unitXp} XP · ${level}/${totalNodes} upgrades</div>`;
    s += `<div class="cp-xp-bar-bg"><div class="cp-xp-bar" style="width:${xpBarPct}%"></div></div>`;
    s += `</div></div>`;

    // Tech tree toggle
    const label = this.showTechTree ? 'Hide Tech Tree' : 'View Tech Tree';
    s += `<button class="cp-btn cp-tech-toggle cp-tech-toggle-btn">${label}</button>`;

    // Inline tech tree
    if (this.showTechTree) {
      s += this.renderTechTree(unit.unitType);
    }

    s += `</div>`;
    return s;
  }

  private renderTechTree(unitType: string): string {
    const tree = getTechTree(unitType);
    if (tree.length === 0) return '';

    // Group by tier
    const tiers = new Map<number, TechNode[]>();
    for (const node of tree) {
      if (!tiers.has(node.tier)) tiers.set(node.tier, []);
      tiers.get(node.tier)!.push(node);
    }

    let s = `<div class="cp-tech-tree">`;

    const maxTier = Math.max(...tiers.keys());
    for (let t = 0; t <= maxTier; t++) {
      const nodes = tiers.get(t);
      if (!nodes) continue;

      // Connector between tiers
      if (t > 0) {
        if (t === 1) {
          // Fork connector from root to branches
          s += `<div class="cp-tech-fork"><div class="cp-tech-line"></div></div>`;
        } else {
          s += `<div class="cp-tech-connector"><div class="cp-tech-line"></div></div>`;
        }
      }

      // Sort nodes: branch 0 (root) center, branch 1 left, branch 2 right
      nodes.sort((a, b) => a.branch - b.branch);

      s += `<div class="cp-tech-tier">`;
      for (const node of nodes) {
        const isUnlocked = !canUnlockNode(node.id) && this.isNodeUnlocked(node.id);
        const isAvailable = canUnlockNode(node.id);
        const stateClass = isUnlocked ? 'unlocked' : isAvailable ? 'available' : 'locked';

        s += `<div class="cp-tech-node ${stateClass}" data-node-id="${node.id}">`;
        s += `<div class="cp-tech-name">`;
        if (isUnlocked) s += `<span class="cp-tech-check">+</span>`;
        s += `${node.name}</div>`;
        s += `<div class="cp-tech-desc">${node.description}</div>`;
        if (!isUnlocked) {
          s += `<div class="cp-tech-cost">${node.xpCost} XP${isAvailable ? ' — click to unlock' : ''}</div>`;
        }
        s += `</div>`;
      }
      s += `</div>`;
    }

    s += `</div>`;
    return s;
  }

  private isNodeUnlocked(nodeId: string): boolean {
    return getPlayerState().unlockedNodes.has(nodeId);
  }

  private renderWargearEffects(card: Card): string {
    const lines: string[] = [];

    if (card.wargear) {
      const wg = card.wargear;
      if (wg.statBoosts) {
        for (const b of wg.statBoosts) {
          const sign = b.value > 0 ? '+' : '';
          const suffix = b.mode === 'multiplicative' ? 'x' : '';
          const statName = this.formatStatName(b.stat);
          lines.push(`<div class="cp-wargear-fx">${sign}${b.value}${suffix} ${statName}</div>`);
        }
      }
      if (wg.passives) {
        for (const p of wg.passives) {
          const name = this.formatPassiveName(p.id);
          lines.push(`<div class="cp-wargear-fx cp-wargear-fx-passive">${name}</div>`);
        }
      }
      if (wg.ability) {
        lines.push(`<div class="cp-wargear-fx cp-wargear-fx-ability">[${wg.ability.hotkey}] ${wg.ability.name} (${(wg.ability.cooldown / 1000).toFixed(0)}s cd)</div>`);
      }
    } else if (card.equipEffect) {
      // Legacy equipment
      const val = card.equipValue || 0;
      const effectMap: Record<string, string> = {
        damage_boost: `+${val} Damage`,
        hp_boost: `+${val} HP`,
        speed_boost: `${val}x Speed`,
        range_boost: `+${val} Range`,
      };
      const desc = effectMap[card.equipEffect] || card.equipEffect;
      lines.push(`<div class="cp-wargear-fx">${desc}</div>`);
    }

    if (lines.length === 0) return '';
    return `<div class="cp-wargear-effects">${lines.join('')}</div>`;
  }

  private formatStatName(stat: string): string {
    const names: Record<string, string> = {
      damage: 'Damage', hp: 'HP', speed: 'Speed',
      range: 'Range', armor: 'Armor', vision: 'Vision',
    };
    return names[stat] || stat;
  }

  private formatPassiveName(id: string): string {
    const names: Record<string, string> = {
      stun_on_hit: 'Stun on hit',
      block_chance: 'Chance to block',
      armor_debuff_aura: 'Armor debuff aura',
      damage_shield: 'Damage shield',
    };
    return names[id] || id.replace(/_/g, ' ');
  }

  // ── Shared renderers ─────────────────────────────────────────

  private renderHealthBar(health: HealthComponent): string {
    const pct = Math.max(0, (health.currentHp / health.maxHp) * 100);
    const hpClass = pct > 50 ? 'hp-high' : pct > 25 ? 'hp-mid' : 'hp-low';

    let s = `<div class="cp-section">`;
    s += `<div class="cp-hp-row">`;
    s += `<span class="cp-hp-val">${Math.ceil(health.currentHp)} / ${health.maxHp}</span>`;
    s += `<div class="cp-hp-bar-bg"><div class="cp-hp-bar ${hpClass}" style="width:${pct}%"></div></div>`;
    s += `</div>`;
    if (health.armor > 0) {
      s += `<span class="cp-armor"><span class="cp-armor-icon"></span>${health.armor} Armor</span>`;
    }
    s += `</div>`;
    return s;
  }

  private renderAuraInfo(config: AuraConfig): string {
    const parts: string[] = [];
    if (config.healPerTick && config.healRadius) {
      parts.push(`+${config.healPerTick} HP heal · ${config.healRadius} tile radius`);
    }
    if (config.goldPerTick) {
      const interval = (config.goldInterval || 10000) / 1000;
      parts.push(`+${config.goldPerTick} gold / ${interval}s`);
    }
    if (config.damageBoost && config.boostRadius) {
      parts.push(`+${config.damageBoost} ATK aura · ${config.boostRadius} tiles`);
    }
    if (config.extraCardDraw) {
      parts.push(`+${config.extraCardDraw} card draw on wave end`);
    }
    if (parts.length === 0) return '';

    let s = `<div class="cp-section">`;
    s += `<div class="cp-label">Aura Effects</div>`;
    for (const p of parts) {
      s += `<div class="cp-aura-line">${p}</div>`;
    }
    s += `</div>`;
    return s;
  }

  // ── Hotkey grid rendering ────────────────────────────────────

  private renderHotkeyGrid(): string {
    const layout = this.hotkeyGrid.getLayout();
    let s = `<div class="cp-section"><div class="cp-label">Hotkeys</div><div class="cp-hk-grid">`;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        const cell = layout.rows[r][c];
        if (!cell) {
          const ROW_KEYS = [
            ['Q', 'W', 'E', 'R', 'T'],
            ['A', 'S', 'D', 'F', 'G'],
            ['Z', 'X', 'C', 'V', 'B'],
          ];
          s += `<div class="cp-hk-cell empty"><span class="cp-hk-key">${ROW_KEYS[r][c]}</span></div>`;
        } else {
          const cls = cell.enabled ? '' : ' disabled';
          const cdH = cell.cooldownPct > 0 ? `${(cell.cooldownPct * 100).toFixed(0)}%` : '0%';
          s += `<div class="cp-hk-cell${cls}" data-hk-row="${r}" data-hk-col="${c}">`;
          if (cell.cooldownPct > 0) {
            s += `<div class="cp-hk-cd-overlay" style="height:${cdH}"></div>`;
          }
          s += `<span class="cp-hk-key">${cell.key}</span>`;
          s += `<span class="cp-hk-label">${cell.label}</span>`;
          if (cell.sublabel) {
            s += `<span class="cp-hk-sub">${cell.sublabel}</span>`;
          }
          s += `</div>`;
        }
      }
    }

    s += `</div></div>`;
    return s;
  }

  // ── Button binding ───────────────────────────────────────────

  private bindButtons(): void {
    const unequipBtns = this.container.querySelectorAll('.cp-unequip-btn');
    unequipBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const el = e.currentTarget as HTMLElement;
        const unitId = el.dataset.unitId;
        const slotIndex = parseInt(el.dataset.slot || '0', 10);
        const unit = this.selectedUnits.find((u) => u.entityId === unitId);
        if (unit) {
          EventBus.emit('unequip-wargear', { unit, slotIndex });
        }
      });
    });

    // Hotkey grid cell clicks
    const hkCells = this.container.querySelectorAll('.cp-hk-cell:not(.empty):not(.disabled)');
    hkCells.forEach((el) => {
      el.addEventListener('click', () => {
        const row = parseInt((el as HTMLElement).dataset.hkRow || '0', 10);
        const col = parseInt((el as HTMLElement).dataset.hkCol || '0', 10);
        const layout = this.hotkeyGrid.getLayout();
        const cell = layout.rows[row]?.[col];
        if (cell && cell.enabled) cell.action();
      });
    });

    // Tech tree toggle
    const techToggle = this.container.querySelector('.cp-tech-toggle-btn');
    if (techToggle) {
      techToggle.addEventListener('click', () => {
        this.showTechTree = !this.showTechTree;
        this.render();
      });
    }

    // Tech node unlock clicks
    const techNodes = this.container.querySelectorAll('.cp-tech-node.available');
    techNodes.forEach((el) => {
      el.addEventListener('click', () => {
        const nodeId = (el as HTMLElement).dataset.nodeId;
        if (nodeId && unlockNode(nodeId)) {
          this.render();
        }
      });
    });
  }

  // ── Helpers ──────────────────────────────────────────────────

  private formatName(type: string): string {
    return type
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  destroy(): void {
    EventBus.off('selection-changed', this.onSelectionChanged, this);
    this.container.remove();
    this.styleEl.remove();
  }
}
