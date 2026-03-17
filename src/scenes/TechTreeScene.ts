import { GameSceneInterface, getSceneManager } from './SceneManager';
import { getTechTree, canUnlockNode, unlockNode, TechNode } from '../state/TechTree';
import { getPlayerState } from '../state/PlayerState';

const UNIT_TYPES = ['marine', 'guardsman', 'servitor', 'scout'];
const UNIT_LABELS: Record<string, string> = {
  marine: 'Space Marine',
  guardsman: 'Guardsman',
  servitor: 'Servitor',
  scout: 'Scout',
};

const NODE_W = 140;
const NODE_H = 50;
const TIER_GAP = 90;
const BRANCH_GAP = 180;

export class TechTreeScene implements GameSceneInterface {
  id = 'TechTreeScene';

  private container: HTMLDivElement | null = null;
  private activeType: string = 'marine';
  private tabElements: HTMLDivElement[] = [];
  private xpTextEl: HTMLDivElement | null = null;
  private treeContainerEl: HTMLDivElement | null = null;

  create(_data?: any): void {
    this.activeType = 'marine';
    this.tabElements = [];

    // Root container
    const container = document.createElement('div');
    this.container = container;
    Object.assign(container.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      background: '#0d0d15',
      fontFamily: 'monospace',
      overflow: 'hidden',
      zIndex: '10',
    });

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      gameContainer.appendChild(container);
    }

    // Title
    const title = document.createElement('div');
    Object.assign(title.style, {
      textAlign: 'center',
      fontSize: '32px',
      color: '#ccaa44',
      fontWeight: 'bold',
      fontFamily: 'monospace',
      paddingTop: '20px',
      textShadow: '2px 2px 4px #000000',
    });
    title.textContent = 'TECH TREES';
    container.appendChild(title);

    // Tabs row
    const tabRow = document.createElement('div');
    Object.assign(tabRow.style, {
      display: 'flex',
      justifyContent: 'center',
      gap: '16px',
      marginTop: '16px',
    });
    container.appendChild(tabRow);

    for (const unitType of UNIT_TYPES) {
      const tab = document.createElement('div');
      Object.assign(tab.style, {
        fontSize: '16px',
        color: unitType === this.activeType ? '#ccaa44' : '#666666',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        cursor: 'pointer',
        padding: '4px 12px',
        userSelect: 'none',
      });
      tab.textContent = UNIT_LABELS[unitType];
      tab.addEventListener('click', () => {
        this.activeType = unitType;
        this.refreshTree();
      });
      tab.addEventListener('mouseenter', () => {
        if (unitType !== this.activeType) tab.style.color = '#aaaaaa';
      });
      tab.addEventListener('mouseleave', () => {
        tab.style.color = unitType === this.activeType ? '#ccaa44' : '#666666';
      });
      tabRow.appendChild(tab);
      this.tabElements.push(tab);
    }

    // Tree container (SVG + nodes)
    const treeArea = document.createElement('div');
    Object.assign(treeArea.style, {
      position: 'relative',
      width: '100%',
      flex: '1',
      marginTop: '20px',
      overflow: 'auto',
    });
    this.treeContainerEl = treeArea;
    container.appendChild(treeArea);

    // XP display
    const xpText = document.createElement('div');
    Object.assign(xpText.style, {
      position: 'absolute',
      bottom: '30px',
      left: '40px',
      fontSize: '16px',
      color: '#aaddff',
      fontFamily: 'monospace',
    });
    this.xpTextEl = xpText;
    container.appendChild(xpText);

    // Back button
    const backBtn = document.createElement('div');
    Object.assign(backBtn.style, {
      position: 'absolute',
      bottom: '30px',
      right: '40px',
      fontSize: '20px',
      color: '#88ff88',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      cursor: 'pointer',
      userSelect: 'none',
    });
    backBtn.textContent = '[ BACK ]';
    backBtn.addEventListener('mouseenter', () => { backBtn.style.color = '#ffffff'; });
    backBtn.addEventListener('mouseleave', () => { backBtn.style.color = '#88ff88'; });
    backBtn.addEventListener('click', () => {
      getSceneManager().start('MissionSelectScene');
    });
    container.appendChild(backBtn);

    this.refreshTree();
  }

  shutdown(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.tabElements = [];
    this.xpTextEl = null;
    this.treeContainerEl = null;
  }

  private refreshTree(): void {
    // Update tab colors
    for (let i = 0; i < UNIT_TYPES.length; i++) {
      this.tabElements[i].style.color = UNIT_TYPES[i] === this.activeType ? '#ccaa44' : '#666666';
    }

    // Update XP display
    const state = getPlayerState();
    const xpData = state.unitXp[this.activeType] || { earned: 0, spent: 0 };
    const available = xpData.earned - xpData.spent;
    if (this.xpTextEl) {
      this.xpTextEl.textContent = `${UNIT_LABELS[this.activeType]} XP — Earned: ${xpData.earned} | Available: ${available}`;
    }

    // Clear tree area
    if (!this.treeContainerEl) return;
    this.treeContainerEl.innerHTML = '';

    const tree = getTechTree(this.activeType);
    if (tree.length === 0) return;

    // Calculate node positions
    const nodePositions = new Map<string, { x: number; y: number }>();
    for (const node of tree) {
      let x = 0;
      const y = node.tier * TIER_GAP;
      if (node.branch === 1) {
        x = -BRANCH_GAP;
      } else if (node.branch === 2) {
        x = BRANCH_GAP;
      }
      nodePositions.set(node.id, { x, y });
    }

    // Determine bounds for centering
    let minX = Infinity, maxX = -Infinity, maxY = 0;
    for (const pos of nodePositions.values()) {
      if (pos.x - NODE_W / 2 < minX) minX = pos.x - NODE_W / 2;
      if (pos.x + NODE_W / 2 > maxX) maxX = pos.x + NODE_W / 2;
      if (pos.y + NODE_H / 2 > maxY) maxY = pos.y + NODE_H / 2;
    }
    const svgW = maxX - minX + 40;
    const svgH = maxY + 40;
    const offsetX = -minX + 20;
    const offsetY = NODE_H / 2 + 20;

    // Inner wrapper to center
    const innerWrap = document.createElement('div');
    Object.assign(innerWrap.style, {
      position: 'relative',
      width: `${svgW}px`,
      height: `${svgH + offsetY}px`,
      margin: '0 auto',
    });
    this.treeContainerEl.appendChild(innerWrap);

    // SVG for connection lines
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(svgW));
    svg.setAttribute('height', String(svgH + offsetY));
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.pointerEvents = 'none';
    innerWrap.appendChild(svg);

    // Draw connection lines
    for (const node of tree) {
      const pos = nodePositions.get(node.id)!;
      for (const prereqId of node.prerequisites) {
        const prereqPos = nodePositions.get(prereqId);
        if (prereqPos) {
          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', String(prereqPos.x + offsetX));
          line.setAttribute('y1', String(prereqPos.y + offsetY + NODE_H / 2));
          line.setAttribute('x2', String(pos.x + offsetX));
          line.setAttribute('y2', String(pos.y + offsetY - NODE_H / 2));
          line.setAttribute('stroke', '#444466');
          line.setAttribute('stroke-width', '2');
          line.setAttribute('stroke-opacity', '0.6');
          svg.appendChild(line);
        }
      }
    }

    // Draw nodes
    for (const node of tree) {
      const pos = nodePositions.get(node.id)!;
      this.createNodeVisual(innerWrap, node, pos.x + offsetX, pos.y + offsetY);
    }
  }

  private createNodeVisual(parent: HTMLElement, node: TechNode, cx: number, cy: number): void {
    const state = getPlayerState();
    const isUnlocked = state.unlockedNodes.has(node.id);
    const isAvailable = canUnlockNode(node.id);
    const isActive = node.effect.type === 'active';

    let borderColor = '#444466';
    let fillColor = '#1a1a2e';
    let textColor = '#666666';

    if (isUnlocked) {
      borderColor = isActive ? '#44aacc' : '#44aa44';
      fillColor = isActive ? '#1a2e2e' : '#1a2e1a';
      textColor = isActive ? '#88eeff' : '#88ff88';
    } else if (isAvailable) {
      borderColor = isActive ? '#44ccdd' : '#ccaa44';
      fillColor = isActive ? '#1a2a2e' : '#2e2a1a';
      textColor = isActive ? '#44ccdd' : '#ccaa44';
    } else if (isActive) {
      borderColor = '#335566';
      fillColor = '#151a22';
      textColor = '#556688';
    }

    const nodeEl = document.createElement('div');
    Object.assign(nodeEl.style, {
      position: 'absolute',
      left: `${cx - NODE_W / 2}px`,
      top: `${cy - NODE_H / 2}px`,
      width: `${NODE_W}px`,
      height: `${NODE_H}px`,
      background: fillColor,
      border: `2px solid ${borderColor}`,
      borderRadius: '6px',
      boxSizing: 'border-box',
      cursor: isAvailable ? 'pointer' : 'default',
      userSelect: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: '0.95',
    });

    // "ACTIVE" badge
    if (isActive) {
      const activeBadge = document.createElement('div');
      Object.assign(activeBadge.style, {
        position: 'absolute',
        top: '2px',
        left: '6px',
        fontSize: '7px',
        color: isUnlocked ? '#88eeff' : (isAvailable ? '#44ccdd' : '#556688'),
        fontFamily: 'monospace',
        fontWeight: 'bold',
      });
      activeBadge.textContent = 'ACTIVE';
      nodeEl.appendChild(activeBadge);
    }

    // Cost or checkmark (top-right)
    const topRight = document.createElement('div');
    Object.assign(topRight.style, {
      position: 'absolute',
      top: '2px',
      right: '6px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
    });
    if (isUnlocked) {
      topRight.style.fontSize = '14px';
      topRight.style.color = '#88ff88';
      topRight.textContent = '\u2713';
    } else {
      topRight.style.fontSize = '10px';
      topRight.style.color = isAvailable ? '#ffd700' : '#555555';
      topRight.textContent = String(node.xpCost);
    }
    nodeEl.appendChild(topRight);

    // Node name
    const nameEl = document.createElement('div');
    Object.assign(nameEl.style, {
      fontSize: '13px',
      color: textColor,
      fontFamily: 'monospace',
      fontWeight: 'bold',
      textAlign: 'center',
      lineHeight: '1',
      marginBottom: '2px',
    });
    nameEl.textContent = node.name;
    nodeEl.appendChild(nameEl);

    // Description
    const descEl = document.createElement('div');
    Object.assign(descEl.style, {
      fontSize: '10px',
      color: isUnlocked ? '#aaffaa' : '#888888',
      fontFamily: 'monospace',
      textAlign: 'center',
      lineHeight: '1',
    });
    descEl.textContent = node.description;
    nodeEl.appendChild(descEl);

    // Hover and click for available nodes
    if (isAvailable) {
      nodeEl.addEventListener('mouseenter', () => {
        nodeEl.style.background = '#3a3a1a';
        nodeEl.style.borderColor = '#ffd700';
      });
      nodeEl.addEventListener('mouseleave', () => {
        nodeEl.style.background = fillColor;
        nodeEl.style.borderColor = borderColor;
      });
      nodeEl.addEventListener('click', () => {
        unlockNode(node.id);
        this.refreshTree();
      });
    }

    parent.appendChild(nodeEl);
  }
}
