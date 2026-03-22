import './drop-site.css';
import { GameSceneInterface, getSceneManager } from './SceneManager';
import { MissionDefinition } from '../missions/MissionDefinition';
import { MapManager, TerrainType } from '../map/MapManager';
import { MAP_WIDTH, MAP_HEIGHT, HAND_SIZE } from '../config';
import { Card } from '../cards/Card';
import { Deck } from '../cards/Deck';
import { getSelectedDeckCards } from '../state/PlayerState';
import { getCardArtRenderer } from '../renderer/CardArtRenderer';
import { getScannerLevel } from '../ship/ShipState';
import { POIDefinition } from '../missions/MissionDefinition';
import { PackDefinition } from '../packs/PackTypes';

const TILE_PX = 12;

const TERRAIN_COLORS: Record<number, string> = {
  [TerrainType.GRASS]: '#4a6b3a',
  [TerrainType.WATER]: '#2a4a6a',
  [TerrainType.GOLD_MINE]: '#c8a84e',
  [TerrainType.STONE]: '#6a6a6a',
  [TerrainType.DIRT]: '#7a6a4a',
  [TerrainType.FOREST]: '#2a4a2a',
  [TerrainType.METAL_FLOOR]: '#50525a',
  [TerrainType.HULL_WALL]: '#23252a',
};

const LEGEND_ITEMS: { color: string; label: string; round?: boolean }[] = [
  { color: '#4a6b3a', label: 'GRASS' },
  { color: '#2a4a6a', label: 'WATER' },
  { color: '#2a4a2a', label: 'FOREST' },
  { color: '#6a6a6a', label: 'STONE' },
  { color: '#7a6a4a', label: 'DIRT' },
  { color: '#c8a84e', label: 'GOLD' },
  { color: '#aa3333', label: 'ENEMY', round: true },
  { color: '#4488ff', label: 'OBJ', round: true },
];

export class DropSiteScene implements GameSceneInterface {
  id = 'DropSiteScene';

  private container: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private mission!: MissionDefinition;
  private mapManager!: MapManager;
  private selectedX: number = -1;
  private selectedY: number = -1;
  private hoverX: number = -1;
  private hoverY: number = -1;
  private validZones: { x: number; y: number; label: string }[] = [];
  private deck: Deck | null = null;
  private mulliganCount: number = 0;
  private mulliganCardEls: HTMLElement[] = [];
  private generatedPOIs: POIDefinition[] = [];
  private generatedPacks: PackDefinition[] = [];
  private scannerLevel: number = 0;

  create(data?: { mission?: MissionDefinition }): void {
    if (!data?.mission) {
      getSceneManager().start('MissionSelectScene');
      return;
    }
    this.mission = data.mission;

    this.mapManager = new MapManager();
    this.mapManager.loadMissionTerrain(this.mission);

    // Read procedurally generated PoIs and packs for scanner overlay
    this.generatedPOIs = [
      ...(this.mission.pointsOfInterest ?? []),
      ...this.mapManager.getGeneratedPOIs(),
    ];
    this.generatedPacks = [
      ...(this.mission.packSpawns ?? []),
      ...this.mapManager.getGeneratedPacks(),
    ];
    this.scannerLevel = getScannerLevel();

    this.validZones = this.computeDropZones();
    // No selection yet — marker follows cursor until first click
    this.selectedX = -1;
    this.selectedY = -1;

    // Build deck for mulligan preview
    const startingCards: Card[] = getSelectedDeckCards();
    this.deck = new Deck(startingCards);
    this.mulliganCount = 0;

    this.buildUI();
    this.drawMap();
  }

  private computeDropZones(): { x: number; y: number; label: string }[] {
    const zones: { x: number; y: number; label: string }[] = [];
    const margin = 4;
    const campMinDist = 8;

    const candidates = [
      { x: margin + 2, y: margin + 2, label: 'NW Quadrant' },
      { x: MAP_WIDTH - margin - 2, y: margin + 2, label: 'NE Quadrant' },
      { x: margin + 2, y: MAP_HEIGHT - margin - 2, label: 'SW Quadrant' },
      { x: MAP_WIDTH - margin - 2, y: MAP_HEIGHT - margin - 2, label: 'SE Quadrant' },
      { x: Math.floor(MAP_WIDTH / 2), y: margin + 2, label: 'North Edge' },
      { x: Math.floor(MAP_WIDTH / 2), y: MAP_HEIGHT - margin - 2, label: 'South Edge' },
      { x: margin + 2, y: Math.floor(MAP_HEIGHT / 2), label: 'West Edge' },
      { x: MAP_WIDTH - margin - 2, y: Math.floor(MAP_HEIGHT / 2), label: 'East Edge' },
    ];

    for (const c of candidates) {
      let tooClose = false;
      for (const camp of this.mission.enemyCamps) {
        const dist = Math.abs(c.x - camp.tileX) + Math.abs(c.y - camp.tileY);
        if (dist < campMinDist) { tooClose = true; break; }
      }
      if (tooClose) continue;
      if (!this.mapManager.isWalkable(c.x, c.y)) continue;
      zones.push(c);
    }

    const hasDefault = zones.some(z =>
      z.x === this.mission.playerStartX && z.y === this.mission.playerStartY
    );
    if (!hasDefault) {
      zones.unshift({ x: this.mission.playerStartX, y: this.mission.playerStartY, label: 'Designated LZ' });
    }

    return zones;
  }

  private buildUI(): void {
    this.container = document.createElement('div');
    this.container.id = 'drop-site-ui';
    Object.assign(this.container.style, {
      position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      zIndex: '10', overflow: 'hidden',
      fontFamily: '"Share Tech Mono", monospace',
      color: '#c8bfa0',
      background: 'linear-gradient(160deg, #0a0a0e 0%, #12100c 40%, #0e0c08 100%)',
      display: 'flex', flexDirection: 'column',
    });

    const mapW = MAP_WIDTH * TILE_PX;
    const mapH = MAP_HEIGHT * TILE_PX;

    this.container.innerHTML = `
      <!-- Atmospheric layers -->
      <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden;">
        <div style="position:absolute;inset:0;opacity:0.015;
          background:repeating-linear-gradient(45deg,transparent,transparent 18px,#c8982a 18px,#c8982a 20px);"></div>
        <div style="position:absolute;left:0;right:0;height:2px;
          background:linear-gradient(90deg,transparent,rgba(200,191,160,0.05),transparent);
          animation:ds-scanline 8s linear infinite;"></div>
        <div style="position:absolute;inset:0;
          background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.6) 100%);"></div>
      </div>

      <!-- Top bar -->
      <div style="position:relative;display:flex;align-items:center;padding:14px 28px;
        border-bottom:1px solid rgba(200,152,42,0.1);flex-shrink:0;
        background:linear-gradient(180deg,rgba(200,152,42,0.03) 0%,transparent 100%);">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:3px;height:24px;background:#c8982a;"></div>
          <div>
            <div style="font-family:'Teko',sans-serif;font-size:13px;font-weight:500;
              color:rgba(200,152,42,0.45);letter-spacing:3px;">DROP SITE SELECTION // ORBITAL AUSPEX</div>
          </div>
        </div>
        <div style="flex:1;"></div>
        <div style="font-size:10px;color:rgba(200,191,160,0.25);letter-spacing:2px;">
          ${this.mission.name.toUpperCase()}</div>
      </div>

      <!-- Main content -->
      <div style="position:relative;flex:1;display:flex;align-items:stretch;
        padding:16px 24px;gap:24px;overflow:auto;min-height:0;">

        <!-- Left: Mission Briefing -->
        <div style="width:260px;flex-shrink:0;display:flex;flex-direction:column;gap:0;
          background:linear-gradient(270deg, rgba(10,10,14,0.7) 0%, rgba(10,10,14,0.92) 30%, rgba(10,10,14,0.95) 100%);
          padding-right:16px;
          overflow-y:auto;animation:ds-fade-in 0.4s ease-out;">

          <!-- Mission name -->
          <div style="font-family:'Teko',sans-serif;font-size:28px;font-weight:700;
            color:#e8dcc0;letter-spacing:4px;line-height:1.1;margin-bottom:4px;
            word-break:break-word;">${this.mission.name.toUpperCase()}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
            <div style="display:flex;gap:3px;">
              ${[1,2,3].map(d => `<div style="width:18px;height:5px;
                background:${d <= this.mission.difficulty ? '#c43030' : 'rgba(200,191,160,0.08)'};
                ${d <= this.mission.difficulty ? 'box-shadow:0 0 6px rgba(196,48,48,0.3);' : ''}"></div>`).join('')}
            </div>
            <div style="font-size:9px;letter-spacing:2px;color:rgba(200,191,160,0.3);">THREAT ${this.mission.difficulty}/3</div>
          </div>

          <!-- Briefing -->
          <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.35);margin-bottom:6px;">MISSION BRIEFING</div>
          <div style="font-size:11px;color:rgba(200,191,160,0.5);line-height:1.6;margin-bottom:16px;">
            ${this.mission.description}</div>

          <!-- Divider -->
          <div style="height:1px;background:linear-gradient(90deg,rgba(200,152,42,0.15),transparent);margin-bottom:14px;"></div>

          <!-- Primary Objectives -->
          <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.35);margin-bottom:8px;">PRIMARY OBJECTIVES</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
            ${this.mission.objectives.map(obj => `
              <div style="padding:8px 10px;background:rgba(200,152,42,0.03);
                border-left:2px solid rgba(85,153,255,0.4);">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                  <div style="font-size:8px;letter-spacing:1px;color:#5599ff;
                    background:rgba(85,153,255,0.1);padding:1px 5px;">${obj.type.toUpperCase()}</div>
                  <div style="font-size:8px;color:rgba(200,191,160,0.3);">+${obj.goldReward} REQ</div>
                </div>
                <div style="font-family:'Teko',sans-serif;font-size:15px;font-weight:500;
                  color:#c8bfa0;letter-spacing:1px;">${obj.name}</div>
                <div style="font-size:9px;color:rgba(200,191,160,0.35);line-height:1.4;margin-top:2px;">
                  ${obj.description}</div>
              </div>
            `).join('')}
          </div>

          <!-- Optional Objectives -->
          ${(this.mission.optionalObjectives && this.mission.optionalObjectives.length > 0) ? `
            <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.35);margin-bottom:8px;">BONUS OBJECTIVES</div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
              ${this.mission.optionalObjectives.map(obj => `
                <div style="padding:8px 10px;background:rgba(200,152,42,0.02);
                  border-left:2px solid rgba(200,152,42,0.25);">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                    <div style="font-size:8px;letter-spacing:1px;color:#c8982a;
                      background:rgba(200,152,42,0.08);padding:1px 5px;">${obj.type.toUpperCase()}</div>
                    <div style="font-size:8px;color:rgba(200,191,160,0.3);">+${obj.goldReward} REQ</div>
                  </div>
                  <div style="font-family:'Teko',sans-serif;font-size:15px;font-weight:500;
                    color:#c8bfa0;letter-spacing:1px;">${obj.name}</div>
                  <div style="font-size:9px;color:rgba(200,191,160,0.35);line-height:1.4;margin-top:2px;">
                    ${obj.description}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <!-- Mission Stats -->
          <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.35);margin-bottom:8px;">FIELD CONDITIONS</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;justify-content:space-between;padding:4px 8px;
              background:rgba(200,191,160,0.02);border-left:2px solid rgba(200,152,42,0.15);">
              <span style="font-size:9px;color:rgba(200,191,160,0.3);">STARTING REQ</span>
              <span style="font-family:'Teko',sans-serif;font-size:16px;color:#c8982a;font-weight:600;line-height:1;">${this.mission.startingGold}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 8px;
              background:rgba(200,191,160,0.02);border-left:2px solid rgba(200,152,42,0.15);">
              <span style="font-size:9px;color:rgba(200,191,160,0.3);">SUPPLY INTERVAL</span>
              <span style="font-family:'Teko',sans-serif;font-size:16px;color:rgba(200,191,160,0.5);font-weight:500;line-height:1;">${Math.round(this.mission.supplyDropIntervalMs / 1000)}s</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 8px;
              background:rgba(200,191,160,0.02);border-left:2px solid rgba(196,48,48,0.2);">
              <span style="font-size:9px;color:rgba(200,191,160,0.3);">ENEMY CAMPS</span>
              <span style="font-family:'Teko',sans-serif;font-size:16px;color:#c43030;font-weight:500;line-height:1;">${this.mission.enemyCamps.length}</span>
            </div>
          </div>
        </div>

        <!-- Center: Map -->
        <div style="display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;
          animation:ds-fade-in 0.4s ease-out 0.05s both;flex:1;min-width:0;">
          <!-- Map frame -->
          <div style="position:relative;border:1px solid rgba(200,152,42,0.15);
            box-shadow:0 0 20px rgba(0,0,0,0.4), inset 0 0 30px rgba(0,0,0,0.2);
            animation:ds-glow-pulse 4s ease-in-out infinite;">
            <!-- Corner decorations -->
            <div style="position:absolute;top:-1px;left:-1px;width:12px;height:12px;
              border-top:2px solid rgba(200,152,42,0.4);border-left:2px solid rgba(200,152,42,0.4);pointer-events:none;"></div>
            <div style="position:absolute;top:-1px;right:-1px;width:12px;height:12px;
              border-top:2px solid rgba(200,152,42,0.4);border-right:2px solid rgba(200,152,42,0.4);pointer-events:none;"></div>
            <div style="position:absolute;bottom:-1px;left:-1px;width:12px;height:12px;
              border-bottom:2px solid rgba(200,152,42,0.4);border-left:2px solid rgba(200,152,42,0.4);pointer-events:none;"></div>
            <div style="position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;
              border-bottom:2px solid rgba(200,152,42,0.4);border-right:2px solid rgba(200,152,42,0.4);pointer-events:none;"></div>

            <canvas id="drop-map" width="${mapW}" height="${mapH}"
              style="display:block;cursor:crosshair;image-rendering:pixelated;"></canvas>

            <!-- Coordinate readout -->
            <div id="drop-coords" style="position:absolute;bottom:6px;right:8px;
              font-size:9px;color:rgba(200,152,42,0.35);pointer-events:none;letter-spacing:1px;"></div>
          </div>

          <!-- Legend -->
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            ${LEGEND_ITEMS.map(l => `
              <div style="display:flex;align-items:center;gap:4px;">
                <div style="width:8px;height:8px;background:${l.color};
                  ${l.round ? 'border-radius:50%;' : ''}opacity:0.7;"></div>
                <div style="font-size:8px;color:rgba(200,191,160,0.25);letter-spacing:1px;">${l.label}</div>
              </div>
            `).join('')}
            ${this.scannerLevel >= 1 ? `
              <div style="display:flex;align-items:center;gap:4px;">
                <div style="width:8px;height:8px;background:rgba(200,191,160,0.5);border-radius:50%;opacity:0.7;"></div>
                <div style="font-size:8px;color:rgba(200,191,160,0.25);letter-spacing:1px;">POI</div>
              </div>
            ` : ''}
            ${this.scannerLevel >= 3 ? `
              <div style="display:flex;align-items:center;gap:4px;">
                <div style="width:8px;height:6px;background:#c8982a;opacity:0.7;"></div>
                <div style="font-size:8px;color:rgba(200,191,160,0.25);letter-spacing:1px;">CACHE</div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Right: Controls -->
        <div style="width:220px;flex-shrink:0;display:flex;flex-direction:column;gap:0;
          background:linear-gradient(90deg, rgba(10,10,14,0.7) 0%, rgba(10,10,14,0.92) 30%, rgba(10,10,14,0.95) 100%);
          padding-left:16px;
          animation:ds-fade-in 0.5s ease-out 0.1s both;">

          <!-- Header -->
          <div style="font-family:'Teko',sans-serif;font-size:30px;font-weight:700;
            color:#e8dcc0;letter-spacing:5px;line-height:1;margin-bottom:4px;
            animation:ds-header-in 0.6s ease-out;">DROP SITE</div>
          <div style="font-size:9px;color:rgba(200,191,160,0.3);letter-spacing:2px;margin-bottom:16px;">
            SELECT LANDING ZONE OR CLICK MAP</div>

          <!-- Landing zones -->
          <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.35);margin-bottom:8px;">
            AVAILABLE LANDING ZONES</div>
          <div id="zone-list" style="display:flex;flex-direction:column;gap:3px;margin-bottom:16px;"></div>

          <!-- Intel readout -->
          <div style="border-top:1px solid rgba(200,152,42,0.06);padding-top:14px;margin-bottom:16px;">
            <div style="font-size:9px;letter-spacing:2px;color:rgba(200,152,42,0.35);margin-bottom:10px;">
              AUSPEX INTEL</div>
            <div id="drop-info" style="display:flex;flex-direction:column;gap:6px;"></div>
          </div>

          <!-- Deploy button -->
          <button id="deploy-btn" style="
            position:relative;overflow:hidden;
            padding:12px 0;width:100%;
            background:linear-gradient(180deg,rgba(196,48,48,0.06) 0%,rgba(196,48,48,0.02) 100%);
            color:rgba(196,48,48,0.4);
            border:1px solid rgba(196,48,48,0.2);
            font-family:'Teko',sans-serif;font-size:20px;font-weight:600;
            letter-spacing:6px;cursor:not-allowed;
            transition:all 0.3s;
          ">SELECT DROP SITE</button>

          <!-- Back -->
          <button id="back-btn" style="
            margin-top:8px;padding:7px 0;width:100%;
            background:transparent;
            border:1px solid rgba(200,191,160,0.08);
            color:#4a4a3a;
            font-family:'Share Tech Mono',monospace;font-size:10px;
            letter-spacing:2px;cursor:pointer;transition:all 0.2s;
          ">ABORT</button>
        </div>
      </div>

      <!-- Bottom: Opening Hand / Mulligan -->
      <div style="position:relative;flex-shrink:0;padding:10px 28px 16px;
        border-top:1px solid rgba(200,152,42,0.1);
        background:linear-gradient(0deg,rgba(10,10,14,0.95) 0%,rgba(10,10,14,0.7) 100%);">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px;">
          <div style="width:2px;height:14px;background:#c8982a;"></div>
          <div id="mulligan-header" style="font-family:'Teko',sans-serif;font-size:13px;font-weight:500;
            color:rgba(200,152,42,0.45);letter-spacing:3px;">OPENING HAND</div>
          <div style="flex:1;"></div>
          <div id="mulligan-status" style="font-family:'Share Tech Mono',monospace;font-size:10px;
            color:rgba(200,191,160,0.3);letter-spacing:1px;"></div>
          <button id="mulligan-btn" style="
            padding:5px 16px;
            background:linear-gradient(180deg,rgba(196,48,48,0.08) 0%,rgba(196,48,48,0.03) 100%);
            border:1px solid rgba(196,48,48,0.25);
            color:#c43030;
            font-family:'Teko',sans-serif;font-size:14px;font-weight:600;
            letter-spacing:3px;cursor:pointer;transition:all 0.2s;
          ">MULLIGAN</button>
        </div>
        <div id="mulligan-hand" style="display:flex;align-items:center;justify-content:center;gap:10px;"></div>
      </div>
    `;

    document.getElementById('game-container')!.appendChild(this.container);
    this.canvas = this.container.querySelector('#drop-map') as HTMLCanvasElement;

    // Wire zone buttons
    const zoneList = this.container.querySelector('#zone-list')!;
    for (let i = 0; i < this.validZones.length; i++) {
      const zone = this.validZones[i];
      const isSelected = zone.x === this.selectedX && zone.y === this.selectedY;
      const btn = document.createElement('button');
      btn.className = 'ds-zone-btn';
      btn.dataset.active = isSelected ? 'true' : 'false';
      Object.assign(btn.style, {
        padding: '7px 10px',
        background: isSelected ? 'rgba(200,152,42,0.08)' : 'transparent',
        border: `1px solid ${isSelected ? 'rgba(200,152,42,0.4)' : 'rgba(200,191,160,0.06)'}`,
        color: isSelected ? '#c8982a' : '#5a5a4a',
        fontFamily: '"Share Tech Mono",monospace',
        fontSize: '10px', cursor: 'pointer', textAlign: 'left',
        letterSpacing: '1px', width: '100%',
        animation: `ds-fade-in 0.25s ease-out ${i * 0.04}s both`,
      });

      btn.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span>${zone.label}</span>
          <span style="font-size:9px;opacity:0.4;">${zone.x},${zone.y}</span>
        </div>
      `;

      btn.addEventListener('click', () => {
        this.selectedX = zone.x;
        this.selectedY = zone.y;
        this.drawMap();
        this.updateInfo();
        this.updateZoneButtons();
        this.enableDeployButton();
      });
      zoneList.appendChild(btn);
    }

    // Build mulligan hand and wire button
    this.buildMulliganHand();
    this.updateMulliganStatus();

    const mulliganBtn = this.container.querySelector('#mulligan-btn') as HTMLElement;
    mulliganBtn.addEventListener('click', () => this.doMulligan());
    mulliganBtn.addEventListener('mouseenter', () => {
      mulliganBtn.style.background = 'linear-gradient(180deg,rgba(196,48,48,0.15) 0%,rgba(196,48,48,0.06) 100%)';
      mulliganBtn.style.borderColor = 'rgba(196,48,48,0.4)';
    });
    mulliganBtn.addEventListener('mouseleave', () => {
      mulliganBtn.style.background = 'linear-gradient(180deg,rgba(196,48,48,0.08) 0%,rgba(196,48,48,0.03) 100%)';
      mulliganBtn.style.borderColor = 'rgba(196,48,48,0.25)';
    });

    // Canvas click
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas!.getBoundingClientRect();
      const tx = Math.floor((e.clientX - rect.left) / TILE_PX);
      const ty = Math.floor((e.clientY - rect.top) / TILE_PX);
      if (tx >= 2 && tx < MAP_WIDTH - 2 && ty >= 2 && ty < MAP_HEIGHT - 2) {
        if (this.mapManager.isWalkable(tx, ty)) {
          this.selectedX = tx;
          this.selectedY = ty;
          this.drawMap();
          this.updateInfo();
          this.updateZoneButtons();
          this.enableDeployButton();
        }
      }
    });

    // Canvas hover
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas!.getBoundingClientRect();
      this.hoverX = Math.floor((e.clientX - rect.left) / TILE_PX);
      this.hoverY = Math.floor((e.clientY - rect.top) / TILE_PX);
      const coordsEl = this.container!.querySelector('#drop-coords');
      if (coordsEl) coordsEl.textContent = `${this.hoverX}, ${this.hoverY}`;
      this.drawMap();
      this.updateInfo();
    });

    // Deploy button
    const deployBtn = this.container.querySelector('#deploy-btn') as HTMLElement;
    deployBtn.addEventListener('mouseenter', () => {
      if (this.selectedX < 0) return;
      deployBtn.style.background = 'linear-gradient(180deg,rgba(200,152,42,0.2) 0%,rgba(200,152,42,0.08) 100%)';
      deployBtn.style.borderColor = 'rgba(200,152,42,0.6)';
      deployBtn.style.letterSpacing = '10px';
    });
    deployBtn.addEventListener('mouseleave', () => {
      if (this.selectedX < 0) return;
      deployBtn.style.background = 'linear-gradient(180deg,rgba(200,152,42,0.1) 0%,rgba(200,152,42,0.03) 100%)';
      deployBtn.style.borderColor = 'rgba(200,152,42,0.35)';
      deployBtn.style.letterSpacing = '6px';
    });
    deployBtn.addEventListener('click', () => {
      if (this.selectedX < 0) return;
      this.deploy();
    });

    // Back button
    const backBtn = this.container.querySelector('#back-btn') as HTMLElement;
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.borderColor = 'rgba(200,191,160,0.2)';
      backBtn.style.color = '#7a7a6a';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.borderColor = 'rgba(200,191,160,0.08)';
      backBtn.style.color = '#4a4a3a';
    });
    backBtn.addEventListener('click', () => getSceneManager().start('MissionSelectScene'));

    this.updateInfo();
  }

  private enableDeployButton(): void {
    const btn = this.container?.querySelector('#deploy-btn') as HTMLElement | null;
    if (!btn) return;
    btn.textContent = 'DEPLOY';
    btn.style.background = 'linear-gradient(180deg,rgba(200,152,42,0.1) 0%,rgba(200,152,42,0.03) 100%)';
    btn.style.color = '#c8982a';
    btn.style.borderColor = 'rgba(200,152,42,0.35)';
    btn.style.cursor = 'pointer';
  }

  private updateZoneButtons(): void {
    if (!this.container) return;
    this.container.querySelectorAll('.ds-zone-btn').forEach((el, i) => {
      const zone = this.validZones[i];
      if (!zone) return;
      const isSelected = zone.x === this.selectedX && zone.y === this.selectedY;
      (el as HTMLElement).dataset.active = isSelected ? 'true' : 'false';
      (el as HTMLElement).style.background = isSelected ? 'rgba(200,152,42,0.08)' : 'transparent';
      (el as HTMLElement).style.borderColor = isSelected ? 'rgba(200,152,42,0.4)' : 'rgba(200,191,160,0.06)';
      (el as HTMLElement).style.color = isSelected ? '#c8982a' : '#5a5a4a';
    });
  }

  private updateInfo(): void {
    const infoEl = this.container?.querySelector('#drop-info');
    if (!infoEl) return;

    // Use hover position if on the map, otherwise fall back to selected
    const infoX = (this.hoverX >= 0 && this.hoverX < MAP_WIDTH) ? this.hoverX : this.selectedX;
    const infoY = (this.hoverY >= 0 && this.hoverY < MAP_HEIGHT) ? this.hoverY : this.selectedY;

    let nearestCamp = Infinity;
    for (const camp of this.mission.enemyCamps) {
      const d = Math.abs(infoX - camp.tileX) + Math.abs(infoY - camp.tileY);
      if (d < nearestCamp) nearestCamp = d;
    }

    let nearestMine = Infinity;
    const mines = this.mapManager.getAllMines();
    for (const mine of mines) {
      const d = Math.abs(infoX - mine.tileX) + Math.abs(infoY - mine.tileY);
      if (d < nearestMine) nearestMine = d;
    }

    const dangerColor = nearestCamp < 8 ? '#c43030' : nearestCamp < 14 ? '#c8982a' : '#4a9e4a';
    const dangerLabel = nearestCamp < 8 ? 'DANGER CLOSE' : nearestCamp < 14 ? 'MODERATE' : 'SAFE';

    infoEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:6px 8px;background:rgba(200,191,160,0.02);border-left:2px solid rgba(200,152,42,0.2);">
        <div style="font-size:9px;color:rgba(200,191,160,0.3);letter-spacing:1px;">COORDINATES</div>
        <div style="font-family:'Teko',sans-serif;font-size:18px;font-weight:600;
          color:#c8982a;">${infoX < 0 || infoY < 0 ? '—' : `${infoX}, ${infoY}`}</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:6px 8px;background:rgba(200,191,160,0.02);border-left:2px solid ${dangerColor}30;">
        <div style="font-size:9px;color:rgba(200,191,160,0.3);letter-spacing:1px;">THREAT PROXIMITY</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:6px;height:6px;border-radius:50%;background:${dangerColor};
            box-shadow:0 0 4px ${dangerColor}60;"></div>
          <div style="font-family:'Teko',sans-serif;font-size:16px;font-weight:500;
            color:${dangerColor};">${nearestCamp} tiles</div>
          <div style="font-size:8px;color:${dangerColor};opacity:0.5;letter-spacing:1px;">${dangerLabel}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:6px 8px;background:rgba(200,191,160,0.02);border-left:2px solid rgba(200,168,78,0.2);">
        <div style="font-size:9px;color:rgba(200,191,160,0.3);letter-spacing:1px;">NEAREST GOLD</div>
        <div style="font-family:'Teko',sans-serif;font-size:16px;font-weight:500;
          color:#c8a84e;">${nearestMine === Infinity ? '—' : nearestMine + ' tiles'}</div>
      </div>
      ${this.scannerLevel >= 1 ? `
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:6px 8px;background:rgba(200,191,160,0.02);border-left:2px solid rgba(160,112,204,0.3);">
          <div style="font-size:9px;color:rgba(200,191,160,0.3);letter-spacing:1px;">AUSPEX CONTACTS</div>
          <div style="font-family:'Teko',sans-serif;font-size:16px;font-weight:500;
            color:#a070cc;">${this.generatedPOIs.length} PoI${this.scannerLevel >= 3 ? ` / ${this.generatedPacks.length} Caches` : ''}</div>
        </div>
      ` : ''}
    `;
  }

  private drawMap(): void {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d')!;
    const grid = this.mapManager.getTerrainGrid();

    // Terrain
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const t = grid[y]?.[x] ?? TerrainType.GRASS;
        ctx.fillStyle = TERRAIN_COLORS[t] || '#4a6b3a';
        ctx.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
      }
    }

    // Subtle grid overlay
    ctx.strokeStyle = 'rgba(200,191,160,0.03)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= MAP_WIDTH; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x * TILE_PX, 0);
      ctx.lineTo(x * TILE_PX, MAP_HEIGHT * TILE_PX);
      ctx.stroke();
    }
    for (let y = 0; y <= MAP_HEIGHT; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y * TILE_PX);
      ctx.lineTo(MAP_WIDTH * TILE_PX, y * TILE_PX);
      ctx.stroke();
    }

    // Enemy camps
    for (const camp of this.mission.enemyCamps) {
      // Aggro radius ring
      ctx.strokeStyle = 'rgba(170,51,51,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(
        camp.tileX * TILE_PX + TILE_PX / 2,
        camp.tileY * TILE_PX + TILE_PX / 2,
        camp.aggroRadius * TILE_PX, 0, Math.PI * 2
      );
      ctx.stroke();

      // Camp dot
      ctx.fillStyle = '#dd4444';
      ctx.beginPath();
      ctx.arc(camp.tileX * TILE_PX + TILE_PX / 2, camp.tileY * TILE_PX + TILE_PX / 2, TILE_PX * 0.9, 0, Math.PI * 2);
      ctx.fill();
      // Bright border
      ctx.strokeStyle = '#ff6666';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Objectives
    for (const obj of this.mission.objectives) {
      ctx.fillStyle = '#5599ff';
      ctx.beginPath();
      ctx.arc(obj.tileX * TILE_PX + TILE_PX / 2, obj.tileY * TILE_PX + TILE_PX / 2, TILE_PX * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#88bbff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Scanner-gated PoI markers
    if (this.scannerLevel >= 1) {
      const poiTypeColors: Record<string, string> = {
        gold_cache: '#c8982a', ammo_dump: '#50b0b0', med_station: '#60aa60',
        intel: '#6090cc', relic: '#a070cc',
      };
      for (const poi of this.generatedPOIs) {
        const cx = poi.tileX * TILE_PX + TILE_PX / 2;
        const cy = poi.tileY * TILE_PX + TILE_PX / 2;
        if (this.scannerLevel >= 2) {
          // Typed: colored dot
          ctx.fillStyle = poiTypeColors[poi.type] || '#888888';
          ctx.beginPath();
          ctx.arc(cx, cy, TILE_PX * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = poiTypeColors[poi.type] || '#888888';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          // Generic "?" marker
          ctx.fillStyle = 'rgba(200,191,160,0.5)';
          ctx.beginPath();
          ctx.arc(cx, cy, TILE_PX * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0a0a0e';
          ctx.font = `bold ${TILE_PX * 0.7}px "Teko", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', cx, cy + 1);
        }
      }
    }

    // Scanner level 3: show pack markers
    if (this.scannerLevel >= 3) {
      for (const pack of this.generatedPacks) {
        const cx = pack.tileX * TILE_PX + TILE_PX / 2;
        const cy = pack.tileY * TILE_PX + TILE_PX / 2;
        ctx.fillStyle = '#c8982a';
        ctx.fillRect(cx - TILE_PX * 0.35, cy - TILE_PX * 0.25, TILE_PX * 0.7, TILE_PX * 0.5);
        ctx.strokeStyle = '#e8d48b';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - TILE_PX * 0.35, cy - TILE_PX * 0.25, TILE_PX * 0.7, TILE_PX * 0.5);
      }
    }

    // Valid zones (markers)
    for (const zone of this.validZones) {
      if (zone.x === this.selectedX && zone.y === this.selectedY) continue;
      ctx.strokeStyle = 'rgba(232,212,139,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(zone.x * TILE_PX + TILE_PX / 2, zone.y * TILE_PX + TILE_PX / 2, TILE_PX * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      // Small center dot
      ctx.fillStyle = 'rgba(232,212,139,0.25)';
      ctx.beginPath();
      ctx.arc(zone.x * TILE_PX + TILE_PX / 2, zone.y * TILE_PX + TILE_PX / 2, TILE_PX * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    // Determine marker position: follows cursor until first click, then stays at selection
    const hasSelection = this.selectedX >= 0;
    const hovering = this.hoverX >= 0 && this.hoverX < MAP_WIDTH && this.hoverY >= 0 && this.hoverY < MAP_HEIGHT;

    // Hover crosshair (always follows cursor)
    if (hovering) {
      const hcx = this.hoverX * TILE_PX + TILE_PX / 2;
      const hcy = this.hoverY * TILE_PX + TILE_PX / 2;
      const walkable = this.mapManager.isWalkable(this.hoverX, this.hoverY);
      const hoverColor = walkable ? 'rgba(232,212,139,' : 'rgba(220,60,60,';

      ctx.strokeStyle = `${hoverColor}0.45)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hcx, 0); ctx.lineTo(hcx, MAP_HEIGHT * TILE_PX);
      ctx.moveTo(0, hcy); ctx.lineTo(MAP_WIDTH * TILE_PX, hcy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Hover tile highlight
      ctx.strokeStyle = `${hoverColor}0.6)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.hoverX * TILE_PX, this.hoverY * TILE_PX, TILE_PX, TILE_PX);
    }

    // Drop marker: at hover position if no selection yet, otherwise at selection
    const markerX = hasSelection ? this.selectedX : (hovering ? this.hoverX : -1);
    const markerY = hasSelection ? this.selectedY : (hovering ? this.hoverY : -1);

    if (markerX >= 0) {
      const cx = markerX * TILE_PX + TILE_PX / 2;
      const cy = markerY * TILE_PX + TILE_PX / 2;

      // Clearance radius
      ctx.strokeStyle = 'rgba(232,212,139,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, TILE_PX * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Outer ring
      ctx.strokeStyle = 'rgba(232,212,139,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE_PX * 1.2, 0, Math.PI * 2);
      ctx.stroke();

      // Inner filled dot
      ctx.fillStyle = '#e8d48b';
      ctx.beginPath();
      ctx.arc(cx, cy, TILE_PX * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // Center pip
      ctx.fillStyle = '#0a0a0e';
      ctx.beginPath();
      ctx.arc(cx, cy, TILE_PX * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private static readonly TYPE_COLORS: Record<string, string> = {
    unit: '#4488ff', building: '#44aa44', ordnance: '#8844cc',
    equipment: '#44dddd',
  };

  private static readonly TYPE_ICONS: Record<string, string> = {
    unit: '\u2694', building: '\u2302', ordnance: '\u2737',
    equipment: '\u2692',
  };

  private buildMulliganHand(): void {
    if (!this.container || !this.deck) return;
    const handEl = this.container.querySelector('#mulligan-hand');
    if (!handEl) return;
    handEl.innerHTML = '';
    this.mulliganCardEls = [];

    const artRenderer = getCardArtRenderer();
    const hand = this.deck.hand;
    let cardIdx = 0;

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];

      if (!card) {
        // Empty slot — show ghost for mulliganed-away slots
        const ghost = document.createElement('div');
        ghost.className = 'ds-mulligan-card';
        Object.assign(ghost.style, {
          opacity: '0.12', border: '2px dashed #3a3228',
          background: 'transparent', boxShadow: 'none',
        });
        const ghostLabel = document.createElement('div');
        Object.assign(ghostLabel.style, {
          position: 'absolute', inset: '0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Teko', sans-serif", fontSize: '14px', color: '#3a3228',
          letterSpacing: '2px',
        });
        ghostLabel.textContent = 'LOST';
        ghost.appendChild(ghostLabel);
        handEl.appendChild(ghost);
        continue;
      }

      const color = DropSiteScene.TYPE_COLORS[card.type] || '#666';
      const icon = DropSiteScene.TYPE_ICONS[card.type] || '';

      const cardEl = document.createElement('div');
      cardEl.className = 'ds-mulligan-card';
      cardEl.style.animation = `ds-card-in 0.35s ease-out ${cardIdx * 0.08}s both`;
      cardIdx++;

      // Title bar
      const titleBar = document.createElement('div');
      Object.assign(titleBar.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '3px 5px 2px 7px',
        background: 'linear-gradient(180deg, rgba(40,36,28,0.9), rgba(28,24,18,0.9))',
        borderBottom: '1px solid #3a3228', minHeight: '18px',
      });
      const titleEl = document.createElement('span');
      Object.assign(titleEl.style, {
        fontFamily: "'Cinzel', Georgia, serif", fontSize: '9.5px', fontWeight: '700',
        color: '#e8d8b0', lineHeight: '1.1', flex: '1', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
      });
      titleEl.textContent = card.name;
      const manaEl = document.createElement('span');
      Object.assign(manaEl.style, {
        width: '20px', height: '20px', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: '700',
        color: '#1a1200',
        background: 'radial-gradient(circle at 35% 35%, #ffe080, #daa520 50%, #a07010 100%)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.3)',
        border: '1px solid #8a6a10', flexShrink: '0', marginLeft: '3px',
      });
      manaEl.textContent = `${card.cost}`;
      titleBar.appendChild(titleEl);
      titleBar.appendChild(manaEl);
      cardEl.appendChild(titleBar);

      // Art
      const artBox = document.createElement('div');
      Object.assign(artBox.style, {
        margin: '3px 5px 2px', height: '64px', borderRadius: '2px',
        border: '1px solid #2a2418', overflow: 'hidden',
        background: '#0a0a0e', position: 'relative',
      });
      const artImg = document.createElement('img');
      artImg.src = artRenderer.getArt(card.texture, card.type);
      Object.assign(artImg.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' });
      artBox.appendChild(artImg);
      cardEl.appendChild(artBox);

      // Type line
      const typeLine = document.createElement('div');
      Object.assign(typeLine.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
        padding: '2px 5px',
        background: 'linear-gradient(180deg, rgba(40,36,28,0.7), rgba(28,24,18,0.7))',
        borderTop: '1px solid #2a2418', borderBottom: '1px solid #2a2418',
        fontFamily: "'Cinzel', Georgia, serif", fontSize: '7.5px', fontWeight: '700',
        letterSpacing: '1px', textTransform: 'uppercase', color,
      });
      typeLine.innerHTML = `<span style="font-size:10px">${icon}</span> ${card.type}`;
      cardEl.appendChild(typeLine);

      // Text box
      const textBox = document.createElement('div');
      Object.assign(textBox.style, {
        flex: '1', margin: '2px 5px', padding: '4px 5px',
        background: 'linear-gradient(180deg, #d4c8a8 0%, #c4b890 30%, #b8a878 100%)',
        borderRadius: '2px', overflow: 'hidden',
      });
      const textEl = document.createElement('div');
      Object.assign(textEl.style, {
        fontFamily: "'Alegreya', Georgia, serif", fontSize: '8px',
        color: '#2a2018', lineHeight: '1.35', textAlign: 'center',
      });
      textEl.textContent = card.description;
      textBox.appendChild(textEl);
      cardEl.appendChild(textBox);

      this.mulliganCardEls.push(cardEl);
      handEl.appendChild(cardEl);
    }
  }

  private doMulligan(): void {
    if (!this.deck) return;
    const maxHand = HAND_SIZE;
    const nextDrawCount = maxHand - (this.mulliganCount + 1);
    if (nextDrawCount < 1) return; // Can't mulligan below 1 card

    this.mulliganCount++;
    this.deck.mulliganFull(nextDrawCount);
    this.buildMulliganHand();
    this.updateMulliganStatus();
  }

  private updateMulliganStatus(): void {
    if (!this.container) return;
    const statusEl = this.container.querySelector('#mulligan-status') as HTMLElement;
    const headerEl = this.container.querySelector('#mulligan-header') as HTMLElement;
    const btn = this.container.querySelector('#mulligan-btn') as HTMLElement;
    const maxHand = HAND_SIZE;
    const currentCards = maxHand - this.mulliganCount;
    const nextCards = currentCards - 1;

    if (this.mulliganCount === 0) {
      if (headerEl) headerEl.textContent = 'OPENING HAND';
      if (statusEl) statusEl.textContent = `${currentCards} CARDS`;
    } else {
      if (headerEl) headerEl.textContent = `MULLIGAN ${this.mulliganCount}`;
      if (statusEl) statusEl.textContent = `${currentCards} CARDS`;
    }

    if (btn) {
      if (nextCards < 1) {
        btn.textContent = 'NO MORE';
        btn.style.cursor = 'not-allowed';
        btn.style.opacity = '0.3';
      } else {
        btn.textContent = `MULLIGAN → ${nextCards}`;
        btn.style.cursor = 'pointer';
        btn.style.opacity = '1';
      }
    }
  }

  private deploy(): void {
    const startX = this.selectedX >= 0 ? this.selectedX : this.mission.playerStartX;
    const startY = this.selectedY >= 0 ? this.selectedY : this.mission.playerStartY;

    const modifiedMission: MissionDefinition = {
      ...this.mission,
      playerStartX: startX,
      playerStartY: startY,
    };
    getSceneManager().start('GameScene', { mission: modifiedMission, deck: this.deck });
  }

  shutdown(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
      this.canvas = null;
    }
    this.mulliganCardEls = [];
    this.mulliganCount = 0;
  }
}
