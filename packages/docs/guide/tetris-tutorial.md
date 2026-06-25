---
toc-title: Build Tetris
---
# Build Tetris in TypeScript

A full walkthrough: scaffold the project, wire the scene in the Defold editor, and write every system in TypeScript that compiles to the Lua the engine runs. A buildable copy of everything below lives in the repository at `docs/examples/tetris-tutorial/`.

Tetris is a great second Defold project: one moving thing, one fixed-step clock, one tiny rules engine, no physics. Every idea in this tutorial is the idea, not a workaround.

| Piece | Index | Color  |
| ----- | ----- | ------ |
| I     | 1     | cyan   |
| O     | 2     | yellow |
| T     | 3     | purple |
| S     | 4     | green  |
| Z     | 5     | red    |
| J     | 6     | blue   |
| L     | 7     | orange |

> [!NOTE]
> **Prereqs** You know Defold basics (game objects, components, collections) and have Bun installed. The toolchain's quirks are called out where they bite.

## 01 — Scaffold the project

The toolchain is a Bun CLI. It generates a Defold project plus a TypeScript surface that compiles down to Lua beside it — no engine fork, no runtime to ship.

```bash
# scaffold a new project
bunx @defold-typescript/cli@latest init tetris
cd tetris

# start the watcher — recompiles .ts → .lua on save
bunx @defold-typescript/cli watch
```

Leave `watch` running in its own terminal. It transpiles your TypeScript to Lua continuously — the editor only sees the `.lua` the CLI emits next to your `.ts`.

**What you'll have:** a project you can `cd tetris && bunx … watch` and the Defold editor will run.

Here's the layout. Everything you hand-write lives under `src/`; the compiled output and scene files live in the project root.

```text
tetris/
├─ game.project        # Defold project settings
├─ main/
│  ├─ main.collection  # the scene you wire in the editor
│  ├─ board.gui        # empty GUI scene — the script fills it
│  └─ board.go         # holds the board GUI + script
└─ src/
   ├─ board.ts         # the game — compiles to board.ts.gui_script
   ├─ pieces.ts        # tetromino shape data (shared module)
   └─ grid.ts          # pure board logic (shared module)
```

## 02 — Build the scene in the Editor

The board draws itself from code, so the editor work is small. You wire up an empty GUI scene and one game object — no sprite, no atlas, no factory.

### 2a — Create the board GUI scene

The board is a **GUI scene** whose nodes are all built from code — the scene file itself is nearly empty.

1. In the **Assets** pane, right-click the `main` folder → **New… → Gui File**. Name it **board.gui**.
2. Open **board.gui**. Select the root **Gui** node; in **Properties** set its **Script** to `/src/board.ts.gui_script` (the watcher emits it from `src/board.ts` once you save it in Step 3). Leave the node list empty — `board.ts` builds the grid at startup.
3. Raise **Max Nodes** to at least `600`: the board creates `COLS × ROWS × 2` = 400 box nodes.

> [!WARNING]
> **Order**: **The script must exist before you can attach it.** Save `src/board.ts` at least once (Step 3) so `watch` emits `board.ts.gui_script`, then set it as the scene's **Script**. If the picker doesn't show it, the watcher hasn't run yet.

### 2b — Create the board object

1. Right-click `main` → **New… → Game Object File**, name it **board.go**.
2. In the **Outline**, right-click root → **Add Component File** → choose **board.gui**. Give the component the **Id** `board`. (A `.gui` is a component; the game object just hosts it.)

### 2c — Assemble the scene

1. Open **main.collection**. Right-click root → **Add Game Object File** → choose **board.go**. Set its **Id** to `board`. The script centers the grid (Step 5).
2. Add the HUD the same way (Step 9): a game object **Id** `hud` hosting a `hud.gui` scene driven by `hud.ts.gui_script`. The board posts to `/hud#hud`.
3. Open **game.project** → **Bootstrap** and confirm **Main Collection** is `/main/main.collection`.

That's the entire scene. The script draws every cell.

## 03 — Model the grid

We start with a pure model: a 10×20 grid of cells, each empty or holding a piece color. Engine-free logic is easy to reason about and to type.

**`src/grid.ts`**

```ts
export const COLS = 10;
export const ROWS = 20;

// 0 = empty; 1..7 = a locked block of that piece's color index.
export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Grid = Cell[][];

export function emptyGrid(): Grid {
  const g: Grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) row.push(0);
    g.push(row);
  }
  return g;
}

// Is this cell free? Out-of-bounds below/sides counts as blocked;
// above the top (r < 0) is allowed so pieces can spawn off-screen.
export function isFree(g: Grid, c: number, r: number): boolean {
  if (c < 0 || c >= COLS || r >= ROWS) return false;
  if (r < 0) return true;
  return g[r][c] === 0;
}
```

> [!WARNING]
> **Tripwire** Compare with `=== 0`, never `if (cell)`. An empty cell would otherwise read as "occupied." This is the single most common silent bug crossing TS to Lua.

This module is a **shared singleton**: every `import` becomes a cached `require`. Per-playthrough state stays on `self` (Step 6).

## 04 — Define the tetrominoes

Each piece is four cells plus a color, stored as a `[col, row]` offset from a **pivot** at `[0, 0]` — the point the piece spins around. `row` grows downward to match the grid.

### How a single shape is built

Read offsets as "relative to the pivot." The T-piece in its spawn orientation is the pivot, plus one cell left, right, and below:

```text
// offsets:  [0,0]  [-1,0]  [1,0]  [0,1]
//           pivot  left    right  below

   -1   0  +1     ← col offset
0   ▓   ▓   ▓      [-1,0] [0,0] [1,0]
+1      ▓          [0,1]
```

### How rotations are derived

Here's the one piece of geometry worth knowing. To rotate any offset 90° **clockwise** around the pivot, swap the coordinates and negate the new column: `[c, r] → [-r, c]`. Apply it four times and you cycle back to the start. We don't hand-invent rotations — we compute them from one base shape.

**In plain English:** every shape has four cells, and we spin one of them around the others. The math is one line.

```ts
// 90° clockwise about the pivot. row grows downward,
// so this turns "right" into "down", "down" into "left", etc.
function rotateCW(cells: Offset[]): Offset[] {
  return cells.map(([c, r]) => [-r, c] as Offset);
}

// Build all 4 states from a base: [base, +90, +180, +270].
function fourRotations(base: Offset[]): Offset[][] {
  const states: Offset[][] = [base];
  for (let i = 0; i < 3; i++) {
    states.push(rotateCW(states[states.length - 1]));
  }
  return states;
}
```

> [!NOTE]
> **Why this works** `[c,r] → [-r,c]` is the +90° rotation matrix specialized to integers. The pivot stays at `[0,0]`; the other three cells swing around it. The **O** piece looks identical in all four states, and **S/Z/I** visually only have two — but four-for-every-piece keeps indexing uniform, so rotation is always `(rot + 1) % 4`.

### The seven base shapes

That leaves one thing to author by hand: the spawn shape. Everything else is computed. The color index (1–7) matches `TINTS` in Step 5.

**`src/pieces.ts`**

```ts
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

// color, then the spawn-orientation cells. Pivot is [0,0].
export const PIECES: Piece[] = [
  { color: 1, rots: four([[-1,0], [0,0], [1,0], [2,0]]) }, // I  ▓▓▓▓
  { color: 2, rots: four([[0,0], [1,0], [0,1], [1,1]]) }, // O  ▓▓ / ▓▓
  { color: 3, rots: four([[0,0], [-1,0], [1,0], [0,1]]) }, // T  ▓▓▓ / .▓.
  { color: 4, rots: four([[0,0], [1,0], [-1,1], [0,1]]) }, // S  .▓▓ / ▓▓.
  { color: 5, rots: four([[-1,0], [0,0], [0,1], [1,1]]) }, // Z  ▓▓. / .▓▓
  { color: 6, rots: four([[-1,0], [0,0], [1,0], [1,1]]) }, // J  ▓▓▓ / ..▓
  { color: 7, rots: four([[-1,0], [0,0], [1,0], [-1,1]]) }, // L  ▓▓▓ / ▓..
];

// Where a piece sits when it enters: which [col,row] cells does
// rotation `rot` of `piece` occupy if its pivot is at (px, py)?
export function cellsAt(piece: number, rot: number, px: number, py: number): Offset[] {
  return PIECES[piece].rots[rot].map(([c, r]) => [px + c, py + r] as Offset);
}

// 7-bag randomizer: shuffle all 7, deal them out, repeat.
// Guarantees no long droughts — the modern-Tetris feel.
let bag: number[] = [];
export function nextPieceIndex(): number {
  if (bag.length === 0) {
    bag = [0,1,2,3,4,5,6];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = math.random(0, i); // Defold's math.random — not JS Math
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop()!;
}
```

> [!NOTE]
> **Tripwire** Use Defold's `math.random`, not `Math.random()` — the JS standard library mostly doesn't survive compilation, so reach for the engine's `math`, `os`, and `json` modules. `cellsAt` is the bridge from abstract piece data to board position — Step 7 calls it on every movement check.

## 05 — Render the board with generated GUI nodes

Here's the central trick: the script generates the whole `COLS × ROWS` grid with `gui.new_box_node` at startup, and each frame only changes each node's **color**. Each cell is two stacked boxes (`border` plus a smaller `fill` on top), so `GAP` and `BORDER` are single variables to tune.

**`src/board.ts`** · excerpt

```ts
import { COLS, ROWS } from "./grid";

const CELL = 28; // cell pitch in pixels
const GAP = 2; // space between cells — tune the grid look from one place
const BORDER = 2; // thickness of the frame drawn around each filled cell

// Bottom-left of the board in GUI (screen) space, centering 280×560 in 400×720.
const ORIGIN_X = (400 - COLS * CELL) / 2;
const ORIGIN_Y = (720 - ROWS * CELL) / 2;

// Fill colors by Cell value (1..7); index 0 is transparent (empty).
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

// Generate the grid as GUI box nodes — nothing is placed in the editor.
function buildGrid(): { fills: GuiNode[][]; borders: GuiNode[][] } {
  const fills: GuiNode[][] = [];
  const borders: GuiNode[][] = [];
  const outer = CELL - GAP; // border box size (leaves the gap between cells)
  const inner = outer - 2 * BORDER; // fill box size (leaves the border)
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

// Paint one cell: recolor its fill and border from the model value.
function paint(self, r: number, c: number, value: number) {
  gui.set_color(self.fills[r][c], value === 0 ? EMPTY_FILL : TINTS[value]);
  gui.set_color(self.borders[r][c], value === 0 ? EMPTY_BORDER : BORDERS[value]);
}
```

The renderer is "model → colors": each frame, walk the grid and set every cell's fill and border color. Empty cells paint a dim well; filled cells get their piece color plus a darker border. Row `0` is the top, so we flip `r` against `ROWS` for y.

> [!NOTE]
> **Why generate, not place** Nodes created from code (`gui.new_box_node`) need no editor work and scale with `COLS`/`ROWS` — change the board size and the grid follows. Recoloring an existing node every frame is far cheaper than creating and deleting nodes as pieces move: build once, recolor forever. The only editor knob is the scene's **Max Nodes** (`COLS × ROWS × 2`, we set 600 in Step 2).

## 06 — Gravity and the game loop

Tetris runs on a clock: every `fall` seconds, the piece drops one row. We accumulate `dt` in `update` and step when the accumulator crosses the threshold. Per-playthrough state lives on `self`.

**`src/board.ts`** · the script

**Game loop in one breath:** every frame, add `dt` to a timer; when the timer hits `fall`, drop one row; redraw.

```ts
export default defineGuiScript({
  init() {
    msg.post(".", "acquire_input_focus"); // or no input fires
    const grid = buildGrid();
    return {
      fills: grid.fills,           // generated GUI fill nodes
      borders: grid.borders,       // generated GUI border nodes
      grid: emptyGrid(),
      piece: nextPieceIndex(),
      rot: 0,
      px: 4, py: 0,             // active piece column/row (pivot)
      timer: 0,
      fall: 0.8,                 // seconds per gravity step
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
      stepDown(self); // move down, or lock if blocked
    }
    redraw(self);    // model → colors, every frame
  },

  on_input(self, action_id, action) {
    if (self.over || !action.pressed) return;
    if (action_id === LEFT)        tryMove(self, -1, 0);
    else if (action_id === RIGHT)  tryMove(self, 1, 0);
    else if (action_id === SOFT)   tryMove(self, 0, 1);
    else if (action_id === ROTATE) tryRotate(self);
  },
});
```

> [!NOTE]
> **State tiers** Three homes, used on purpose: **`self`** for per-playthrough state, **shared modules** for stateless logic, nothing global. Pick the narrowest tier that fits.

## 07 — Input and movement

Bind keys in **game.project → Input → Game Binding**: map Left/Right/Down/Up to `left`, `right`, `soft_drop`, `rotate`. The `on_input` hook (Step 6) dispatches each one. Pre-hash every action id at module scope to compare hash-to-hash.

**`src/board.ts`** · input ids

```ts
// Module scope: hashed once, shared by the whole script.
const LEFT = hash("left");
const RIGHT = hash("right");
const SOFT = hash("soft_drop");
const ROTATE = hash("rotate");
```

The three helpers share one rule: **never move the piece until the target is legal.** Compute where it _would_ land, test every cell against the model, commit only if all four are free.

**`src/board.ts`** · movement

```ts
import { cellsAt, PIECES } from "./pieces";
import { isFree } from "./grid";

// Would this piece/rotation fit with its pivot at (px, py)?
function fits(self, piece: number, rot: number, px: number, py: number): boolean {
  for (const [c, r] of cellsAt(piece, rot, px, py)) {
    if (!isFree(self.grid, c, r)) return false;
  }
  return true;
}

// Can the *current* piece exist where it is? (used at spawn)
function canPlace(self): boolean {
  return fits(self, self.piece, self.rot, self.px, self.py);
}

// Try to shift by (dc, dr). Returns whether it moved.
function tryMove(self, dc: number, dr: number): boolean {
  if (fits(self, self.piece, self.rot, self.px + dc, self.py + dr)) {
    self.px += dc;
    self.py += dr;
    return true;
  }
  return false;
}

// Try to rotate clockwise, with a tiny wall-kick: if the rotated
// piece overlaps, nudge it one cell left or right before giving up.
function tryRotate(self): void {
  const next = (self.rot + 1) % 4;
  for (const kick of [0, -1, 1]) {        // in place, then nudge
    if (fits(self, self.piece, next, self.px + kick, self.py)) {
      self.rot = next;
      self.px += kick;
      return;
    }
  }
  // no legal kick → rotation refused, piece stays put
}
```

> [!WARNING]
> **Tripwire** `action_id` arrives **pre-hashed**. Comparing to a string literal (`action_id === "left"`) never matches at runtime and won't compile. Hash once, compare hash-to-hash.

> [!NOTE]
> **Wall kicks** Real Tetris uses the full SRS kick tables (five offsets per rotation). The three-candidate version here stops a rotation jamming against a wall. Swap in the full tables later for spin tricks.

All four helpers test against the `grid.ts` model and never touch a GUI node — every movement is just data.

## 08 — Locking and line clears

When gravity can't move the piece down, it **locks**: its four cells become permanent grid values. Then we scan for full rows and drop everything above.

**When a piece can't fall any more, its four cells freeze into the board, and we look for full rows to remove.**

**`src/grid.ts`** · clearLines

```ts
// Remove every full row; return how many were cleared.
export function clearLines(g: Grid): number {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    let full = true;
    for (let c = 0; c < COLS; c++) {
      if (g[r][c] === 0) { full = false; break; }
    }
    if (full) {
      g.splice(r, 1);              // drop the row out
      const blank: Cell[] = [];
      for (let c = 0; c < COLS; c++) blank.push(0);
      g.unshift(blank);          // new empty row on top
      cleared++;
      r++; // recheck the same index — rows shifted down
    }
  }
  return cleared;
}
```

> [!NOTE]
> **Data structures** `splice`/`unshift`/`push` all work — TypeScript arrays become Lua tables via the toolchain's array helpers. They carry a tiny runtime cost but are exactly right here. (Regex and `BigInt` are the notable things that _don't_ survive.)

### Locking, and the gravity step that triggers it

Back in `board.ts`, gravity tries to move the piece down one row. If it can't, the piece has landed: we stamp its cells into the grid, clear full lines, and spawn the next piece. `stepDown` is the function the game loop called in Step 6.

**`src/board.ts`** · lock & step

```ts
import { clearLines } from "./grid";
import { cellsAt, PIECES, nextPieceIndex } from "./pieces";

// Stamp the active piece permanently into the grid model.
function lockPiece(self): void {
  const color = PIECES[self.piece].color;
  for (const [c, r] of cellsAt(self.piece, self.rot, self.px, self.py)) {
    if (r >= 0) self.grid[r][c] = color; // ignore cells above the top
  }
}

// One gravity tick: drop a row, or lock + advance if blocked.
function stepDown(self): void {
  if (tryMove(self, 0, 1)) return; // moved down — done

  lockPiece(self);                  // can't fall → it locks
  onLocked(self);                   // score, then spawn next (Step 9)
}
```

> [!NOTE]
> **Why r ≥ 0** A piece can lock while part of it is still above the visible board (row `< 0`). Skip those cells when stamping — writing to `grid[-1]` would error. If any visible cell of the next spawn is already filled, `onLocked` catches it via `canPlace`.

### Drawing the model: the one render function

Everything above mutates pure data. `redraw` — called every frame from `update` — pushes the model onto the screen. It paints every locked cell, then the active piece on top.

**`src/board.ts`** · redraw

```ts
import { COLS, ROWS } from "./grid";

function redraw(self): void {
  // 1. Start from the locked grid: paint each cell its color.
  const frame: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) row.push(self.grid[r][c]);
    frame.push(row);
  }

  // 2. Overlay the falling piece (skip cells above the top).
  if (!self.over) {
    const color = PIECES[self.piece].color;
    for (const [c, r] of cellsAt(self.piece, self.rot, self.px, self.py)) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) frame[r][c] = color;
    }
  }

  // 3. Recolor every cell node from the composed frame.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      paint(self, r, c, frame[r][c]);
    }
  }
}
```

> [!NOTE]
> **Locked vs falling** The model (`self.grid`) only ever holds _locked_ blocks. The falling piece lives in `self.piece/rot/px/py` and is composited on top. Movement never touches the grid, so there's nothing to "erase." The next `redraw` composes a fresh frame.

## 09 — Score, levels, and game over

Award points by lines cleared at once (classic 40/100/300/1200 × level), speed up as lines accumulate, end when a fresh spawn overlaps. `onLocked` is what `stepDown` calls the moment a piece locks.

**`src/board.ts`** · scoring

```ts
// points for clearing 1/2/3/4 rows at once, before the ×level
const LINE_SCORE = [0, 40, 100, 300, 1200];

function onLocked(self): void {
  const n = clearLines(self.grid);
  if (n > 0) {
    self.lines += n;
    self.score += LINE_SCORE[n] * self.level;
    self.level = 1 + math.floor(self.lines / 10);
    self.fall = math.max(0.08, 0.8 - (self.level - 1) * 0.07);
    postHud(self); // tell the GUI to refresh
  }
  // spawn the next piece at the top-center pivot
  self.piece = nextPieceIndex();
  self.rot = 0;
  self.px = 4;
  self.py = 0;
  if (!canPlace(self)) {
    self.over = true;
    if (self.hud) msg.post("/hud#hud", "game_over");
  }
}
```

**Game over is just the spawn check failing — if the new piece can't fit at the top, the stack reached the ceiling.**

### Hard drop — the satisfying one

Soft drop is in already. **Hard drop** slams the piece to the bottom and locks it. Keep moving down until you can't, award a point per cell dropped, then lock. Bind a key to `hard_drop` and route it through `on_input`:

**`src/board.ts`** · hard drop

```ts
const HARD = hash("hard_drop");

function hardDrop(self): void {
  while (tryMove(self, 0, 1)) self.score += 1;
  self.timer = self.fall; // force a lock on the next update tick
}

// add to on_input:
// else if (action_id === HARD) hardDrop(self);
```

### The HUD: a separate GUI script

Score and level live on their **own** GUI scene. Add a **.gui** file with two text nodes (`score`, `level`) plus a hidden `gameover` node, then drive it from a `.gui_script`. The board and the HUD are two such pairs.

**`src/hud.ts`** · separate file

```ts
import { defineGuiScript } from "@defold-typescript/types/gui-script";

export default defineGuiScript({
  init() {
    // A gui script has no go.exists, so the HUD announces itself; the board
    // posts score/level only after this arrives.
    msg.post("/board#board", "hud_ready");
  },
  on_message(self, message_id, message) {
    if (isMessage(message_id, message, "set_hud")) {
      gui.set_text(gui.get_node("score"), "SCORE  " + message.score);
      gui.set_text(gui.get_node("level"), "LEVEL  " + message.level);
    } else if (message_id === hash("game_over")) {
      gui.set_enabled(gui.get_node("gameover"), true);
    }
  },
});
```

And the board's side: one helper that posts the current numbers, but only once the HUD has registered. A gui script can't call `go.exists`, so the HUD announces itself; the board records that. Because `msg.post` is asynchronous, the HUD shows last frame's values — fine for a score display.

**`src/board.ts`** · postHud

```ts
function postHud(self): void {
  // Only post once the HUD has registered (a gui script has no go.exists).
  if (self.hud) {
    msg.post("/hud#hud", "set_hud", { score: self.score, level: self.level });
  }
}
// call postHud(self) once in init (after the return is built via a
// follow-up) and again whenever score/level change.
```

> [!NOTE]
> **Editor step** Create the HUD object: in `main.collection`, add a **GUI** component to a new game object with **Id** `hud`, point it at your `.gui` file, and attach `hud.ts.gui_script`. Its message URL becomes `/hud#hud`, exactly what the board posts to. A gui script can't call `go.exists`, so the HUD announces itself in its own `init`, and the board posts only after that arrives. The game runs cleanly with or without the HUD. The runnable example ships a ready-made `main/hud.gui` (three text nodes `score`/`level`/`gameover`) wired into `main.collection` — copy it as a starting point.

## 10 — Run it, then ship it

With `watch` running, hit `Project → Build` (or `Cmd/Ctrl`+`B`) in the Defold editor. The engine loads `main.collection`, your board script generates the grid's 400 GUI nodes, and gravity starts ticking.

- Board invisible? Check `board.gui`'s **Script** is `/src/board.ts.gui_script` and **Max Nodes** is at least `600`.
- Keys do nothing? Confirm the input bindings exist and the script posts `acquire_input_focus` in `init`.
- Cells read as occupied when empty? You've hit the `0`-still-counts trap — find the bare `if (cell)` and make it `=== 0`.

To ship, use `Project → Bundle`. The bundle is only Lua — your TypeScript was a build-time convenience.

## 11 — Complete source

All three TypeScript files, end to end. Drop these into `src/`, wire the scene per Step 2, and you have a playable game.

The complete `board.ts` types every `self` through a **`BoardSelf`** interface (a bare `self` is `noImplicitAny`-illegal). The HUD's `hud.ts` imports **`defineGuiScript` from `@defold-typescript/types`**. Nothing else differs from the walkthrough.

> [!NOTE]
> **Verified** Simulated through thousands of locked pieces: every rotation is a four-cell shape, no out-of-range color reaches the grid, line clears drop the residual stack, and a full game runs to a clean game-over. The `.gui`/`.gui_script` is the one editor piece (Step 9).

### `src/grid.ts` — the board model

Pure data: dimensions, the cell/grid types, an empty board, the free-cell test, and line clearing. No engine calls, so it's trivial to reason about.

**`src/grid.ts`** · complete

```ts
export const COLS = 10;
export const ROWS = 20;

export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Grid = Cell[][];

export function emptyGrid(): Grid {
  const g: Grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) row.push(0);
    g.push(row);
  }
  return g;
}

export function isFree(g: Grid, c: number, r: number): boolean {
  if (c < 0 || c >= COLS || r >= ROWS) return false;
  if (r < 0) return true;
  return g[r][c] === 0;
}

export function clearLines(g: Grid): number {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    let full = true;
    for (let c = 0; c < COLS; c++) {
      if (g[r][c] === 0) {
        full = false;
        break;
      }
    }
    if (full) {
      g.splice(r, 1);
      const blank: Cell[] = [];
      for (let c = 0; c < COLS; c++) blank.push(0);
      g.unshift(blank);
      cleared++;
      r++;
    }
  }
  return cleared;
}
```

### `src/pieces.ts` — shapes & the bag

The seven base shapes, the clockwise rotation rule that derives the other three states, the `cellsAt` bridge to board coordinates, and the 7-bag randomizer.

**`src/pieces.ts`** · complete

```ts
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
  if (bag.length === 0) {
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
```

### `src/board.ts` — the game

The script itself: the generated GUI grid, all movement checked against the model, locking, scoring, drawing, and the lifecycle hooks. Everything above is consumed here.

**`src/board.ts`** · complete

```ts
import { defineGuiScript } from "@defold-typescript/types";
import { COLS, clearLines, emptyGrid, type Grid, isFree, ROWS } from "./grid";
import { cellsAt, nextPieceIndex, PIECES } from "./pieces";

const CELL = 28; // cell pitch in pixels
const GAP = 2; // space between cells — tune the grid look from one place
const BORDER = 2; // thickness of the frame drawn around each filled cell

// Bottom-left of the COLS×ROWS board in GUI (screen) space, centering the
// 280×560 grid in the 400×720 window (see game.project display).
const ORIGIN_X = (400 - COLS * CELL) / 2;
const ORIGIN_Y = (720 - ROWS * CELL) / 2;

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
  gui.set_color(self.fills[r][c], value === 0 ? EMPTY_FILL : TINTS[value]);
  gui.set_color(self.borders[r][c], value === 0 ? EMPTY_BORDER : BORDERS[value]);
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
    if (action_id === LEFT) tryMove(self, -1, 0);
    else if (action_id === RIGHT) tryMove(self, 1, 0);
    else if (action_id === SOFT) tryMove(self, 0, 1);
    else if (action_id === ROTATE) tryRotate(self);
    else if (action_id === HARD) hardDrop(self);
  },
  on_message(self, message_id) {
    // The HUD announces itself once loaded; remember it so we only post when
    // it exists (a gui script has no go.exists).
    if (message_id === hash("hud_ready")) self.hud = true;
  },
});
```

> [!NOTE]
> **What's left to you** Two editor-built pieces complete the game: the **input bindings** (`left`/`right`/`soft_drop`/`rotate`/`hard_drop`) and the **HUD .gui scene** with `score`, `level`, and `gameover` nodes driven by `hud.ts`. The playfield itself needs no art — it's generated GUI. The runnable example wires both, so you can copy them directly; each is a Step-2-style editor task, no more TypeScript needed.

## Toolchain tripwires, collected

Every sharp edge in one place:

| Symptom                              | Cause                                                | Fix                                                                   |
| ------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------- |
| Empty cell reads as occupied         | `0` is truthy in Lua                                 | Compare `=== 0` explicitly                                            |
| Keys do nothing                      | `action_id` is a hash, not a string                  | Pre-hash ids, compare hash-to-hash                                    |
| `Math.random` undefined              | JS stdlib doesn't transpile                          | Use engine `math.random`                                              |
| Piece won't negate / vector errors   | `-v3` infers `number`                                | Use `v.unm()`; arithmetic is method-form                              |
| Two scripts in one file              | One `defineScript`/`defineGuiScript` export per file | Split into separate `.ts` files                                       |
| `Instance '/hud' could not be found` | `msg.post` to a missing instance; errors at dispatch | Have the listener register (post to the sender), then post only after |
| `go.*` errors in a GUI script        | `go.*` is `.script`-only — gui scripts have no `go`  | Use `gui.*`/`msg.*`; for optional targets, register via a message     |
| `await` hangs forever                | No event loop                                        | Bridge via `timer.delay` / the timers polyfill                        |

## Next step to explore — show the next tetromino above the board

You have a playable game. The natural next exercise: **a preview of the piece that's coming next**, drawn above the playfield.

The hard part is not the rendering — it is the **peek**. `nextPieceIndex()` in `src/pieces.ts` *consumes* from the 7-bag, so calling it once for "what's next" leaves the bag empty for the spawn. Refactor it into a peek/advance pair: a function that reads without consuming (`peekNextPieceIndex()`), and the existing one becomes "pop, then refill". The board's `onLocked` calls `peekNextPieceIndex()` *before* spawning, so the next-next piece is in hand.

Two reasonable places to draw the preview:

- **In the HUD.** Reuse the `hud.ts` protocol: extend `set_hud` with a `next: number` (color index 1..7), and have `hud.ts` paint a small 4-cell cluster from the same `TINTS` palette above the playfield. The preview logic stays out of `board.ts`.
- **In `board.ts` itself, above the grid.** Generate a second 4×4 set of `gui.new_box_node`s above `ORIGIN_Y` and repaint them the same way `redraw` repaints the grid. Cheaper to wire (no protocol change), but the board script owns two render surfaces.

Either way, the change is small in `board.ts`. The lesson is the **peek-vs-consume split** in `pieces.ts`, which generalizes to "the bag is a stateful randomizer" — the same shape a real Tetris uses for hold-piece and queue-length previews.
