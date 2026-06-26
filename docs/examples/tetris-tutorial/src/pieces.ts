import type { Cell } from "./grid";

export type Offset = [number, number]; // [col, row], row grows down
export type Piece = { color: Cell; rots: Offset[][] };

function rotateCW(cells: Offset[]): Offset[] {
  return cells.map(([c, r]) => [-r, c] as Offset);
}
function four(base: Offset[]): Offset[][] {
  const s: Offset[][] = [base];
  for (let i = 0; i < 3; i++) s.push(rotateCW(s[s.length - 1]));
  return s;
}

export const PIECES: Piece[] = [
  {
    color: 1,
    rots: four([
      [-1, 0],
      [0, 0],
      [1, 0],
      [2, 0],
    ]),
  }, // I
  {
    color: 2,
    rots: four([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]),
  }, // O
  {
    color: 3,
    rots: four([
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]),
  }, // T
  {
    color: 4,
    rots: four([
      [0, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
    ]),
  }, // S
  {
    color: 5,
    rots: four([
      [-1, 0],
      [0, 0],
      [0, 1],
      [1, 1],
    ]),
  }, // Z
  {
    color: 6,
    rots: four([
      [-1, 0],
      [0, 0],
      [1, 0],
      [1, 1],
    ]),
  }, // J
  {
    color: 7,
    rots: four([
      [-1, 0],
      [0, 0],
      [1, 0],
      [-1, 1],
    ]),
  }, // L
];

export function cellsAt(piece: number, rot: number, px: number, py: number): Offset[] {
  return PIECES[piece].rots[rot].map(([c, r]) => [px + c, py + r] as Offset);
}

let bag: number[] = [];
export function nextPieceIndex(): number {
  if (bag.length == 0) {
    bag = [0, 1, 2, 3, 4, 5, 6];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = math.random(0, i);
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  const index = bag[bag.length - 1];
  bag.pop();
  return index;
}
