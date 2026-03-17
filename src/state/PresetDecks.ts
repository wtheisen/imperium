import { SavedDeck } from './PlayerState';

export const PRESET_DECKS: SavedDeck[] = [
  // ── Adeptus Astartes (Space Marines) ───────────────────────────────
  {
    id: 'astartes_balanced',
    name: 'Battle Company',
    faction: 'adeptus_astartes',
    cardIds: [
      'servitor', 'servitor', 'servitor',
      'marine', 'marine',
      'guardsman', 'guardsman',
      'rhino',
      'tarantula',
      'narthecium',
    ],
  },
  {
    id: 'astartes_assault',
    name: 'Spearhead Assault',
    faction: 'adeptus_astartes',
    cardIds: [
      'servitor', 'servitor',
      'marine', 'marine', 'marine',
      'scout', 'scout',
      'rhino',
      'sentinel',
      'lance_strike',
    ],
  },
  {
    id: 'astartes_armored',
    name: 'Armored Advance',
    faction: 'adeptus_astartes',
    cardIds: [
      'servitor', 'servitor',
      'marine', 'marine',
      'rhino', 'rhino',
      'leman_russ',
      'sentinel',
      'aegis',
      'narthecium',
    ],
  },
  {
    id: 'astartes_fortified',
    name: 'Fortified Line',
    faction: 'adeptus_astartes',
    cardIds: [
      'servitor', 'servitor',
      'guardsman', 'guardsman', 'guardsman',
      'tarantula', 'tarantula',
      'aegis', 'aegis',
      'narthecium',
    ],
  },
];
