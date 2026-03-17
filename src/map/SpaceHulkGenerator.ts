import { TerrainType } from './MapManager';

/** Simple seeded PRNG (Lehmer / MINSTD) */
function createRng(seed: number): () => number {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface BSPNode {
  x: number;
  y: number;
  w: number;
  h: number;
  left: BSPNode | null;
  right: BSPNode | null;
  room: { x: number; y: number; w: number; h: number } | null;
}

/**
 * Generate a Space Hulk-style corridor map using BSP (Binary Space Partition).
 * Fills grid with HULL_WALL, then carves rooms and corridors of METAL_FLOOR.
 */
export function generateSpaceHulk(
  width: number,
  height: number,
  seed: number,
  corridorWidth: number,
  protectedPositions: { x: number; y: number; radius: number }[]
): TerrainType[][] {
  const rng = createRng(seed);

  // Initialize grid with HULL_WALL
  const grid: TerrainType[][] = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      grid[y][x] = TerrainType.HULL_WALL;
    }
  }

  const MIN_PARTITION = 10;
  const MAX_DEPTH = 5;
  const MIN_ROOM = 4;
  const WALL_MARGIN = 2;

  // Build BSP tree
  const root: BSPNode = { x: 1, y: 1, w: width - 2, h: height - 2, left: null, right: null, room: null };

  function subdivide(node: BSPNode, depth: number): void {
    if (depth >= MAX_DEPTH || (node.w < MIN_PARTITION * 2 && node.h < MIN_PARTITION * 2)) {
      return;
    }

    // Decide split direction
    let splitH: boolean;
    if (node.w > node.h * 1.3) splitH = false; // split vertically (wide)
    else if (node.h > node.w * 1.3) splitH = true; // split horizontally (tall)
    else splitH = rng() < 0.5;

    if (splitH) {
      if (node.h < MIN_PARTITION * 2) return;
      const minSplit = MIN_PARTITION;
      const maxSplit = node.h - MIN_PARTITION;
      if (minSplit >= maxSplit) return;
      const split = minSplit + Math.floor(rng() * (maxSplit - minSplit));
      node.left = { x: node.x, y: node.y, w: node.w, h: split, left: null, right: null, room: null };
      node.right = { x: node.x, y: node.y + split, w: node.w, h: node.h - split, left: null, right: null, room: null };
    } else {
      if (node.w < MIN_PARTITION * 2) return;
      const minSplit = MIN_PARTITION;
      const maxSplit = node.w - MIN_PARTITION;
      if (minSplit >= maxSplit) return;
      const split = minSplit + Math.floor(rng() * (maxSplit - minSplit));
      node.left = { x: node.x, y: node.y, w: split, h: node.h, left: null, right: null, room: null };
      node.right = { x: node.x + split, y: node.y, w: node.w - split, h: node.h, left: null, right: null, room: null };
    }

    subdivide(node.left, depth + 1);
    subdivide(node.right, depth + 1);
  }

  subdivide(root, 0);

  // Check if a position is protected
  function isProtectedPartition(node: BSPNode): boolean {
    for (const pp of protectedPositions) {
      if (pp.x >= node.x && pp.x < node.x + node.w &&
          pp.y >= node.y && pp.y < node.y + node.h) {
        return true;
      }
    }
    return false;
  }

  // Place rooms in leaf nodes
  function placeRooms(node: BSPNode): void {
    if (node.left && node.right) {
      placeRooms(node.left);
      placeRooms(node.right);
      return;
    }

    // Leaf node — place a room
    const maxRoomW = Math.min(12, node.w - WALL_MARGIN * 2);
    const maxRoomH = Math.min(12, node.h - WALL_MARGIN * 2);
    const minRoomW = Math.min(MIN_ROOM, maxRoomW);
    const minRoomH = Math.min(MIN_ROOM, maxRoomH);

    if (maxRoomW < minRoomW || maxRoomH < minRoomH) return;

    let roomW = minRoomW + Math.floor(rng() * (maxRoomW - minRoomW + 1));
    let roomH = minRoomH + Math.floor(rng() * (maxRoomH - minRoomH + 1));

    // If partition contains a protected position, ensure room covers it
    if (isProtectedPartition(node)) {
      roomW = maxRoomW;
      roomH = maxRoomH;
    }

    const roomX = node.x + WALL_MARGIN + Math.floor(rng() * Math.max(1, node.w - WALL_MARGIN * 2 - roomW + 1));
    const roomY = node.y + WALL_MARGIN + Math.floor(rng() * Math.max(1, node.h - WALL_MARGIN * 2 - roomH + 1));

    node.room = { x: roomX, y: roomY, w: roomW, h: roomH };

    // Carve room
    for (let ry = roomY; ry < roomY + roomH && ry < height; ry++) {
      for (let rx = roomX; rx < roomX + roomW && rx < width; rx++) {
        grid[ry][rx] = TerrainType.METAL_FLOOR;
      }
    }
  }

  placeRooms(root);

  // Get room center from a node (recursively find a room)
  function getRoomCenter(node: BSPNode): { x: number; y: number } | null {
    if (node.room) {
      return {
        x: Math.floor(node.room.x + node.room.w / 2),
        y: Math.floor(node.room.y + node.room.h / 2),
      };
    }
    if (node.left) {
      const c = getRoomCenter(node.left);
      if (c) return c;
    }
    if (node.right) {
      const c = getRoomCenter(node.right);
      if (c) return c;
    }
    return null;
  }

  // Connect sibling rooms with corridors
  function connectRooms(node: BSPNode): void {
    if (!node.left || !node.right) return;

    connectRooms(node.left);
    connectRooms(node.right);

    const c1 = getRoomCenter(node.left);
    const c2 = getRoomCenter(node.right);
    if (!c1 || !c2) return;

    carveCorridor(c1.x, c1.y, c2.x, c2.y);
  }

  function carveCorridor(x1: number, y1: number, x2: number, y2: number): void {
    const halfW = Math.floor(corridorWidth / 2);

    // L-shaped corridor: go horizontal first, then vertical
    // Horizontal segment
    const startX = Math.min(x1, x2);
    const endX = Math.max(x1, x2);
    for (let x = startX; x <= endX; x++) {
      for (let w = -halfW; w <= halfW; w++) {
        const cy = y1 + w;
        if (cy >= 0 && cy < height && x >= 0 && x < width) {
          grid[cy][x] = TerrainType.METAL_FLOOR;
        }
      }
    }

    // Vertical segment
    const startY = Math.min(y1, y2);
    const endY = Math.max(y1, y2);
    for (let y = startY; y <= endY; y++) {
      for (let w = -halfW; w <= halfW; w++) {
        const cx = x2 + w;
        if (y >= 0 && y < height && cx >= 0 && cx < width) {
          grid[y][cx] = TerrainType.METAL_FLOOR;
        }
      }
    }
  }

  connectRooms(root);

  // Ensure protected positions are on METAL_FLOOR with clearance
  for (const pp of protectedPositions) {
    const r = pp.radius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = pp.x + dx;
        const ty = pp.y + dy;
        if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
          grid[ty][tx] = TerrainType.METAL_FLOOR;
        }
      }
    }
  }

  return grid;
}
