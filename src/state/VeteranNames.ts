const MARINE_FIRST = ['Theron', 'Cato', 'Severus', 'Lucius', 'Maximus', 'Varro', 'Aquila', 'Decimus', 'Flavian', 'Corvus', 'Brutus', 'Cassius', 'Gallus', 'Marius', 'Quintus'];
const MARINE_PREFIX = ['Brother', 'Sergeant', 'Veteran', 'Champion', 'Brother-Sergeant'];

const GUARD_SURNAME = ['Holt', 'Vance', 'Marsh', 'Rennick', 'Stoker', 'Duval', 'Cross', 'Graves', 'Thorn', 'Pryce', 'Harker', 'Voss'];
const GUARD_PREFIX = ['Private', 'Corporal', 'Trooper', 'Guardsman'];

const SCOUT_NAME = ['Kael', 'Dusk', 'Rael', 'Crow', 'Nox', 'Sable', 'Flint', 'Wren', 'Pike'];

// Track used names per session to avoid collisions
const usedNames = new Set<string>();

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function unique(base: string, suffix = 0): string {
  const name = suffix === 0 ? base : `${base} ${String.fromCharCode(65 + suffix - 1)}`;
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  return unique(base, suffix + 1);
}

export function generateVeteranName(cardId: string): string {
  let base: string;
  if (cardId === 'marine' || cardId === 'ogryn' || cardId === 'techmarine') {
    base = `${pick(MARINE_PREFIX)} ${pick(MARINE_FIRST)}`;
  } else if (cardId === 'guardsman') {
    base = `${pick(GUARD_PREFIX)} ${pick(GUARD_SURNAME)}`;
  } else if (cardId === 'scout') {
    base = `Scout ${pick(SCOUT_NAME)}`;
  } else if (cardId === 'servitor') {
    base = `Servitor-${Math.floor(Math.random() * 9000) + 1000}`;
  } else {
    base = `Veteran-${cardId.replace(/_/g, '-')}`;
  }
  return unique(base);
}

export function clearUsedNames(): void {
  usedNames.clear();
}
