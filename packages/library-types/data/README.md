# Library data folders

Each folder here holds the library data of one data format. What a folder holds is
described in [the package README](../README.md#whats-inside).

## What the name means

A folder is named for the first CLI release that reads its format. `0.55.0/` is the
format CLI v0.55.0 introduced. It is not a version of the types, of any library, or
of the data inside it, and it does not change when that data does.

## Which folder a CLI reads

A CLI reads the highest folder at or below its own version, ignoring a prerelease
suffix. A CLI run from this repo reports version `0.0.0` and reads the newest folder.
`resolve`, `resolve --library-data` and the `library` commands all choose this way
(`selectDataFolder` in `packages/cli/src/library/data-folder.ts`).

So a folder serves a range of releases: from the version it is named for up to the
release before the next folder's name. While `0.55.0/` is the only folder, every
release from v0.55.0 on reads it.

## What an edit reaches

A merge to `main` that changes this directory publishes it to
`defold-typescript/library-data` (`scripts/library-data-mirror.ts`). A project picks
the change up on its first `resolve` or its next `resolve --update`, whatever CLI
release it runs. No CLI release is involved.

An edit therefore has to suit the oldest release that reads the folder, not only the
current CLI. CI runs `library check` with the oldest and the newest published CLI
that read each folder, and nightly with every one (`scripts/cli-range.ts`). That
catches data an older CLI cannot read. It does not catch valid data an older CLI
types worse than the current one does.

## When to open a new folder

Open a new folder when a change would:

- change the data format, so an older CLI could not read the data;
- change the core-type names that library declarations refer to; or
- make an older CLI that reads the folder type a library worse than it does without
  the change.

The third case is easy to miss. CLIs v0.55.0 through v0.59.0 drop every `.script_api`
namespace in an archive whose repo a library folder claims. A library folder for a
repo whose `.script_api` documents a namespace the folder does not type therefore
costs those releases that namespace. That is why they declare no native `mpeg` for
`Morgerion/defold-mpeg`.

Name the new folder for the release that will first ship a CLI reading it: the
version of the open `## vX.Y.Z` heading in `packages/docs/guide/changelog.md`. That
heading only ever moves up, so the release still reads the folder. A folder no
release reads yet is fine; the CI range skips it until one does.

Start the new folder as a copy of the newest one and make the change there. The
older folder then takes no further edits, and keeps serving the releases that read
it.
