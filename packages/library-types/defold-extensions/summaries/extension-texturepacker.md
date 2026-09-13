---
api: none
---

## What it ships

A `.tpatlas` resource type for atlases exported from the TexturePacker tool,
with an editor integration, a Bob build plugin, and a Defold exporter for
TexturePacker. A `.tpatlas` works like a regular `.atlas`, including
animations, but its images come from the exported `.tpinfo` file.

## Using it

Add a release zip URL from the repository's releases to the `game.project`
dependencies. Install the exporter in TexturePacker, export a `.tpinfo` file,
then create a Texture Packer Atlas in the editor and point it at that file.

## Engine APIs

The skins example declares [`resource`](/api/resource) atlas properties and
swaps a [`sprite`](/api/sprite) image at runtime with `go.set`.
