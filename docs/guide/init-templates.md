# Starter templates

`defold-typescript init` synthesizes a new Defold project from a starter template. Pick one with `--template <name>`:

```sh
bunx @defold-typescript/cli@latest init my-game --template minimal
```

## Available templates

- **`default`** — the opinionated layout you get when you omit `--template`: a `game.project`, a `main/main.collection`, and a `src/main.ts` whose `init` returns a small `vmath.vector3` example state.
- **`minimal`** — the same project layout with an empty-state `src/main.ts` (a `defineScript` whose `init` returns `{}`), for starting from a blank script.

Both templates differ only in the synthesized entry script; the shared TypeScript surface (`tsconfig.json`, `package.json`, `.gitignore`, `biome.json`, `mise.toml`, and the `.vscode/` files) is identical.

## Behavior

- Omitting `--template` is equivalent to `--template default`.
- An unknown name fails fast and lists the valid templates:

  ```
  defold-typescript init: unknown template "foo". Valid templates: default, minimal.
  ```

- `--template` applies only when **creating a new project**. Running `init` inside a folder that already has a `game.project` (the [add-TypeScript](./add-typescript.md) flow) adds only the TypeScript surface, so passing a non-default `--template` there is rejected — there is nothing to synthesize.
