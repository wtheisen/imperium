import { EventBus } from '../EventBus';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { AbilityComponent } from '../components/AbilityComponent';
import { ProductionComponent, TRAINABLE_UNITS } from '../components/ProductionComponent';

/**
 * AOE2 DE–style grid hotkey system.
 *
 * Entity-specific actions fill sequentially from Q→W→E→R→T→A→S→…
 * Universal commands (stop, hold, attack-move) fill the last row.
 *
 * Building (Drop Ship):  Q=Servitor  W=Scout  E=Infantry  R=Combat Sq  T=Requisition
 * Unit (Marine):         Q=Shield Wall  W=War Cry  (wargear fills E,R,T…)
 *
 * Last row always: Z=Attack Move  X=Stop  C=Hold Position  (when units selected)
 */

export interface HotkeyCell {
  key: string;           // display key label
  label: string;         // action name
  sublabel?: string;     // e.g. cost
  enabled: boolean;      // can be pressed right now
  cooldownPct: number;   // 0 = ready, 1 = full cooldown
  action: () => void;
}

export type HotkeyRow = (HotkeyCell | null)[];  // null = empty slot

export interface HotkeyLayout {
  rows: [HotkeyRow, HotkeyRow, HotkeyRow];
}

// The three keyboard rows
const ROW_KEYS = [
  ['q', 'w', 'e', 'r', 't'],
  ['a', 's', 'd', 'f', 'g'],
  ['z', 'x', 'c', 'v', 'b'],
];

const ALL_KEYS = ROW_KEYS.flat(); // 15 slots total

function keyLabel(flatIndex: number): string {
  return ALL_KEYS[flatIndex]?.toUpperCase() ?? '?';
}

export class HotkeyGrid {
  private selectedUnits: Unit[] = [];
  private selectedBuilding: Building | null = null;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor() {
    EventBus.on('selection-changed', this.onSelectionChanged, this);

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.repeat) return;
      const key = e.key.toLowerCase();

      // Find which row/col this key belongs to
      for (let r = 0; r < ROW_KEYS.length; r++) {
        const col = ROW_KEYS[r].indexOf(key);
        if (col === -1) continue;

        const layout = this.getLayout();
        const cell = layout.rows[r][col];
        if (cell && cell.enabled) {
          cell.action();
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  private onSelectionChanged = (data: { entities: Unit[]; building?: Building }) => {
    this.selectedUnits = data.entities || [];
    this.selectedBuilding = data.building ?? null;
  };

  /** Build the current hotkey layout based on selection state. */
  getLayout(): HotkeyLayout {
    // Flat array of 15 cells, then split into 3 rows of 5
    const cells: (HotkeyCell | null)[] = new Array(15).fill(null);
    let slot = 0; // next slot to fill with entity-specific actions

    const hasUnits = this.selectedUnits.length > 0;
    const hasBuilding = !!this.selectedBuilding;

    // ── Entity-specific actions fill from slot 0 onward ──

    if (hasBuilding && this.selectedBuilding) {
      const production = this.selectedBuilding.getComponent<ProductionComponent>('production');
      if (production) {
        // Train unit buttons
        for (const trainable of TRAINABLE_UNITS) {
          if (slot >= 15) break;
          const building = this.selectedBuilding;
          const s = slot;
          cells[s] = {
            key: keyLabel(s),
            label: trainable.name,
            sublabel: `${trainable.cost}g`,
            enabled: true,
            cooldownPct: 0,
            action: () => {
              EventBus.emit('train-unit', { unit: trainable, building });
            },
          };
          slot++;
        }
        // Requisition card
        if (slot < 15) {
          const building = this.selectedBuilding;
          const s = slot;
          cells[s] = {
            key: keyLabel(s),
            label: 'Requisition',
            sublabel: '3g',
            enabled: true,
            cooldownPct: 0,
            action: () => {
              EventBus.emit('requisition-card', { cost: 3, building });
            },
          };
          slot++;
        }
      }
    }

    if (hasUnits) {
      // Unit abilities (from primary unit, AOE2 style)
      const primaryUnit = this.selectedUnits[0];
      const abilityComp = primaryUnit.getComponent<AbilityComponent>('ability');
      if (abilityComp) {
        const abilities = abilityComp.getAbilities();
        for (let i = 0; i < abilities.length; i++) {
          if (slot >= 15) break;
          const ab = abilities[i];
          const cdPct = ab.definition.cooldown > 0
            ? ab.cooldownRemaining / ab.definition.cooldown
            : 0;
          const ready = ab.cooldownRemaining <= 0;
          const idx = i;
          const s = slot;
          cells[s] = {
            key: keyLabel(s),
            label: ab.definition.name,
            enabled: ready,
            cooldownPct: cdPct,
            action: () => {
              for (const unit of this.selectedUnits) {
                const ac = unit.getComponent<AbilityComponent>('ability');
                if (ac) ac.activate(idx);
              }
            },
          };
          slot++;
        }
      }

      // ── Universal commands: always in last row (Z X C) ──
      cells[10] = {
        key: 'Z',
        label: 'Attack Move',
        enabled: true,
        cooldownPct: 0,
        action: () => {
          EventBus.emit('attack-move-cursor', { active: true });
        },
      };
      cells[11] = {
        key: 'X',
        label: 'Stop',
        enabled: true,
        cooldownPct: 0,
        action: () => {
          EventBus.emit('command-stop', { units: [...this.selectedUnits] });
        },
      };
      cells[12] = {
        key: 'C',
        label: 'Hold',
        enabled: true,
        cooldownPct: 0,
        action: () => {
          EventBus.emit('command-hold', { units: [...this.selectedUnits] });
        },
      };
      cells[13] = {
        key: 'V',
        label: 'Patrol',
        enabled: true,
        cooldownPct: 0,
        action: () => {
          EventBus.emit('patrol-mode-cursor', { active: true });
        },
      };
      cells[14] = {
        key: 'B',
        label: 'Explore',
        enabled: true,
        cooldownPct: 0,
        action: () => {
          EventBus.emit('command-explore', { units: [...this.selectedUnits] });
        },
      };
    }

    return {
      rows: [
        cells.slice(0, 5) as HotkeyRow,
        cells.slice(5, 10) as HotkeyRow,
        cells.slice(10, 15) as HotkeyRow,
      ],
    };
  }

  destroy(): void {
    EventBus.off('selection-changed', this.onSelectionChanged, this);
    document.removeEventListener('keydown', this.keyHandler);
  }
}
