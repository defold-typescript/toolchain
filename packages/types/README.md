# @defold-typescript/types

TypeScript types for the [Defold](https://defold.com/) engine's Lua APIs — ambient
namespace declarations (`go`, `gui`, `msg`, `vmath`, …) plus per-script-kind API
surfaces, generated from Defold's reference docs.

```sh
npm i -D @defold-typescript/types
```

Most users get these wired in automatically by the
[`defold-typescript`](https://www.npmjs.com/package/@defold-typescript/cli) CLI
(`bunx @defold-typescript/cli init`), which points `tsconfig.json` at the right surface.

See the repository [README](https://github.com/defold-typescript/toolchain#readme)
and [`docs/guide/`](https://github.com/defold-typescript/toolchain/tree/main/docs/guide)
for the full workflow.

## License

MIT
