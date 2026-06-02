# @defold-typescript/types

TypeScript types for the [Defold](https://defold.com/) engine's Lua APIs — ambient
namespace declarations (`go`, `gui`, `msg`, `vmath`, …) plus per-script-kind API
surfaces, generated from Defold's reference docs.

```sh
npm i -D @defold-typescript/types
```

Most users get these wired in automatically by the
[`defold-typescript`](https://www.npmjs.com/package/@defold-typescript/cli) CLI
(`defold-typescript init`), which points `tsconfig.json` at the right surface.

See the repository [README](https://github.com/king8fisher/defold-typescript#readme)
and [`docs/guide/`](https://github.com/king8fisher/defold-typescript/tree/main/docs/guide)
for the full workflow.

## License

MIT
