import { getAllCards } from '../cards/CardDatabase';
import { CARDS_PER_PACK } from '../config';
import { PackType } from './PackTypes';

/**
 * Generate a pack of card IDs by filtering the card database to the
 * requested pack type, shuffling, and picking CARDS_PER_PACK cards.
 */
export function generatePack(type: PackType): string[] {
  const allCards = getAllCards();
  let pool: string[];

  switch (type) {
    case 'unit':
      pool = allCards.filter(c => c.type === 'unit').map(c => c.id);
      break;
    case 'building':
      pool = allCards.filter(c => c.type === 'building').map(c => c.id);
      break;
    case 'ordnance':
      pool = allCards.filter(c => c.type === 'ordnance').map(c => c.id);
      break;
    case 'wargear':
      pool = allCards.filter(c => c.type === 'equipment').map(c => c.id);
      break;
    case 'random':
    default:
      pool = allCards.map(c => c.id);
      break;
  }

  // Fisher-Yates shuffle for better randomness than sort()
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, CARDS_PER_PACK);
}
