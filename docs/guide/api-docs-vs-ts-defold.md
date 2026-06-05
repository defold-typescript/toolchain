# API docs vs. ts-defold-types

How the JSDoc that `@defold-typescript/types` emits compares with the incumbent
hand-and-script-maintained [thinknathan/ts-defold-types](https://github.com/thinknathan/ts-defold-types).
Both surfaces derive from the **same** Defold reference docs, so symbol coverage
is parity by construction; this page records where our emitted documentation is
strictly cleaner, and the one place theirs is arguably cleaner.

The comparison is backed by a machine check, `packages/types/test/api-doc-parity.test.ts`,
which parses a pinned snapshot of their `index.d.ts` and our `generated/*.d.ts`
with one shared extractor and fails if we document **less** than they do for any
shared symbol. It compares *documentation*, not type fidelity (branded vs. flat
types are out of scope here).

## Dimension comparison

| Dimension | ts-defold-types | `@defold-typescript/types` |
| --- | --- | --- |
| Description coverage | Most functions/constants carry a summary | Same source, same coverage; every shared symbol we keep documents at least as well |
| `@param` style | `@param <name> <desc>` (no separator) | `@param <name> - <desc>` (dash-separated, the JSDoc convention editors render as a definition list) |
| Description markup | Raw ref-doc text | `htmlToDocText` converts HTML to Markdown: `<code>`→`` `code` ``, `<ul><li>`→`- ` bullets, `<a>`→link text, entities decoded |
| Multi-line `@param`/`@returns` | Continuation lines escape the ` * ` grid | Every continuation line carries ` * ` (see [the well-formedness gate](#well-formedness)) |
| `@returns` | One flat `@returns` even for multi-value returns | One `@returns` for single returns; multi-value returns are typed as a `LuaMultiReturn` tuple that names every value (see [exceptions](#multi-return-functions)) |
| `@example` | `@example <prose>` then a fenced block | `@example` then a fenced ```` ```lua ```` block on its own lines |
| Constant types | `const X: number` | Branded: `number & { readonly __brand: "ns.X" }` — distinct constants stay nominally distinct |

### Description markup, concretely

ts-defold-types:

```
 * @param options A table with the following fields: <ul><li><code>count</code> ...
```

ours:

```
 * @param options - A table with the following fields:
 * - `count` ...
```

<a id="well-formedness"></a>
### Well-formedness

A multi-line `@param` doc (a ref-doc `<li>` list becomes embedded newlines) is
re-prefixed line by line so it stays inside the JSDoc ` * ` grid. The permanent
guard for this is the self-contained `packages/types/test/doc-comment-wellformed.test.ts`
gate over the committed `generated/*.d.ts` — it does not depend on the pinned
fixture below.

## Coverage-test result

Against the pinned snapshot (Defold stable 1.12.4):

- **762 shared symbols** — for every one, our docs are a superset: if theirs has
  a description, a `@param`, a `@returns`, or an `@example`, ours does too.
- **135 theirs-only symbols** — reported as coverage notes, not failures. These
  are surface-shape differences, not dropped docs: top-level globals
  (`pprint`, `hash`, …) and modules our surface structures differently
  (`b2d.body.*`, `bit.*`, some `socket` overloads). They live elsewhere or under
  a different namespace path in our split, branded/versioned surface.

<a id="multi-return-functions"></a>
### Multi-return functions

For **16** functions whose Lua API returns several values (e.g.
`gui.get_type`, `gui.new_texture`, `buffer.get_metadata`,
`collectionproxy.set_collection`, `sound.get_rms`, `window.get_size`), theirs
collapses the return to one `@returns` line. Ours instead types the return as a
`LuaMultiReturn<[…]>` tuple, so each returned value is named in the type itself
rather than in prose. The coverage test treats these as documented-by-type, not
as a `@returns` regression.

## Where they are arguably cleaner

One deliberate trade-off runs the other way. Our `@example` block extracts the
ref-doc `examples` field verbatim into a single ```` ```lua ```` fence — including
the example's leading prose sentence (e.g. *"How to create and initialize a
buffer"*), which then sits **inside** the code fence and is not valid Lua.
ts-defold-types keeps the fence pure by putting that prose on the `@example`
line itself.

This is the documented slice-4 decision: the ref-doc ships the prose and the code
as one `examples` HTML blob, and splitting prose from code reliably is brittle, so
we keep the sample intact and accept a prose line inside the fence. Hover still
renders the sample; the prose reads as a leading comment. Reversing this is
explicitly out of scope for the parity work.
