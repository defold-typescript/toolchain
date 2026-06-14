# @defold-typescript/tstl-plugin

A TypeScript language-service plugin for [Defold](https://defold.com/) projects —
surfaces TypeScript-to-Lua transpile diagnostics live in the editor as advisory
suggestions, so unsupported constructs squiggle as you type without ever failing
`tsc --noEmit`.

```sh
npm i -D @defold-typescript/tstl-plugin
```

Most users get this wired in automatically by the
[`defold-typescript`](https://www.npmjs.com/package/@defold-typescript/cli) CLI
(`bunx @defold-typescript/cli init`), which adds the plugin to `tsconfig.json`'s
`plugins` array.

See the repository [README](https://github.com/defold-typescript/toolchain#readme)
and [`docs/guide/`](https://github.com/defold-typescript/toolchain/tree/main/docs/guide)
for the full workflow.

## License

MIT
