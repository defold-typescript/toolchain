---
toc-title: Build Tetris
---
# Build Tetris in TypeScript

A complete, from-scratch walkthrough: scaffold the project, wire the scene in the Defold editor, and write every system in TypeScript that compiles to the Lua the engine runs.

A complete, buildable version of everything below lives in the repository at `docs/examples/tetris-tutorial/` — the full, compiling source you can clone, `watch`, and build.

Tetris is the perfect second Defold project. It has exactly one moving thing, a fixed-step clock, a tiny rules engine, and no physics — so every concept you learn here is the concept, not a workaround. We render the whole board with a single factory, drive it on a fixed timestep, and lean on the type system to catch the mistakes that silently break a Lua build.

| Piece | Index | Color |
| ----- | ----- | ----- |
| I | 1 | cyan |
| O | 2 | yellow |
| T | 3 | purple |
| S | 4 | green |
| Z | 5 | red |
| J | 6 | blue |
| L | 7 | orange |

> [!NOTE]
> **Prereqs** You know Defold basics (game objects, components, collections) and have Bun installed. No prior TypeScript-on-Defold experience needed — every toolchain-specific quirk is called out where it bites.

## 01 — Scaffold the project

The toolchain is a Bun CLI. It generates a Defold project plus a TypeScript surface that compiles down to Lua beside it — no engine fork, no runtime to ship.

```bash
# scaffold a new project
bunx @defold-typescript/cli@latest init tetris
cd tetris

# start the watcher — recompiles .ts → .lua on save
bunx @defold-typescript/cli watch
```

Leave `watch` running in its own terminal. It transpiles your TypeScript to Lua continuously — **the Defold editor never sees your `.ts` files**, only the `.lua` the CLI emits next to them. That split is the one thing to internalize about this workflow: you edit TypeScript, the engine runs Lua, and the watcher is the bridge.

Here's the layout we'll end up with. Everything you hand-write lives under `src/`; the compiled output and Defold scene files live in the project root.

```text
tetris/
├─ game.project        # Defold project settings
├─ main/
│  ├─ main.collection  # the scene you wire in the editor
│  ├─ block.go         # one cell prototype (spawned by factory)
│  └─ board.go         # holds the board script + factory
└─ src/
   ├─ board.ts         # the game — compiles to board.ts.script
   ├─ pieces.ts        # tetromino shape data (shared module)
   └─ grid.ts          # pure board logic (shared module)
```

## 02 — Build the scene in the Editor

This is the part tutorials usually skip. Defold is editor-first: scripts attach to components, components attach to game objects, game objects live in collections. Here's exactly what to click.

### 2a — Create the block prototype

Every cell on the board is an instance of one tiny game object. We build that prototype once.

1. In the **Assets** pane (left), right-click the `main` folder → **New… → Game Object File**. Name it **block.go**.
2. Double-click **block.go** to open it. In the **Outline** pane, right-click the root → **Add Component → Sprite**.
3. Select the new **Sprite**. In **Properties**, set **Image** to an atlas or tilesource containing a single white square. (Make a 1×1 white PNG, drag it in as an atlas with one animation named `block`, then set the sprite's **Default Animation** to `block`.)
4. We'll tint each block per-piece from code, so the white square is intentional — white × color = the piece color.

> [!NOTE]
> **Why white** A sprite's `tint` multiplies the texture. Start from white and a single sprite can become any of the seven piece colors at runtime — no seven separate images.

### 2b — Create the board object

1. Right-click `main` → **New… → Game Object File**, name it **board.go**. Open it.
2. In the **Outline**, right-click root → **Add Component → Factory**. Select it, and in **Properties** set **Prototype** to `/main/block.go`. Give the factory the **Id** `blockfactory`.
3. Right-click root again → **Add Component File**. We'll point this at the compiled script in the next step — for now, note that the watcher will produce `/src/board.ts.script`. Select that file. Give the component the **Id** `board`.

> [!WARNING]
> **Order** **The component file must exist before you can attach it.** Save `src/board.ts` at least once (Step 3) so `watch` emits `board.ts.script`, then attach it here. If the picker doesn't show it, the watcher hasn't run yet.

### 2c — Assemble the scene

1. Open **main.collection**. Right-click root → **Add Game Object File** → choose **board.go**. This places one board instance in the scene.
2. Select it and set its **Id** to `board` and position to a comfortable spot (e.g. `x 280, y 60`) so the playfield sits on screen.
3. Open **game.project** → **Bootstrap** and confirm **Main Collection** is `/main/main.collection`.

That's the entire scene: one board object, holding a factory that stamps out block instances, driven by one script. No per-cell objects placed by hand — code spawns all 200 of them.

## 03 — Model the grid

Before any rendering, we need a pure model of the board: a 10×20 grid of cells, each either empty or holding a piece color. Keeping this logic free of engine calls makes it trivial to reason about — and to type.

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
> **Tripwire** Notice we test `g[r][c] === 0`, never `if (g[r][c])`. After transpile, **Lua treats `0` as truthy** — an empty cell would read as "occupied." Always compare explicitly. This is the single most common silent bug crossing TS to Lua.

This module is a **shared singleton**: every `import` lowers to a cached `require`, so the board and any future UI read the same functions. State that belongs to one playthrough we'll keep on the script's `self` instead — more on that split in Step 6.

## 04 — Define the tetrominoes

Each piece is four cells plus a color. We store every cell as a `[col, row]` offset from a **pivot** at `[0, 0]` — the point the piece spins around. `row` grows downward, matching how we index the grid. The pivot itself is usually one of the four cells, so most shapes include `[0, 0]`.

### How a single shape is built

Read offsets as "relative to the pivot." The T-piece in its spawn orientation is the pivot, one cell left, one cell right, and one cell below:

```text
// offsets:  [0,0]  [-1,0]  [1,0]  [0,1]
//           pivot  left    right  below

   -1   0  +1     ← col offset
0   ▓   ▓   ▓      [-1,0] [0,0] [1,0]
+1      ▓          [0,1]
```

### How rotations are derived

Here's the one piece of geometry worth knowing. To rotate any offset 90° **clockwise** around the pivot, swap the coordinates and negate the new column: `[c, r] → [-r, c]`. Apply it four times and you cycle back to the start. So we don't hand-invent rotations — we compute them from one base shape:

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
> **Why this works** `[c,r] → [-r,c]` is the standard 2D rotation matrix for +90° specialized to integers. Because the pivot is the origin `[0,0]`, it stays fixed and the other three cells swing around it. The **O** piece looks identical in all four states (a square is symmetric), and **S/Z/I** visually only have two distinct states — but generating four for every piece keeps the indexing uniform, so rotation is always `(rot + 1) % 4` with no per-piece special cases.

### The seven base shapes

That leaves exactly one thing to author by hand: the spawn shape of each piece. Everything else is computed. The color index (1–7) matches the `TINTS` table we'll build in Step 5.

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
> **Tripwire** Use Defold's `math.random`, not `Math.random()` — the JS standard library mostly doesn't survive the transpile, so reach for the engine's `math`, `os`, and `json` modules. Also note `cellsAt`: it's the bridge between the abstract piece data and a concrete board position, and every movement check in Step 7 calls it.

## 05 — Render the board with one factory

Here's the central trick: we don't create a sprite per cell by hand. The factory stamps out `COLS × ROWS` block instances once at startup; from then on we only change their **tint** and **visibility** to reflect the model.

**`src/board.ts`** · excerpt

```ts
import { defineScript, type Hash } from "@defold-typescript/types";
import { COLS, ROWS } from "./grid";

const CELL = 28; // pixels per block

// Seven tints, indexed by Cell color (1..7). Index 0 unused.
const TINTS = [
  vmath.vector4(0,0,0,0),          // 0 → transparent (empty)
  vmath.vector4(0.18,0.83,0.83,1),   // 1 I cyan
  vmath.vector4(0.97,0.82,0.22,1),   // 2 O yellow
  vmath.vector4(0.69,0.29,0.94,1),   // 3 T purple
  vmath.vector4(0.27,0.82,0.38,1),   // 4 S green
  vmath.vector4(0.94,0.26,0.35,1),   // 5 Z red
  vmath.vector4(0.31,0.48,0.94,1),   // 6 J blue
  vmath.vector4(0.94,0.56,0.23,1),   // 7 L orange
];

function spawnCells(): Hash[][] {
  const ids: Hash[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Hash[] = [];
    for (let c = 0; c < COLS; c++) {
      const pos = vmath.vector3(c * CELL, (ROWS - 1 - r) * CELL, 0);
      const id = factory.create("#blockfactory", pos);
      row.push(id);
    }
    ids.push(row);
  }
  return ids;
}

// Paint one cell: set its sprite tint from the model value.
function paint(id: Hash, value: number) {
  const url = msg.url(undefined, id, "sprite");
  go.set(url, "tint", TINTS[value]);
}
```

The model-to-screen mapping is the whole renderer: walk the grid each frame, `paint` each cell with its color's tint, and an empty cell (`0`) paints transparent. Row `0` is the top of the board, so we flip `r` against `ROWS` when computing the y-position, since Defold's y-axis points up.

> [!NOTE]
> **Why one factory** 200 sprites sounds heavy but is trivial for Defold, and tinting an existing sprite is far cheaper than creating/deleting objects every time a piece moves. Spawn once, mutate forever.

## 06 — Gravity and the game loop

Tetris runs on a clock: every `fall` seconds, the active piece drops one row. We accumulate `dt` in `update` and step the piece when the accumulator crosses the threshold. All of this is per-playthrough state, so it lives on `self` — typed once from `init`'s return.

**`src/board.ts`** · the script

```ts
export default defineScript({
  init() {
    msg.post(".", "acquire_input_focus"); // or no input fires
    const cells = spawnCells();
    return {
      cells,                       // Hash[][] sprite handles
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
    };
  },

  update(self, dt) {
    if (self.over) return;
    self.timer += dt;
    if (self.timer >= self.fall) {
      self.timer = 0;
      stepDown(self); // move down, or lock if blocked
    }
    redraw(self);    // model → tints, every frame
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
> **State tiers** Three homes, used on purpose: **`self`** for this playthrough's board, piece, and timer; the **shared modules** (`grid.ts`, `pieces.ts`) for stateless logic and the 7-bag; nothing global. Match each piece of state to the narrowest tier that can hold it.

## 07 — Input and movement

Bind keys in **game.project → Input → Game Binding** (the editor's input bindings file): map Left/Right/Down/Up to actions named `left`, `right`, `soft_drop`, `rotate`. The `on_input` hook (shown in the full script in Step 6) dispatches each one — but first, pre-hash every action id once at module scope so we compare hash-to-hash:

**`src/board.ts`** · input ids

```ts
// Module scope: hashed once, shared by the whole script.
const LEFT = hash("left");
const RIGHT = hash("right");
const SOFT = hash("soft_drop");
const ROTATE = hash("rotate");
```

Now the three helpers those calls reference. They share one idea: **never mutate the active piece until you've checked the target position is legal.** Compute where the piece _would_ land, test every cell against the model, and only commit if all four are free.

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
> **Tripwire** `action_id` arrives **pre-hashed**, exactly like message ids. Comparing it to a string literal (`action_id === "left"`) never matches at runtime — and under these typings it won't even compile. Hash once, compare hash-to-hash.

> [!NOTE]
> **Wall kicks** Real Tetris uses the full SRS kick tables (five candidate offsets per rotation). The three-candidate version here — in place, one left, one right — is enough to stop a rotation jamming against a wall without the complexity. Swap in the full tables later if you want spin tricks.

Because all four helpers test against the `grid.ts` model and never touch a sprite, every movement is "just data" — which is exactly why we kept that module engine-free. The renderer in Step 5 reflects the result _after_ the model changes.

## 08 — Locking and line clears

When gravity can't move the piece down, it **locks**: its four cells become permanent grid values. Then we scan for full rows, remove them, and drop everything above down.

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
> **Data structures** `splice`/`unshift`/`push` all work — TypeScript arrays lower to Lua tables with the toolchain's array helpers. They carry a tiny runtime cost but are exactly right here. (Regex and `BigInt` are the notable things that _don't_ survive, if you reach for them later.)

### Locking, and the gravity step that triggers it

Back in `board.ts`, gravity tries to move the piece down one row. If it can't, the piece has landed: we stamp its cells into the grid, clear any full lines, and spawn the next piece. `stepDown` is the function the game loop in Step 6 called.

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
> **Why r ≥ 0** A piece can lock while part of it is still above the visible board (row `< 0`). We skip those cells when stamping — writing to `grid[-1]` would error. If _any_ visible cell of the next spawn is already filled, that's game over, which `onLocked` checks via `canPlace`.

### Drawing the model: the one render function

Everything above mutates pure data. `redraw` — called every frame from `update` — is the single place that pushes the model onto the screen. It paints every locked cell, then paints the active piece on top, then blanks anything stale.

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

  // 3. Push the composed frame to the sprite tints.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      paint(self.cells[r][c], frame[r][c]);
    }
  }
}
```

> [!NOTE]
> **Locked vs falling** The model (`self.grid`) only ever holds _locked_ blocks — the falling piece lives in `self.piece/rot/px/py` and is composited on top at draw time. Keeping the two separate is what makes movement trivial: moving the active piece never touches the grid, so there's nothing to "erase" — the next `redraw` simply composes a fresh frame.

## 09 — Score, levels, and game over

Award points by lines cleared at once (the classic 40/100/300/1200 × level), speed up as lines accumulate, and end the run when a freshly spawned piece overlaps existing blocks. `onLocked` is the function `stepDown` called the moment a piece locks:

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
  // if it can't even be placed, the stack reached the top
  if (!canPlace(self)) {
    self.over = true;
    msg.post("/hud#hud", "game_over");
  }
}
```

### Hard drop — the satisfying one

Soft drop (one row per press) is in already. A **hard drop** slams the piece to the bottom instantly and locks it. It's a five-line addition: keep moving down until you can't, award a point per cell dropped, then lock. Bind a key to `hard_drop` and dispatch it in `on_input`:

**`src/board.ts`** · hard drop

```ts
const HARD = hash("hard_drop");

function hardDrop(self): void {
  while (tryMove(self, 0, 1)) self.score += 1;
  self.timer = self.fall; // force a lock on the next update tick
}

// add to the on_input chain:
// else if (action_id === HARD) hardDrop(self);
```

### The HUD: a separate GUI script

Score and level live on a GUI scene, not the board. Add a **.gui** file with two text nodes (`score`, `level`) plus a hidden `gameover` node, then drive it from a `.gui_script`. Remember: a GUI script is its _own file_ with `defineGuiScript` — never two factory calls in one file.

**`src/hud.ts`** · separate file

```ts
import { defineGuiScript } from "@defold-typescript/types/gui-script";

export default defineGuiScript({
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

And the board's side of the conversation — one helper that posts the current numbers. Because `msg.post` is asynchronous (delivered next frame), the HUD always shows last frame's values, which for a score display is imperceptible:

**`src/board.ts`** · postHud

```ts
function postHud(self): void {
  msg.post("/hud#hud", "set_hud", { score: self.score, level: self.level });
}
// call postHud(self) once in init (after the return is built via a
// follow-up) and again whenever score/level change.
```

> [!NOTE]
> **Editor step** Create the HUD object: in `main.collection`, add a **GUI** component to a new game object with **Id** `hud`, point it at your `.gui` file, and attach `hud.ts.gui_script`. Its message url becomes `/hud#hud` — exactly what the board posts to.

## 10 — Run it, then ship it

With `watch` running, hit `Project → Build` (or `Cmd/Ctrl`+`B`) in the Defold editor. The engine loads `main.collection`, your board script spawns 200 blocks, and gravity starts ticking.

1. If the board is invisible, check the **block.go** sprite has a valid **Default Animation** and the factory **Prototype** points at `/main/block.go`.
2. If keys do nothing, confirm the input bindings exist **and** the script posts `acquire_input_focus` in `init`.
3. If cells read as occupied when empty, you've hit the `0`-is-truthy trap — find the bare `if (cell)` and make it `=== 0`.

To ship, use `Project → Bundle` for your target platform. The bundle contains only Lua — your TypeScript was a build-time convenience, and players never know it was there.

## 11 — Complete source

All three TypeScript files, end to end. Drop these into `src/`, wire the scene per Step 2, and you have a playable game — gravity, the seven pieces with real rotation, wall-kicks, soft and hard drop, line clears, scoring, levels, and game over.

These are the buildable files from `docs/examples/tetris-tutorial/src/`, so they carry two adaptations the teaching excerpts above elided: `board.ts` declares a typed **`BoardSelf`** interface so the standalone movement and scoring helpers can annotate `self` (a bare `self` parameter is `noImplicitAny`-illegal), and the HUD imports **`defineGuiScript` from `@defold-typescript/types`** (the main entry). Nothing else differs from the walkthrough.

> [!NOTE]
> **Verified** This logic was simulated through thousands of locked pieces: every rotation state is a well-formed four-cell shape, no out-of-range color ever reaches the grid, line clears drop the residual stack correctly, and a full game runs to a clean game-over. The `.gui`/`.gui_script` for the HUD is the one piece you build in the editor (Step 9).

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

The script itself: rendering via the factory, all movement checked against the model, locking, scoring, drawing, and the lifecycle hooks. Everything above is consumed here.

**`src/board.ts`** · complete

```ts
import type { Hash } from "@defold-typescript/types";
import { defineScript } from "@defold-typescript/types";
import { COLS, clearLines, emptyGrid, type Grid, isFree, ROWS } from "./grid";
import { cellsAt, nextPieceIndex, PIECES } from "./pieces";

const CELL = 28; // pixels per block
const LINE_SCORE = [0, 40, 100, 300, 1200];

// Input ids, hashed once at module scope.
const LEFT = hash("left");
const RIGHT = hash("right");
const SOFT = hash("soft_drop");
const ROTATE = hash("rotate");
const HARD = hash("hard_drop");

// Seven tints, indexed by color (1..7); index 0 is transparent.
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

// The script state, named once so the standalone movement/scoring helpers can
// annotate `self` (a bare `self` parameter is `noImplicitAny`-illegal). `init`
// returns exactly this shape, so `update`/`on_input` see it without a second
// declaration.
interface BoardSelf {
  cells: Hash[][];
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
}

function spawnCells(): Hash[][] {
  const ids: Hash[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Hash[] = [];
    for (let c = 0; c < COLS; c++) {
      const pos = vmath.vector3(c * CELL, (ROWS - 1 - r) * CELL, 0);
      row.push(factory.create("#blockfactory", pos));
    }
    ids.push(row);
  }
  return ids;
}

function paint(id: Hash, value: number): void {
  go.set(msg.url(msg.url().socket, id, "sprite"), "tint", TINTS[value]);
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
  msg.post("/hud#hud", "set_hud", { score: self.score, level: self.level });
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
    msg.post("/hud#hud", "game_over");
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
    for (let c = 0; c < COLS; c++) paint(self.cells[r][c], frame[r][c]);
  }
}

export default defineScript({
  init(): BoardSelf {
    msg.post(".", "acquire_input_focus");
    const cells = spawnCells();
    return {
      cells,
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
});
```

> [!NOTE]
> **What's left to you** Three things make this fully yours: the **1×1 white sprite atlas** for `block.go`, the **input bindings** (`left`/`right`/`soft_drop`/`rotate`/`hard_drop`), and the **HUD .gui scene** with `score`, `level`, and `gameover` nodes plus `hud.ts`. Each is a Step-2-style editor task — no more TypeScript needed.

## Toolchain tripwires, collected

Every TS-to-Lua sharp edge this build touches, in one place:

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| Empty cell reads as occupied | `0` is truthy in Lua | Compare `=== 0` explicitly |
| Keys do nothing | `action_id` is a hash, not a string | Pre-hash ids, compare hash-to-hash |
| `Math.random` undefined | JS stdlib doesn't transpile | Use engine `math.random` |
| Piece won't negate / vector errors | `-v3` infers `number` | Use `v.unm()`; arithmetic is method-form |
| Two scripts in one file | One factory export per file | Split `.script` and `.gui_script` |
| `await` hangs forever | No event loop | Bridge via `timer.delay` / the timers polyfill |
