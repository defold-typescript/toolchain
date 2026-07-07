# defold-typescript tutorial

An interactive slide-style walk-through of building a 2D platformer in
TypeScript, mirroring the structure of the
[Defold platformer tutorial](https://defold.com/tutorials/platformer/) but
written against `@defold-typescript/types`. The output is a single
self-contained HTML file you can open in any modern browser.

The tutorial is self-contained: every code sample shown in the deck lives
under `docs/tutorial/` (the canonical source at `src/player.ts`, with
slices in `snippets/`). It does not depend on any other project in this
repo.

## What's here

```
docs/tutorial/
├── README.md          # this file
├── package.json       # bun scripts: build, verify
├── build.ts           # bun + shiki → dist/index.html
├── verify.ts          # checks snippets match the canonical src/player.ts
├── slides.ts          # the slide manifest (content + structure)
├── template.html.tmpl # the HTML/CSS/JS scaffold with placeholders
├── src/               # the canonical TypeScript source the deck teaches
│   └── player.ts
├── snippets/          # slices of src/player.ts, one per concept
│   ├── 01-tweaks.ts_
│   ├── 02-hash-ids.ts_
│   ├── 03-create-player-self.ts_
│   ├── 04-play-animation.ts_
│   ├── 05-update-animations.ts_
│   ├── 06-handle-obstacle-contact.ts_
│   ├── 07-jump.ts_
│   ├── 08-define-script.ts_
│   └── 09-full-player.ts_
└── dist/              # generated; gitignored
    └── index.html
```

## Build and verify

From this directory:

```sh
bun install            # one-time
bun run build          # regenerates dist/index.html
bun run verify         # checks snippets match src/player.ts
```

`build` runs `verify` first and fails the build if any snippet has drifted
from `src/player.ts` — see "Why the snippets live in their own files"
below.

To preview the result, open `dist/index.html` in a browser, or:

```sh
open dist/index.html   # macOS
xdg-open dist/index.html   # Linux
```

## Using the deck

| Key | Action |
| --- | --- |
| `→` / `Space` / `PageDown` | Next slide |
| `←` / `PageUp` | Previous slide |
| `Home` / `End` | First / last slide |
| `t` | Toggle table of contents |
| `?` | Keyboard help |
| `Esc` | Close panels |

Each slide is a section in `slides.ts`. The body is a flat list of elements
that render top-to-bottom: paragraphs, bullet lists, numbered lists, images,
code snippets, and side-notes. To add a new slide, append an entry to the
`slides` array — the build will pick it up and renumber the index.

## Why the snippets live in their own files

Every code sample shown in the deck is a verbatim copy of a region from
`docs/tutorial/src/player.ts`. The split buys two things:

1. **Each snippet is a real, type-checked artifact.** Copying out of
   context risks typos that wouldn't survive a `tsc --noEmit`. The
   snippet files are checked into the repo, so any future change to
   `src/player.ts` that breaks a snippet is caught by `bun run verify`
   and fails the build.
2. **The HTML always reflects the canonical source.** Re-running `bun run
   build` re-extracts, re-highlights with [Shiki](https://shiki.style),
   and re-embeds. The slides manifest references snippets by name; if
   `src/player.ts` is refactored, you re-extract the matching region and
   the next build pulls it in.

To update a snippet, edit the corresponding `.ts_` file under
`snippets/`. The `verify` step ensures the new content is still a
contiguous substring of `src/player.ts` (whitespace-normalized) — a
copy-paste from the source is guaranteed to pass; a hand-edit needs to
land in the source first.

### Why the `.ts_` extension

The snippets are slices of `src/player.ts` — they reference names defined
elsewhere in that file and don't compile standalone. Naming them with the
trailing-underscore `.ts_` extension signals that: TypeScript, Biome,
and the editor leave them alone, so the linter doesn't flag every
`max_speed` as an unused variable. The trailing `_` mirrors the
unused-variable convention Biome already uses, but at the file level —
every file in `snippets/` is, by design, an incomplete view of one
larger file.

## Image sources

The diagrams (velocity integration, contact normals, the Defold editor,
etc.) link to `https://defold.com/tutorials/images/platformer/...` on
purpose — they are part of the original Defold tutorial and not
vendored. The HTML is otherwise fully self-contained: a single file you
can email, archive, or open from a USB drive, as long as the viewer has
internet.

## Conventions

- `slides.ts` is the source of truth for the deck's content. The
  manifest is type-checked by `tsc --noEmit` (`bunx tsc --noEmit` in this
  dir).
- `src/player.ts` is the source of truth for the code. The snippets
  under `snippets/` are slices of it; `verify.ts` enforces that.
- Snippet filenames are zero-padded (`01-…`, `02-…`) so the manifest
  order matches the filesystem sort. Adding a new one in the middle of
  the deck means renaming the later files to keep them sequential.
- Slide IDs are the kebab-case section anchors from the original
  tutorial (`platformer`, `collision-detection`, `movement`, …). The TOC
  and keyboard navigation use them; change the `id` field and the deck
  deep-link changes with it.
