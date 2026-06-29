import { defineGuiScript } from "@defold-typescript/types";
import { COLS, clearLines, emptyGrid, type Grid, isFree, ROWS } from "./grid";
import { cellsAt, nextPieceIndex, PIECES } from "./pieces";

const CELL = 28; // cell pitch in pixels
const GAP = 2; // space between cells — tune the grid look from one place
const BORDER = 2; // thickness of the frame drawn around each filled cell
const WINDOW_W = 400;
const WINDOW_H = 720;

// Bottom-left of the COLS×ROWS board in GUI (screen) space, centering the
// 280×560 grid in the configured portrait window (see game.project display).
const ORIGIN_X = (WINDOW_W - COLS * CELL) / 2;
const ORIGIN_Y = (WINDOW_H - ROWS * CELL) / 2;

const LINE_SCORE = [0, 40, 100, 300, 1200];

// Input ids, hashed once at module scope.
const LEFT = hash("left");
const RIGHT = hash("right");
const SOFT = hash("soft_drop");
const ROTATE = hash("rotate");
const HARD = hash("hard_drop");

// Fill colors indexed by Cell color (1..7); index 0 is transparent (empty).
const TINTS = [
  vmath.vector4(0, 0, 0, 0),
  vmath.vector4(0.18, 0.83, 0.83, 1), // I
  vmath.vector4(0.97, 0.82, 0.22, 1), // O
  vmath.vector4(0.69, 0.29, 0.94, 1), // T
  vmath.vector4(0.27, 0.82, 0.38, 1), // S
  vmath.vector4(0.94, 0.26, 0.35, 1), // Z
  vmath.vector4(0.31, 0.48, 0.94, 1), // J
  vmath.vector4(0.94, 0.56, 0.23, 1), // L
];
// A darker shade of each fill, drawn as the cell border.
const BORDERS = TINTS.map((t) => vmath.vector4(t.x * 0.45, t.y * 0.45, t.z * 0.45, t.w));
// Empty cells stay visible as a dim well with a faint grid line.
const EMPTY_FILL = vmath.vector4(0.1, 0.11, 0.13, 1);
const EMPTY_BORDER = vmath.vector4(0.18, 0.19, 0.22, 1);

type GuiNode = Opaque<"node">;

// The script state, named once so the standalone movement/scoring helpers can
// annotate `self`. `init` returns exactly this shape.
interface BoardSelf {
  fills: GuiNode[][];
  borders: GuiNode[][];
  grid: Grid;
  piece: number;
  rot: number;
  px: number;
  py: number;
  timer: number;
  fall: number;
  score: number;
  lines: number;
  level: number;
  over: boolean;
  hud: boolean; // true once the HUD GUI registers (see on_message)
}

// Generate the COLS×ROWS grid as GUI box nodes — nothing is placed in the
// editor. Each cell is a border box with a smaller fill box on top; GAP leaves
// space between cells and BORDER is the frame thickness.
function buildGrid(): { fills: GuiNode[][]; borders: GuiNode[][] } {
  const fills: GuiNode[][] = [];
  const borders: GuiNode[][] = [];
  const outer = CELL - GAP;
  const inner = outer - 2 * BORDER;
  for (let r = 0; r < ROWS; r++) {
    const frow: GuiNode[] = [];
    const brow: GuiNode[] = [];
    for (let c = 0; c < COLS; c++) {
      const pos = vmath.vector3(
        ORIGIN_X + c * CELL + CELL / 2,
        ORIGIN_Y + (ROWS - 1 - r) * CELL + CELL / 2,
        0,
      );
      brow.push(gui.new_box_node(pos, vmath.vector3(outer, outer, 0)));
      frow.push(gui.new_box_node(pos, vmath.vector3(inner, inner, 0)));
    }
    borders.push(brow);
    fills.push(frow);
  }
  return { fills, borders };
}

function paint(self: BoardSelf, r: number, c: number, value: number): void {
  gui.set_color(self.fills[r][c], value == 0 ? EMPTY_FILL : TINTS[value]);
  gui.set_color(self.borders[r][c], value == 0 ? EMPTY_BORDER : BORDERS[value]);
}

// --- pure movement, all tested against the grid model ---
function fits(self: BoardSelf, piece: number, rot: number, px: number, py: number): boolean {
  for (const [c, r] of cellsAt(piece, rot, px, py)) {
    if (!isFree(self.grid, c, r)) return false;
  }
  return true;
}
function canPlace(self: BoardSelf): boolean {
  return fits(self, self.piece, self.rot, self.px, self.py);
}
function tryMove(self: BoardSelf, dc: number, dr: number): boolean {
  if (fits(self, self.piece, self.rot, self.px + dc, self.py + dr)) {
    self.px += dc;
    self.py += dr;
    return true;
  }
  return false;
}
function tryRotate(self: BoardSelf): void {
  const next = (self.rot + 1) % 4;
  for (const kick of [0, -1, 1]) {
    if (fits(self, self.piece, next, self.px + kick, self.py)) {
      self.rot = next;
      self.px += kick;
      return;
    }
  }
}
function hardDrop(self: BoardSelf): void {
  while (tryMove(self, 0, 1)) self.score += 1;
  self.timer = self.fall;
}

// --- locking, scoring, drawing ---
function lockPiece(self: BoardSelf): void {
  const color = PIECES[self.piece].color;
  for (const [c, r] of cellsAt(self.piece, self.rot, self.px, self.py)) {
    if (r >= 0) self.grid[r][c] = color;
  }
}
function postHud(self: BoardSelf): void {
  // Only post once the HUD has registered. A gui script can't call go.exists
  // (go.* is .script-only), and msg.post to a missing instance errors at
  // dispatch — so the HUD announces itself in its init (see on_message below).
  if (self.hud) {
    msg.post("/hud#hud", "set_hud", { score: self.score, level: self.level });
  }
}
function onLocked(self: BoardSelf): void {
  const n = clearLines(self.grid);
  if (n > 0) {
    self.lines += n;
    self.score += LINE_SCORE[n] * self.level;
    self.level = 1 + math.floor(self.lines / 10);
    self.fall = math.max(0.08, 0.8 - (self.level - 1) * 0.07);
  }
  postHud(self);
  self.piece = nextPieceIndex();
  self.rot = 0;
  self.px = 4;
  self.py = 0;
  if (!canPlace(self)) {
    self.over = true;
    if (self.hud) msg.post("/hud#hud", "game_over");
  }
}
function stepDown(self: BoardSelf): void {
  if (tryMove(self, 0, 1)) return;
  lockPiece(self);
  onLocked(self);
}
function redraw(self: BoardSelf): void {
  const frame: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) row.push(self.grid[r][c]);
    frame.push(row);
  }
  if (!self.over) {
    const color = PIECES[self.piece].color;
    for (const [c, r] of cellsAt(self.piece, self.rot, self.px, self.py)) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) frame[r][c] = color;
    }
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) paint(self, r, c, frame[r][c]);
  }
}

export default defineGuiScript({
  init(): BoardSelf {
    msg.post(".", "acquire_input_focus");
    const grid = buildGrid();
    return {
      fills: grid.fills,
      borders: grid.borders,
      grid: emptyGrid(),
      piece: nextPieceIndex(),
      rot: 0,
      px: 4,
      py: 0,
      timer: 0,
      fall: 0.8,
      score: 0,
      lines: 0,
      level: 1,
      over: false,
      hud: false,
    };
  },
  update(self, dt) {
    if (self.over) return;
    self.timer += dt;
    if (self.timer >= self.fall) {
      self.timer = 0;
      stepDown(self);
    }
    redraw(self);
  },
  on_input(self, action_id, action) {
    if (self.over || !action.pressed) return;
    if (action_id == LEFT) tryMove(self, -1, 0);
    else if (action_id == RIGHT) tryMove(self, 1, 0);
    else if (action_id == SOFT) tryMove(self, 0, 1);
    else if (action_id == ROTATE) tryRotate(self);
    else if (action_id == HARD) hardDrop(self);
  },
  on_message(self, message_id) {
    // The HUD announces itself once loaded; remember it so we only post when
    // it exists (a gui script has no go.exists).
    if (message_id == hash("hud_ready")) self.hud = true;
  },
});
