import EasyStar from 'easystarjs';
import { MAP_WIDTH, MAP_HEIGHT } from '../config';

export class PathfindingSystem {
  private easyStar: EasyStar.js;
  private grid: number[][];

  constructor() {
    this.easyStar = new EasyStar.js();
    this.grid = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      this.grid[y] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        this.grid[y][x] = 0;
      }
    }
    this.easyStar.setGrid(this.grid);
    this.easyStar.setAcceptableTiles([0]);
    this.easyStar.enableDiagonals();
    this.easyStar.disableCornerCutting();
  }

  setGrid(grid: number[][]): void {
    this.grid = grid;
    this.easyStar.setGrid(this.grid);
  }

  setTileWalkable(x: number, y: number, walkable: boolean): void {
    if (y >= 0 && y < this.grid.length && x >= 0 && x < this.grid[0].length) {
      this.grid[y][x] = walkable ? 0 : 1;
    }
  }

  findPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<{ x: number; y: number }[] | null> {
    return new Promise((resolve) => {
      this.easyStar.findPath(startX, startY, endX, endY, (path) => {
        resolve(path);
      });
      this.easyStar.calculate();
    });
  }

  update(): void {
    this.easyStar.calculate();
  }
}
