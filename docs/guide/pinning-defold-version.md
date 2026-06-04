# Pinning the Defold API version

`@defold-typescript/types` ships the **latest/current** Defold API surface
pre-baked, and generates older versioned surfaces on demand. The default import
is always the current surface; opting into an older version generates that
version's surface on your machine and materializes it locally. Pinning a surface
makes the TypeScript compiler reject calls to engine functions that do not exist
in the Defold version you target, instead of letting them through to fail at
runtime.

## The default stays current

If you do nothing, you get the current surface — the same behaviour as before
versioning existed:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "types": ["@defold-typescript/types"]
  }
}
```

This is unchanged for existing projects. The default surface tracks the latest
generated API.

## Opting into a pinned surface

You do not pin a surface through a package subpath export. Versioned surfaces
are **not** shipped pre-baked in the npm package — only the current-stable
surface is. A non-current version's `.d.ts` are generated on your machine the
moment you pin it (from that version's Defold reference docs) and
**materialized** into a project-local `.defold-types/<version>/` faux `@types`
package that your `tsconfig.json` references.

You select the version with the `package.json` pin described below; the
toolchain resolves it, generates the matching surface, and repoints
`tsconfig.json` at the materialized package. A function that exists only on the
current surface is then a compile error against an older pin, while functions
shared across versions continue to type-check.

## Recording the project's Defold version

A Defold project pins a fixed engine version, but that version is not stored
anywhere in the project tree — not in `game.project`, not in build artifacts,
not in editor metadata. You declare it in `package.json` under the
`defold-typescript` namespace:

```jsonc
// package.json
{
  "defold-typescript": { "defold-version": "1.12.4" }
}
```

`defold-typescript init` seeds this key with the current-stable version when it
creates or augments a `package.json`, and leaves an existing pin untouched.

The active version resolves with this precedence:

1. `--defold-version <version>` on the command line (highest),
2. the `package.json` pin,
3. the current-stable default.

The resolved version is reported in `--json` output as `defoldVersion`, and the
surface it maps to is reported alongside it as `apiSurface`. The current-stable
version maps to the default surface (`apiSurface: "defold-1.12.4"`); a version with a
registered reference-doc target maps to `apiSurface: "defold-<version>"` (for
example `defold-1.9.8`); a version with no matching target reports
`apiSurface: null`.

## Materializing the pinned surface

`defold-typescript build` does not only report the surface — it **materializes**
it. The build writes a project-local `.defold-types/<surface>/` directory (a faux
`@types` package with its own `index.d.ts` and `package.json`), then repoints
`tsconfig.json` at it so exactly one surface is the active ambient type surface:

```jsonc
// tsconfig.json (rewritten by build)
{
  "compilerOptions": {
    "typeRoots": [".defold-types"],
    "types": ["defold-1.9.8"]
  }
}
```

How the surface is produced depends on the resolved version:

- **Current-stable** copies the pre-baked surface that ships in
  `@defold-typescript/types` into `.defold-types/defold-1.12.4/`. No network access.
- **A pinned non-current version** is generated **on the fly** from that
  version's Defold reference docs and written into
  `.defold-types/<version>/` (for example `.defold-types/defold-1.9.8/`). The
  reference docs are downloaded once on first use and cached, so later builds
  are offline. The generated faux package is self-contained: it carries its own
  `core-types.d.ts`, so the surface type-checks regardless of where the project
  lives. It also carries `engine-globals.d.ts` and side-effect imports it from
  the surface `index.d.ts`, so the engine types (`Vector3`, `Hash`, `Url`, …)
  are ambient globals — name them with no import, matching the namespace
  ergonomics (`vmath`, `go`, …).

The `.defold-types/` directory is generated output, so build adds it to the
project `.gitignore`. The materialized directory is reported in `--json` output
as `materializedSurface`. Re-running build is idempotent.

A single detected script kind narrows the pinned versioned surface exactly as it
narrows the default surface — `build` and `watch` drop the forbidden restricted
namespaces (`gui` for a render-script project, `render` for a gui-script
project, both for a plain `.script` project) from `.defold-types/<version>/`,
while a mixed or empty project keeps the full surface. See the per-kind API wall
in [script-lifecycle.md](script-lifecycle.md).

If a pinned version cannot be generated — an unknown version, or no network on
first use — the build does **not** fail. It reports `materializedSurface: null`,
warns on stderr, leaves `tsconfig.json` untouched, and exits `0`; the default
committed surface stays usable. Having Bun is enough to compile your project.
