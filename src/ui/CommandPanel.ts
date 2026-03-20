import './command-panel.css';
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
import { getTechTree, canUnlockNode, unlockNode, canUnlockNodeForInstance, unlockNodeForInstance, getAvailableXpForInstance, TechNode } from '../state/TechTree';
import { getPlayerState, getCardInstance } from '../state/PlayerState';
import { HotkeyGrid, HotkeyLayout, HotkeyCell } from './HotkeyGrid';

interface SelectionData {
  entities: Unit[];
  building?: Building;
}

export class CommandPanel {
  private container: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private selectedUnits: Unit[] = [];
  private selectedBuilding: Building | undefined;
  private showTechTree: boolean = false;
  private lastRenderTime: number = 0;
  private dirty: boolean = true;
  private hotkeyGrid: HotkeyGrid;

  constructor(hotkeyGrid: HotkeyGrid) {
    this.hotkeyGrid = hotkeyGrid;

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

    const inst = unit.cardInstanceId ? getCardInstance(unit.cardInstanceId) : undefined;
    const vetData = inst?.veteranData;
    const tierLabels = ['', 'Battle-Hardened', 'Veteran', 'Hero'];
    const typeName = this.formatName(unit.unitType);

    let headerSub = `${unit.team} unit`;
    if (vetData) {
      headerSub = `${tierLabels[vetData.tier] ?? 'Veteran'} · ${vetData.kills} kills`;
    }
    const headerName = vetData ? vetData.name : typeName;
    let s = `<div class="cp-header" style="${vetData ? 'color:#c8982a;' : ''}">${headerName}<div class="cp-header-sub">${headerSub}</div></div>`;

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
    const inst = unit.cardInstanceId ? getCardInstance(unit.cardInstanceId) : undefined;
    const vetData = inst?.veteranData;

    const unitXp = inst ? inst.xp : unit.xp;
    const levelBadge = unit.getComponent<LevelBadgeComponent>('levelBadge');
    const level = vetData ? (vetData.unlockedNodes.length) : (levelBadge?.level ?? 0);
    const tree = getTechTree(unit.unitType);
    const totalNodes = tree.length;

    // XP bar toward next veteran tier
    const VET_THRESHOLDS = [30, 120, 300];
    const nextThreshold = VET_THRESHOLDS.find(t => unitXp < t) ?? VET_THRESHOLDS[VET_THRESHOLDS.length - 1];
    const prevThreshold = VET_THRESHOLDS[VET_THRESHOLDS.indexOf(nextThreshold) - 1] ?? 0;
    const xpBarPct = Math.min(100, ((unitXp - prevThreshold) / (nextThreshold - prevThreshold)) * 100);

    const tierLabel = vetData ? (['', 'Battle-Hardened', 'Veteran', 'Hero'][vetData.tier] ?? '') : 'Recruit';
    const badgeColor = vetData ? '#c8982a' : '#5a7a9a';

    let s = `<div class="cp-section">`;
    s += `<div class="cp-xp-row">`;
    s += `<span class="cp-level-badge" style="background:${badgeColor}22;border-color:${badgeColor}55;color:${badgeColor};">${level}</span>`;
    s += `<div class="cp-xp-info">`;
    if (vetData) {
      s += `<div class="cp-xp-text" style="color:#c8982a;">${tierLabel} · ${unitXp} XP · ${level}/${totalNodes} nodes</div>`;
    } else {
      s += `<div class="cp-xp-text">${unitXp} XP · ${level}/${totalNodes} upgrades</div>`;
    }
    s += `<div class="cp-xp-bar-bg"><div class="cp-xp-bar" style="width:${xpBarPct}%;background:${badgeColor};"></div></div>`;
    s += `</div></div>`;

    if (vetData && inst) {
      const avail = getAvailableXpForInstance(inst);
      s += `<div style="font-size:9px;color:rgba(200,152,42,0.5);padding:2px 0;">${avail} XP available for upgrades · ${vetData.missionsCompleted} missions</div>`;
    }

    // Tech tree toggle
    const label = this.showTechTree ? 'Hide Tech Tree' : 'View Tech Tree';
    s += `<button class="cp-btn cp-tech-toggle cp-tech-toggle-btn">${label}</button>`;

    // Inline tech tree
    if (this.showTechTree) {
      s += this.renderTechTree(unit.unitType, inst ?? undefined);
    }

    s += `</div>`;
    return s;
  }

  private renderTechTree(unitType: string, inst?: import('../state/PlayerState').CardInstance): string {
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
          s += `<div class="cp-tech-fork"><div class="cp-tech-line"></div></div>`;
        } else {
          s += `<div class="cp-tech-connector"><div class="cp-tech-line"></div></div>`;
        }
      }

      // Sort nodes: branch 0 (root) center, branch 1 left, branch 2 right
      nodes.sort((a, b) => a.branch - b.branch);

      s += `<div class="cp-tech-tier">`;
      for (const node of nodes) {
        let isUnlocked: boolean;
        let isAvailable: boolean;
        if (inst?.veteranData) {
          isUnlocked = inst.veteranData.unlockedNodes.includes(node.id);
          isAvailable = !isUnlocked && canUnlockNodeForInstance(node.id, inst);
        } else {
          isUnlocked = !canUnlockNode(node.id) && this.isNodeUnlockedGlobal(node.id);
          isAvailable = canUnlockNode(node.id);
        }
        const stateClass = isUnlocked ? 'unlocked' : isAvailable ? 'available' : 'locked';

        s += `<div class="cp-tech-node ${stateClass}" data-node-id="${node.id}" data-instance-id="${inst?.instanceId ?? ''}">`;
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

  private isNodeUnlockedGlobal(nodeId: string): boolean {
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
        const instanceId = (el as HTMLElement).dataset.instanceId;
        if (!nodeId) return;
        if (instanceId) {
          const inst = getCardInstance(instanceId);
          if (inst && unlockNodeForInstance(nodeId, inst)) this.render();
        } else if (unlockNode(nodeId)) {
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
  }
}
