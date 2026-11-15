---
toc-title: Test with Bun
---
# Test with Bun

Game logic written in TypeScript can be unit-tested with `bun test`, with no
Defold engine running. A test sits in one of two places, chosen by what it
imports, and `build` never compiles either kind to Lua.

## Where a test goes

| The test imports | Put it | Type-checked by |
| --- | --- | --- |
| `bun:test` and game code only | next to the module it tests, such as `src/score.test.ts` | the root `tsconfig.json` |
| anything from Bun's runtime: `node:*`, `Bun`, `console`, `process`, or a module outside the source roots such as a tool under `scripts/` | `src/test/` | `src/test/tsconfig.json` |

A test next to the code that reports a type-check error naming `node:fs`,
`console` or `process`, or `TS6059` (a file outside `rootDir`), belongs in
`src/test/`.

## A test next to the code

`build`, `watch` and the editor plugin skip every file `bun test` runs:
`*.test.ts`, `*_test.ts`, `*.spec.ts` and `*_spec.ts`. Such a file writes no
Lua, joins no program the build type-checks, and gets no build diagnostic in the
editor.

Start the file with `/// <reference types="bun-types/test" />`. The line loads
only Bun's test declarations, the `bun:test` module, so the project's own
`tsc --noEmit` checks the test while game code keeps rejecting `setTimeout`,
`process` and `Bun`. `bun-types` is in a scaffolded project's `devDependencies`
at an exact version. Once one file carries the line, `bun:test` is declared for
the whole program; give every test the line anyway, so each still type-checks
when it is the only test left.

A plain module, `src/score.ts`, and its test, `src/score.test.ts`:

```ts title="score.ts"
export function comboScore(base: number, combo: number): number {
  const multiplier = combo > 5 ? 5 : combo;
  return multiplier < 2 ? base : base * multiplier;
}
```

```ts title="score.test.ts"
/// <reference types="bun-types/test" />
import { expect, test } from "bun:test";
import { comboScore } from "./score";

test("a combo multiplies the score, up to five times", () => {
  expect(comboScore(10, 1)).toBe(10);
  expect(comboScore(10, 3)).toBe(30);
  expect(comboScore(10, 9)).toBe(50);
});
```

`build` compiles `src/score.ts` to `src/score.lua` and leaves the test out.

## A test in `src/test/`

[`init`](./init.md#two-modes) and [`upgrade`](./upgrade.md) scaffold `src/test/`
for tests, and the helpers they share, that need Bun's runtime. `build`, `watch`
and the build's type pass skip every file under it, and both commands add
`src/test` to the root `exclude` unless an entry already names the folder, so
nothing in it reaches game code.

The folder holds two scaffolded files:

- `src/test/env.d.ts` references `bun-types`, all of Bun's types (`bun:test`,
  `node:*`, `Bun`, `process`), for this folder's program only.
- `src/test/tsconfig.json` layers that over the root config:

| Setting | Why |
| --- | --- |
| `extends: "../../tsconfig.json"` | A test sees the game's Defold types, `.d.ts` declarations and pinned surface. |
| `outDir: null` | When `outDir` is set, TypeScript 6 takes the config's own folder as `rootDir`, and every `src/` file a test imports fails with `TS6059`. |
| `noEmit: true` | Bun runs the TypeScript directly; nothing is written. |
| `plugins: []` | The editor plugin reports build diagnostics, and nothing here is built. |
| `resolveJsonModule: true` | A test can import a JSON file. |
| no `types` | The tests follow whatever surface the root config pins. |
| `include`: `**/*.ts` plus each root `include` entry, rebased onto `../../` | The program holds the game's `.d.ts` files, and `scene-addresses.d.ts`, which imports script modules. |
| `exclude`: the root's other entries, rebased the same way | An inherited `exclude` would contain `src/test` and leave out the folder's own files. |

### When `src/test/` already exists

`init` and `upgrade` keep an existing `src/test/env.d.ts` and write it only when
it is missing. They bring an existing `src/test/tsconfig.json` onto the table
above, editing it in place so its comments and layout stay, and print one warning
for the file that names what they did:

- A config whose `extends`, or one entry of an `extends` list, is not the root
  `tsconfig.json` is yours alone: nothing in it changes, and the warning says so.
- A missing setting from the table is added. A value you set is kept, and is
  named only when it differs from the scaffold's.
- `include` and `exclude` are compared by the files TypeScript selects with
  them, against the files the lists above select, on disk when the command runs.
  The same files leave both lists as you wrote them; other files replace both,
  and the warning shows each list before and after. This is what keeps the test
  program in step after you change the root `include` or `exclude`: run `upgrade`
  or `init --force`.
- Your own `types`, `typeRoots` or `paths` stay, and the warning notes that they
  replace the root config's game types for the tests.

Adding `src/test` to an existing root `exclude` prints a warning for
`tsconfig.json` too.

### Bun and old test folders

The same commands check the installed Bun against `bun-types`. A Bun older than
the version the CLI pins is named, with `bun upgrade` to update it; a newer one
never is. An exact `bun-types` pin in your `package.json` that differs from the
installed Bun is named whether that Bun is older or newer, since the tests are
then type-checked against another Bun than the one that runs them; a range or
`latest` is not compared, and the pin is never changed. A `test/` or `tests/`
folder at the project root holding Bun tests is named as well: `bun test` still
runs those, but no `tsconfig.json` type-checks them, so move each one next to its
module or into `src/test/`.

## Run and check

```sh
bun test
bunx tsc --noEmit
bunx tsc --noEmit -p src/test/tsconfig.json
```

`bun test` from the project root finds the tests in both places. The first
`tsc` checks the game and every test next to its module (the scaffolded
`defold-typescript:typecheck` [mise task](./editor-setup.md#opinionated-misetoml)
runs it); the second checks `src/test/`. Run all three before a commit and in CI.

## Stub the engine

The engine's modules (`vmath`, `msg`, `go`, `hash`) and Lua's standard library
(`math`, `string`, `table`) do not exist under Bun. A test defines on
`globalThis` only the calls the code under test reaches, before that code runs:

```ts title="spawn.ts"
export function spawnPoint(lane: number): Vector3 {
  return vmath.vector3(lane * 32, 0, 0);
}
```

```ts title="spawn.test.ts"
/// <reference types="bun-types/test" />
import { expect, test } from "bun:test";
import { spawnPoint } from "./spawn";

Object.assign(globalThis, {
  vmath: { vector3: (x: number, y: number, z: number) => ({ x, y, z }) },
});

test("each lane spawns 32 units further right", () => {
  expect(spawnPoint(2).x).toBe(64);
});
```

A module that calls the engine as it loads, at its top level, needs the stub
before its import runs: put the stub in a preload file under `src/test/` and run
`bun test --preload ./src/test/engine.ts`.

## Practices

- **Keep game logic in engine-free modules.** A script's lifecycle needs the
  engine; a plain module of functions does not. Put the rules (scoring,
  inventory, pathing) in plain modules the script imports, and test those.
- **State machines and entity worlds run under Bun.**
  `@defold-typescript/types/hsm` and `@defold-typescript/types/ecs` need no
  engine: see [Test a machine with Bun](./state-machines.md#test-a-machine-with-bun)
  and [Test a world with Bun](./entity-systems.md#test-a-world-with-bun).
- **Stub only the engine calls the code under test reaches, before it runs**
  (see [Stub the engine](#stub-the-engine)).
- **Keep helpers that need Bun in `src/test/`.** A fixture loader that reads
  files with `node:fs` belongs there, and a test that imports it goes there too:
  importing it from a test next to the code pulls `node:fs` into the game
  program.
- **Keep Bun's globals out of the game program.** Never add `bun-types` to the
  root `types`, never start a test with `/// <reference types="bun-types" />`,
  and never put a Bun `.d.ts` anywhere under the source roots but `src/test/`:
  each one lets `process` and `Bun` type-check in code that runs in Lua.
- **Lint tests like any other source.** The scaffolded `biome.json` covers
  every `.ts` file under the source roots, tests in both places included.
