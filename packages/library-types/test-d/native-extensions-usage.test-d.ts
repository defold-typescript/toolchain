/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

// Compile-only proof for the curated defold-sharing, defold-uuid4 and
// defold-tile-raycast native-extension namespaces. No assertions execute;
// `tsc --noEmit` under tsconfig.dts-check.json is the gate.

declare const bytes: string;

share.text("hi");
share.image(bytes);
share.image(bytes, "caption", "shot.png");
share.file("/tmp/a.txt", undefined, { title: "Save" });
share.file("a.txt", "contents", { type: "text/plain", text: "t", url: "https://example.com" });
const options: share.FileOptions = {};
share.file("a.txt", undefined, options);

// @ts-expect-error every file option is a string.
share.file("a", "b", { title: 1 });
// @ts-expect-error the text to share is required.
share.text();

const _id: string = uuid4.generate();

const tiles: number[] = [1, 2, 2, 1];
tile_raycast.setup(16, 16, 10, 10, tiles, [1, 2]);

const [hit, tile_x, tile_y, array_id, tile_id, intersection_x, intersection_y, side] =
  tile_raycast.cast(0, 0, 100, 100);
// @ts-expect-error a miss returns `false` alone, so the tile is only there after checking `hit`.
const _unchecked: number = tile_x;
if (hit) {
  const _cell: number = tile_x + tile_y + array_id + tile_id;
  const _point: number = intersection_x + intersection_y;
  const _fromLeft: boolean = side === tile_raycast.LEFT;
}

const _sides: number[] = [
  tile_raycast.LEFT,
  tile_raycast.RIGHT,
  tile_raycast.TOP,
  tile_raycast.BOTTOM,
];

// The extension registers its reader as `set_at` and its writer as `get_at`.
const _stored: number = tile_raycast.set_at(1, 1);
tile_raycast.get_at(1, 1, 3);
// @ts-expect-error the function registered as `get_at` writes, so it requires the tile id.
tile_raycast.get_at(1, 1);

tile_raycast.reset();

export {};
