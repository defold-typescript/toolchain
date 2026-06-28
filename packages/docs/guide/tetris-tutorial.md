---
toc-title: Build Tetris
llms-full: false
---
# Build Tetris

![Finished Tetris board](img/tetris-tutorial.png#max-width=200)

Scaffold, wire the Defold scene, and write TypeScript that compiles to Lua.

Tetris is a great project: one moving thing, one fixed-step clock, one tiny rules engine, no physics. Patterns carry over.

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
> **Prereqs**: [Defold](https://defold.com/download/), [Bun](https://bun.sh), and an editor such as [VS Code](https://code.visualstudio.com/).

> The final result can be found at: [`docs/examples/tetris-tutorial/`](https://github.com/defold-typescript/toolchain/tree/main/docs/examples/tetris-tutorial).


## 01 — Scaffold the project

The [Bun](https://bun.sh) CLI generates a Defold project plus TypeScript that compiles to Lua — no engine fork, no runtime to ship.

1. **Create the project folder.** Make an empty folder named `tetris`, then open it in VS Code with **File → Open Folder…**.

2. **Scaffold the project.** Open **Terminal → New Terminal** in VS Code and run:

   ```bash
   bunx @defold-typescript/cli@latest init .
   ```

   > This scaffolds a new Defold project into the current folder — the same as creating one from the Defold start screen. Prefer to start in Defold? Create the project there first, then run the same `init .` inside it: `init` detects the existing `game.project` and just adds the TypeScript surface, leaving your scene untouched.

3. **Install the dependencies** `init` declared — they power editor IntelliSense, type-checking, and compilation to Lua:

   ```bash
   bun install
   ```

4. **Start the watcher** that automatically converts your `.ts` files:

   ```bash
   bunx @defold-typescript/cli watch
   ```

   > Leave `watch` running. On every save it regenerates each `.ts` file's output beside the source — `.ts.script`, `.ts.gui_script`, or a plain `.lua` module — and Defold builds and runs those generated files, never your `.ts`.

5. **Open the project in Defold:** **File → Open Project…** (or the start screen) → **Open From Disk** → `tetris/game.project`.

**What you'll have:** `watch` runs in VS Code, and Defold opens `game.project`.

`init .` writes a sample `src/main.ts` and a boot `main/main.collection`. Nothing else is generated — you add the game's files as you go:

```text
tetris/
├─ .vscode/              # VS Code editor settings, snippets, debug launcher
├─ input/
│  └─ game.input_binding # empty binding init writes; you add triggers in Step 02
├─ main/
│  └─ main.collection    # boot scene init writes
├─ src/
│  └─ main.ts            # sample script — you replace it in Step 05
├─ .gitignore
├─ biome.json
├─ game.project          # Defold project settings
├─ mise.toml
├─ package.json
└─ tsconfig.json
```

> [!NOTE]
> If you build from Defold now (**Project → Build**) before `watch` is running, you'll see a black window. The error `"/src/main.ts.script" could not be found.` is a sign you could have forgotten to start the `watch` process.

In Step 05 you replace `src/main.ts` with `src/board.ts`, and `watch` swaps the generated `src/main.ts.script` for `src/board.ts.gui_script`. You edit `.ts`; Defold runs the generated files.

## 02 — Input bindings

Tetris needs five keys. Defold maps hardware keys to named **actions** through an input binding, and your script listens for those action names. Set this up first — it is pure editor work, and the script in Step 05 expects the names to exist.

`init` already scaffolded an empty `input/game.input_binding` and pointed `game.project` at it, so you only need to fill in the triggers.

1. In the **Assets** pane, open `input/game.input_binding`.
2. Add five **Key Triggers**:

| Input   | Action      |
| ------- | ----------- |
| `Left`  | `left`      |
| `Right` | `right`     |
| `Down`  | `soft_drop` |
| `Up`    | `rotate`    |
| `Space` | `hard_drop` |

> [!WARNING]
> Do not forget to save the files that you edit.

The script hashes these same names (`hash("left")`, and so on) to recognize each key. Bind them now and the script just works when you attach it.

## 03 — Model the grid

Start with a pure model: a 10×20 grid of cells, each empty or holding a piece's color. Engine-free logic is easy to reason about and to type. The whole model is one file — dimensions, the cell types, an empty board, the free-cell test, and line clearing. In VS Code, create `src/grid.ts`:

```ts title="src/grid.ts" {33-40}
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
  return g[r][c] == 0;
}

export function clearLines(g: Grid): number {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    let full = true;
    for (let c = 0; c < COLS; c++) {
      if (g[r][c] == 0) {
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

> [!TIP]
> You can use `cell == 0` (or `===`) if you want to ensure an empty cell is never mistaken for an occupied one once this runs as Lua. A bare `if (cell)` won't do that: Lua treats only `nil` and `false` as falsy, so `0` is [truthy](./typescript-gotchas.md#if-x-truthiness-differs--0-and--are-truthy-in-lua) and an empty cell reads as occupied.

This module is a **shared singleton**: every `import` becomes a cached `require`. Per-playthrough state stays on `self` (Step 05).

> [!MORE] New to grids? How the board is just numbers
> The board is a plain 10×20 table of numbers — no engine types, no graphics. Each cell holds `0` for empty or `1`–`7` for a color. Because it is ordinary data, you can read it, test it, and reason about it without running the game.
>
> **The two types.** `Cell` is one square (`0 | 1 | … | 7`); `Grid` is rows of cells (`Cell[][]`). Everything in this file works on those two shapes alone.
>
> **Reading `isFree`.** It answers "can a square hold a piece here?" A column outside `0…COLS` is a side wall. `r >= ROWS` is the floor — that single test is how a falling piece knows to stop at the bottom. A negative `r` sits above the top of the board and stays free, so a new piece can spawn just off-screen and slide into view.

Each function in this file does one small job. Open any walkthrough below for a line-by-line read.

> [!MORE] `emptyGrid` — build a blank board
> ```ts
> export function emptyGrid(): Grid {
>   const g: Grid = [];
>   for (let r = 0; r < ROWS; r++) {
>     const row: Cell[] = [];
>     for (let c = 0; c < COLS; c++) row.push(0); // [!code highlight]
>     g.push(row);
>   }
>   return g;
> }
> ```
> It takes nothing and returns a fresh `Grid`: `ROWS` arrays of `COLS` zeros. The highlighted line fills one row with empty cells; the outer loop stacks twenty such rows. Call it once when a game starts to get a clean board.

> [!MORE] `isFree` — can a square sit here?
> ```ts {4}
> export function isFree(g: Grid, c: number, r: number): boolean {
>   if (c < 0 || c >= COLS || r >= ROWS) return false;
>   if (r < 0) return true;
>   return g[r][c] == 0;
> }
> ```
> It takes the grid and a `[c, r]` cell and returns `true` only when a piece may occupy it. Off the sides or below the floor is `false`; above the top is `true`, so pieces spawn off-screen. The trap is the highlighted line: write `== 0`, because `0` is truthy in Lua and a bare `if (g[r][c])` would read every empty cell as full.

> [!MORE] `clearLines` — drop full rows and count them
> ```ts {7}
> export function clearLines(g: Grid): number {
>   let cleared = 0;
>   for (let r = ROWS - 1; r >= 0; r--) {
>     let full = true;
>     for (let c = 0; c < COLS; c++) if (g[r][c] == 0) full = false;
>     if (full) {
>       g.splice(r, 1);
>       const blank: Cell[] = [];
>       for (let c = 0; c < COLS; c++) blank.push(0);
>       g.unshift(blank);
>       cleared++;
>       r++;
>     }
>   }
>   return cleared;
> }
> ```
> It scans rows from the bottom up; whenever a row has no empty cell it deletes that row (`splice`) and pushes a fresh blank one onto the top (`unshift`) — gravity for the whole stack. It returns how many rows vanished, which Step 05 turns into score. The `r++` after a clear re-checks the same index, because every row above just shifted down by one.

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

> [!MORE] Where `[c, r] → [-r, c]` comes from
> A piece is just a handful of `[col, row]` offsets measured from a **pivot** at `[0, 0]`. Rotating the whole piece 90° clockwise is the same move applied to each offset: swap the two numbers, then flip the sign of the new column. That is all `[c, r] → [-r, c]` says.
>
> **Why row grows downward.** Row `0` is the top and rows count up as you go down, the way screen pixels do. With that convention the formula turns "right" (`[1, 0]`) into "down" (`[0, 1]`), "down" into "left", and so on — exactly the clockwise turn you see on screen.
>
> **Why four states.** Apply the move four times and the piece lands back where it started. Some pieces look the same in two or four of those states, but storing all four keeps the bookkeeping uniform: the next rotation is always `(rot + 1) % 4`.

```ts title="(snippet)"
// 90° clockwise about the pivot. row grows downward,
// so this turns "right" into "down", "down" into "left", etc.
function rotateCW(cells: Offset[]): Offset[] {
  return cells.map(([c, r]) => [-r, c] as Offset); // [!code highlight]
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
> **Why this works**: `[c,r] → [-r,c]` is the +90° rotation matrix specialized to integers. The pivot stays at `[0,0]`; the other three cells swing around it. The **O** piece looks identical in all four states, and **S/Z/I** visually only have two — but four-for-every-piece keeps indexing uniform, so rotation is always `(rot + 1) % 4`.

### The seven base shapes

That leaves one thing to author by hand: the spawn shape. Everything else is computed. The color index (1–7) matches `TINTS` in Step 05. Create `src/pieces.ts`:

```ts title="src/pieces.ts"
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
```

> [!NOTE]
> This uses Lua's `math.random(0, i)` because the two-argument form returns an integer in a range directly. `Math.random()` compiles fine too — it becomes `math.random()` — but returns a float in `[0, 1)`, so for an index you'd write `math.floor(Math.random() * (i + 1))`. Much of the JS standard library transpiles (`Math`, array and string methods); reach for Defold's `math`, `os`, and `json` for engine-specific concerns. `cellsAt` is the bridge from abstract piece data to board position — Step 05 calls it on every movement check.

Here is each piece of `pieces.ts` on its own. Open a walkthrough for a closer look.

> [!MORE] `rotateCW` — spin one shape 90°
> ```ts {2}
> function rotateCW(cells: Offset[]): Offset[] {
>   return cells.map(([c, r]) => [-r, c] as Offset);
> }
> ```
> It takes a shape's offsets and returns the same shape turned one quarter-turn clockwise — the single move `[c, r] → [-r, c]` applied to every cell. `four()` calls it three times to precompute all four rotations, so the running game never rotates anything; it just indexes `rots[rot]`.

> [!MORE] `PIECES` — the seven shapes as data
> Each entry is one tetromino: a `color` (`1`–`7`) and `rots`, its four precomputed rotations from `four(base)`. You author only the spawn offsets — the `[-1,0] [0,0] [1,0] [2,0]` block is the I-piece laid flat — and `four` derives the other three states. The trailing comment on each entry (`// I`, `// O`, …) names the letter the shape resembles.

> [!MORE] `cellsAt` — where a piece sits on the board
> ```ts {2}
> export function cellsAt(piece: number, rot: number, px: number, py: number): Offset[] {
>   return PIECES[piece].rots[rot].map(([c, r]) => [px + c, py + r] as Offset);
> }
> ```
> It takes a piece index, a rotation, and a pivot position `[px, py]`, and returns the four board cells that piece would cover. It is pure offset math — add the pivot to each stored offset — so Step 05 can ask "would this move land legally?" by testing the result against `isFree` before committing.

> [!MORE] `nextPieceIndex` — the shuffled-bag randomizer
> ```ts {7}
> let bag: number[] = [];
> export function nextPieceIndex(): number {
>   if (bag.length == 0) {
>     bag = [0, 1, 2, 3, 4, 5, 6];
>     for (let i = bag.length - 1; i > 0; i--) {
>       const j = math.random(0, i);
>       [bag[i], bag[j]] = [bag[j], bag[i]];
>     }
>   }
>   const index = bag[bag.length - 1];
>   bag.pop();
>   return index;
> }
> ```
> Instead of pure random it deals from a bag holding all seven pieces, refilling and reshuffling only once the bag empties — so you never hit long droughts or floods of one shape. The shuffle is the highlighted Fisher–Yates swap, using Lua's integer `math.random(0, i)`. Each call pops one index off the end and returns it.

## 05 — The board script: `src/board.ts`

This is the heart of the game: one GUI script that builds the grid, runs gravity, reads input, locks pieces, scores lines, and redraws every frame. The whole `src/board.ts` is below. Here's how to read it:

- **State** — `init` returns a **`BoardSelf`**: the generated GUI nodes, the grid model, the active piece (index, rotation, pivot `px`/`py`), the gravity timer, and the score/level fields. TypeScript won't let `self` stay untyped, so `BoardSelf` is the shape you declare for it. `init` first posts `acquire_input_focus` to itself (`.`) — without that, no key ever reaches `on_input`. The five input names are hashed once at module scope (`hash("left")` through `hash("hard_drop")`).
- **Gravity** — Tetris runs on a clock: every `fall` seconds the piece drops one row. In one breath: each frame `update` adds `dt` to a timer; when the timer crosses `fall`, drop one row; then redraw.
- **Input** — `on_input` compares the pre-hashed `action_id` against the five constants. Every helper shares one rule: never move a piece until the target is legal — compute where it _would_ land, test each cell against the model, commit only if all four are free.
- **Lock and clear** — when gravity can't move the piece down, its four cells **freeze into the board** as permanent grid values; then full rows clear and everything above drops one row.
- **Scoring and game over** — clearing 1/2/3/4 rows at once scores the classic 40/100/300/1200 × level, and the fall speeds up as lines accumulate. A fresh spawn that can't fit means the **stack reached the ceiling** — game over.
- **Render** — `redraw` paints the model onto the screen: each frame it lays the falling piece over the locked grid, then recolors every cell node to match. The model only ever holds locked blocks, so moving a piece never erases anything — the next frame just paints the new position.
- **Messages** — `on_message` listens for the HUD's `hud_ready` so the board sends score updates only after the HUD exists (Step 08). You can ignore it if you skip the HUD.

Create `src/board.ts`:

```ts title="src/board.ts"
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
```

Then **delete the sample `src/main.ts`** that `init` scaffolded — it was only a placeholder. On the next save `watch` removes the stale `src/main.ts.script` and emits `src/board.ts.gui_script` beside `board.ts`.

> [!NOTE]
> **State tiers**: Three homes, used on purpose: **`self`** for per-playthrough state, **shared modules** for stateless logic, nothing global. Pick the narrowest tier that fits.

## 06 — Wire the scene

The script exists now, so the editor's picker can find it. The board draws itself from code, so the editor work is small — one project setting, an empty GUI scene, and one game object, no sprite, no atlas, no factory.

1. **Set the window size.** In **Assets**, open **game.project**, and under **Display** set **Width** to `400` and **Height** to `720` (turn **High Dpi** on for crisp cells). `init` leaves the display unset, so Defold defaults to a landscape **960×640**, but Tetris is a tall 10×20 board — `board.ts` centers its 280×560 grid in a **400×720** portrait window (`ORIGIN_X`/`ORIGIN_Y` in Step 05). Skip this and the board renders jammed into a corner instead of centered. If you prefer a different size, change the `400`/`720` literals in `board.ts` to match.
2. **Create the board GUI scene.** In **Assets**, right-click `main` → **New… → GUI**, name it **board.gui**. Open it, select the root **GUI** node in the Outline, and set its **Script** to `/src/board.ts.gui_script`. Leave the node list empty — `board.ts` builds the grid at startup. Raise **Max Nodes** to at least `600` (the board creates `COLS × ROWS × 2` = 400 box nodes).
3. **Create the board object.** Right-click `main` → **New… → Game Object File**, name it **board.go**. In the **Outline**, right-click root → **Add Component File** → choose **board.gui**, and give the component the **Id** `board`. (A `.gui` is a component; the game object hosts it.)
4. **Assemble the scene.** Open **main.collection** (already created by `init`). It still holds the scaffold's `main` game object, whose component points at `/src/main.ts.script` — gone once you deleted the sample `src/main.ts` in Step 05, so leaving it fails the build with `"/src/main.ts.script" could not be found`. Right-click it → **Delete**. Then right-click root → **Add Game Object File** → choose **board.go**, set its **Id** to `board`. Confirm **game.project → Bootstrap → Main Collection** is `/main/main.collection`.

That's the entire scene. The script draws every cell.

## 07 — Run it, then ship it

**Run.** With `watch` running, hit **Project → Build** in the Defold editor (`Cmd/Ctrl+B`, the *Build-and-Run* shortcut). The engine loads `main.collection`, your board script generates the grid's 400 GUI nodes, and gravity starts ticking.

If the first build looks off, check these in order:

- **Board invisible?** Confirm `board.gui`'s **Script** is `/src/board.ts.gui_script` and **Max Nodes** is at least `600`.
- **Board off-center or running off-screen?** The window isn't `400×720` — set **game.project → Display** to `400×720` (Step 06), or change the `400`/`720` literals in `board.ts` to your window.
- **Keys do nothing?** Confirm the Step 02 input bindings exist and the script posts `acquire_input_focus` in `init`.
- **Cells read as occupied when empty?** You've hit the `0`-still-counts trap — find the bare `if (cell)` and make it `== 0`.

**Ship.** Use **Project → Bundle**. The bundle is only Lua — your TypeScript was a build-time convenience.

## 08 — Optional: Add the HUD

The core game is complete. Score and level are a stretch goal on their **own** GUI scene, so you can stop at Step 07 if you only want the board.

It announces itself to the board with `hud_ready`, then paints `score`/`level` text and reveals a `gameover` node on the matching messages. Create `src/hud.ts`:

```ts title="src/hud.ts"
import { defineGuiScript } from "@defold-typescript/types";

// `set_hud` is a project-defined message, not a Defold builtin, so the
// `isMessage` guard (which only accepts builtin ids) does not apply here: match
// the id directly and read the payload `board.ts` posts. `message` arrives as
// `Record<string | number, unknown>`, so the score/level are stringified for
// display rather than typed through a builtin payload.
export default defineGuiScript({
  init() {
    // Hide the game-over banner at startup; on_message re-enables it on game over.
    gui.set_enabled(gui.get_node("gameover"), false);
    // A gui script can't be probed with go.exists, so announce ourselves to the
    // board; it posts score/level updates only once we have registered.
    msg.post("/board#board", "hud_ready");
  },
  on_message(_self, message_id, message) {
    if (message_id == hash("set_hud")) {
      gui.set_text(gui.get_node("score"), `SCORE  ${String(message.score)}`);
      gui.set_text(gui.get_node("level"), `LEVEL  ${String(message.level)}`);
    } else if (message_id == hash("game_over")) {
      gui.set_enabled(gui.get_node("gameover"), true);
    }
  },
});
```

Then build the scene, all editor work:

1. **Create `main/hud.gui`** (**New… → GUI**) and **add a font first** — a GUI text node renders nothing, and `default` won't appear in a node's **Font** dropdown, until the scene has a font. Right-click the **Fonts** folder → **Add ▸ Font**, pick `/builtins/fonts/default.font`; it appears as `default`. Then select the root node and set **Script** to `/src/hud.ts.gui_script`.
2. **Add three text nodes** to the **Nodes** folder, each with its **Font** property set to `default`:
    * `score` (top-left, "SCORE  0"),
    * `level` (below it, "LEVEL  1")
    * `gameover` (centered, "GAME OVER") — leave it **Enabled**. `hud.ts` hides it at startup with `gui.set_enabled(gui.get_node("gameover"), false)` in `init` and re-enables it on game over, so the editor's **Enabled** toggle stays on (toggling it off in the editor works too, but the code already covers it).
3. **Create the HUD object.** Right-click `main` → **New… → Game Object File**, name it **hud.go** — this file *is* a game object. In its **Outline**, right-click root → **Add Component File** → choose **hud.gui**, and give the component the **Id** `hud`. (A `.gui` is a component; the game object hosts it.)
4. **Add it to the scene.** Open **main.collection**, right-click root → **Add Game Object File** → choose **hud.go**, and set its **Id** to `hud`. A Defold message URL is `/<game-object-id>#<component-id>`, so this game object (`/hud`) plus the component **Id** `hud` make `/hud#hud` — exactly where `board.ts` posts `set_hud` and `game_over` (`msg.post("/hud#hud", …)`). The board sits at `/board#board` for the same reason.

## Toolchain tripwires, collected

Every sharp edge in one place:

| Symptom                              | Cause                                                | Fix                                                                   |
| ------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------- |
| Empty cell reads as occupied         | `0` is truthy in Lua                                 | Compare `== 0` explicitly                                             |
| Keys do nothing                      | `action_id` is a hash, not a string                  | Pre-hash ids, compare hash-to-hash                                    |
| Need a random integer in a range     | `Math.random()` compiles fine but is a float `[0,1)` | Use Lua `math.random(m, n)` for an integer range                      |
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
