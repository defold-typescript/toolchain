<p align="center">
  <img src="docs/logo-ver-classic.png" alt="defold-typescript logo" width="128" height="128">
</p>

# defold-typescript

[![npm](https://img.shields.io/npm/v/@defold-typescript/cli)](https://www.npmjs.com/package/@defold-typescript/cli)
[![CI](https://img.shields.io/github/actions/workflow/status/defold-typescript/toolchain/ci.yml?branch=main)](https://github.com/defold-typescript/toolchain/actions/workflows/ci.yml)

TypeScript for [Defold](https://defold.com/), transpiled to Lua. A modern, agent-friendly successor to the [ts-defold](https://github.com/ts-defold) family of repositories.

## Why a new project

[ts-defold](https://github.com/ts-defold) — by [@thinginitself](https://github.com/thinginitself) and contributors — proved that authoring Defold games in TypeScript is viable. This repo restarts that effort with a tighter, monorepo-first layout so we can:

- **Add agent (clanker) support** — first-class instructions and tooling for AI agents driving the toolchain, type generation, and game code.
- **Move faster** — single repo, single test runner, single dependency graph. No coordination across five repos to ship one change.
- **Modernize the toolchain** — Bun as runtime, package manager, and test runner; ESM throughout; TypeScript 5.x with strict settings.
- **Lint with Biome** — replace the ESLint + Prettier combo with a single fast tool.
- **Speed up testing** — Bun's built-in test runner instead of Jest/Mocha; co-located unit tests with millisecond-level feedback.

Credit to the original ts-defold maintainers; this project stands on their work and the broader [TypeScriptToLua](https://github.com/TypeScriptToLua/TypeScriptToLua) ecosystem.

## Repository layout

```
defold-typescript/
├── packages/
│   ├── types/        Defold API typings (script lifecycle, message system, GUI, etc.)
│   ├── transpiler/   TS-to-Lua build pipeline tuned for Defold's runtime
│   └── cli/          End-user CLI: scaffold, build, watch
├── docs/
│   └── guide/        End-user documentation — getting started, vector math, TypeScript gotchas
└── biome.json, tsconfig.json, package.json (workspace root)
```

## Prerequisites

- [Bun](https://bun.sh/) `>= 1.3`
- Defold editor (for running the resulting games)

## Getting started

```sh
bun install
bun run lint
bun test
```

## Documentation

End-user documentation lives in [docs/guide/README.md](docs/guide/README.md): getting started with `bunx @defold-typescript/cli init`/`build`/`watch`, the typed vector-math surface, and a growing catalog of TypeScript-in-Defold gotchas (starting with the unary-minus quirk on `Vector3`/`Vector4`).

## Tutorial

An interactive slide-style walk-through of building a platformer in TypeScript lives at [docs/tutorial/](docs/tutorial/). It mirrors the [Defold platformer tutorial](https://defold.com/tutorials/platformer/) but with Lua replaced by `defineScript`, method-based vector math, and `isMessage`-narrowed payloads. Build the deck with `bun run build` from the tutorial directory.

## Example

A runnable Defold project that uses the same patterns is at [docs/examples/platformer/](docs/examples/platformer/).

## License

[MIT](LICENSE) — matching the ts-defold ecosystem.

## Acknowledgements

- [ts-defold](https://github.com/ts-defold) — the original project this repo aims to succeed
- [TypeScriptToLua](https://github.com/TypeScriptToLua/TypeScriptToLua) — the transpiler we build on
- [Defold](https://defold.com/) — the engine
