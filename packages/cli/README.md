# defold-typescript

The end-user CLI for scaffolding and building [Defold](https://defold.com/)
projects written in TypeScript, transpiled to Lua.

```sh
bunx @defold-typescript/cli@latest init   # add TypeScript to a Defold project, or scaffold a new one
bun install                               # install the scaffolded devDependencies (types, biome)
bunx @defold-typescript/cli build         # transpile src/ to Lua alongside your Defold sources
bunx @defold-typescript/cli watch         # rebuild on change
```

Scaffold with the `@latest` tag — `init` writes your `@defold-typescript/types`
version pin, so a stale `bunx` cache would pin an older release. Run `bun install`
once after `init` to put the scaffolded dev dependencies on disk.

The package name is scoped (`@defold-typescript/cli`); `bunx defold-typescript`
without the scope resolves a different, nonexistent package. Install it to get
the shorter `defold-typescript` binary on your `PATH` and pin the version:

```sh
npm i -D @defold-typescript/cli   # then: bunx defold-typescript <command>
```

See the repository [README](https://github.com/defold-typescript/toolchain#readme)
and [`docs/guide/`](https://github.com/defold-typescript/toolchain/tree/main/docs/guide)
for the full workflow.

## License

MIT
