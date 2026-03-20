import { getPlayerState, savePlayerState, CardInstance } from './PlayerState';
import { TECH_TREES } from './TechTreeData';

export type TechNodeEffect =
  | { type: 'stat_boost'; stat: string; value: number; mode: 'flat' | 'percent' }
  | { type: 'passive'; id: string }
  | { type: 'triggered'; id: string; trigger: string }
  | { type: 'active'; id: string };

export interface TechNode {
  id: string;
  unitType: string;
  name: string;
  description: string;
  tier: number;            // 0-3 for layout rows
  branch: number;          // 0=root, 1=left branch, 2=right branch
  prerequisites: string[];
  xpCost: number;
  effect: TechNodeEffect;
  bonusEffects?: TechNodeEffect[];  // merged effects for tier 3 nodes that absorbed displaced tier 2 effects
}

export function getTechTree(unitType: string): TechNode[] {
  return TECH_TREES[unitType] || [];
}

export function canUnlockNode(nodeId: string): boolean {
  const state = getPlayerState();
  if (state.unlockedNodes.has(nodeId)) return false;

  // Find the node
  let node: TechNode | undefined;
  for (const tree of Object.values(TECH_TREES)) {
    node = tree.find(n => n.id === nodeId);
    if (node) break;
  }
  if (!node) return false;

  // Check prerequisites
  for (const prereq of node.prerequisites) {
    if (!state.unlockedNodes.has(prereq)) return false;
  }

  // Check XP
  const xpData = state.unitXp[node.unitType];
  if (!xpData) return false;
  const available = xpData.earned - xpData.spent;
  return available >= node.xpCost;
}

export function unlockNode(nodeId: string): boolean {
  if (!canUnlockNode(nodeId)) return false;

  const state = getPlayerState();
  let node: TechNode | undefined;
  for (const tree of Object.values(TECH_TREES)) {
    node = tree.find(n => n.id === nodeId);
    if (node) break;
  }
  if (!node) return false;

  state.unitXp[node.unitType].spent += node.xpCost;
  state.unlockedNodes.add(node.id);
  savePlayerState();
  return true;
}

export function getUnlockedNodesForUnit(unitType: string): TechNode[] {
  const state = getPlayerState();
  const tree = TECH_TREES[unitType] || [];
  return tree.filter(n => state.unlockedNodes.has(n.id));
}

export function getAvailableXp(unitType: string): number {
  const state = getPlayerState();
  const xpData = state.unitXp[unitType];
  if (!xpData) return 0;
  return xpData.earned - xpData.spent;
}

// ── Per-instance (veteran) tech tree functions ────────────────────────────────

function findNode(nodeId: string): TechNode | undefined {
  for (const tree of Object.values(TECH_TREES)) {
    const n = tree.find(n => n.id === nodeId);
    if (n) return n;
  }
  return undefined;
}

function xpSpentByInstance(inst: CardInstance): number {
  if (!inst.veteranData) return 0;
  return inst.veteranData.unlockedNodes
    .map(id => findNode(id)?.xpCost ?? 0)
    .reduce((a, b) => a + b, 0);
}

export function getAvailableXpForInstance(inst: CardInstance): number {
  return inst.xp - xpSpentByInstance(inst);
}

export function canUnlockNodeForInstance(nodeId: string, inst: CardInstance): boolean {
  if (!inst.veteranData) return false;
  if (inst.veteranData.unlockedNodes.includes(nodeId)) return false;
  const node = findNode(nodeId);
  if (!node) return false;
  for (const prereq of node.prerequisites) {
    if (!inst.veteranData.unlockedNodes.includes(prereq)) return false;
  }
  return getAvailableXpForInstance(inst) >= node.xpCost;
}

export function unlockNodeForInstance(nodeId: string, inst: CardInstance): boolean {
  if (!canUnlockNodeForInstance(nodeId, inst)) return false;
  inst.veteranData!.unlockedNodes.push(nodeId);
  savePlayerState();
  return true;
}

export function getUnlockedNodesForInstance(inst: CardInstance): TechNode[] {
  if (!inst.veteranData) return [];
  const unitType = inst.cardId;
  const tree = TECH_TREES[unitType] || [];
  return tree.filter(n => inst.veteranData!.unlockedNodes.includes(n.id));
}
