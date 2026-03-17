import { getPlayerState, savePlayerState } from './PlayerState';
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
