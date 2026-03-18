export type PackType = 'random' | 'wargear' | 'ordnance' | 'unit' | 'building';

export interface PackDefinition {
  id: string;
  type: PackType;
  tileX: number;
  tileY: number;
  linkedObjectiveId?: string;
}

export interface PackContents {
  packId: string;
  type: PackType;
  cardIds: string[];
}

export interface PackDecision {
  cardId: string;
  action: 'take' | 'burn';
}
