/// <reference path="../index.d.ts" />

export {};

type AtlasTable = Parameters<typeof resource.set_atlas>[1];
type AtlasAnimation = AtlasTable["animations"][number];

declare const framePath: string;
declare const anims: AtlasAnimation[];

const geometry = { vertices: [0, 0, 1, 1], uvs: [0, 0], indices: [0, 1, 2] };

for (const atlas of [resource.create_atlas, resource.set_atlas] as const) {
  atlas(framePath, {
    texture: "/main/probe.texturec",
    geometries: [geometry],
    animations: [{ id: "listed", width: 1, height: 1, frames: [1] }],
  });

  atlas(framePath, {
    texture: "/main/probe.texturec",
    geometries: [geometry],
    animations: [
      {
        id: "ranged",
        width: 1,
        height: 1,
        frame_start: 1,
        frame_end: 2,
        playback: go.PLAYBACK_LOOP_FORWARD,
        fps: 30,
        flip_vertical: false,
        flip_horizontal: true,
      },
    ],
  });

  atlas(framePath, {
    texture: "/main/probe.texturec",
    // @ts-expect-error CheckAtlasArguments raises on an atlas with no geometry
    geometries: [],
    animations: [{ id: "idle", width: 1, height: 1, frames: [1] }],
  });

  atlas(framePath, {
    texture: "/main/probe.texturec",
    geometries: [geometry],
    // @ts-expect-error CheckAtlasArguments raises on an atlas with no animation
    animations: [],
  });

  atlas(framePath, {
    texture: "/main/probe.texturec",
    geometries: [geometry],
    // @ts-expect-error an animation needs frames or both frame_start and frame_end
    animations: [{ id: "idle", width: 1, height: 1 }],
  });

  atlas(framePath, {
    texture: "/main/probe.texturec",
    geometries: [geometry],
    // @ts-expect-error frame_start alone names no frame range
    animations: [{ id: "idle", width: 1, height: 1, frame_start: 1 }],
  });

  atlas(framePath, {
    texture: "/main/probe.texturec",
    geometries: [geometry],
    // @ts-expect-error an empty frames list names no frame
    animations: [{ id: "idle", width: 1, height: 1, frames: [] }],
  });

  // @ts-expect-error the atlas table needs a texture
  atlas(framePath, {
    geometries: [geometry],
    animations: [{ id: "idle", width: 1, height: 1, frames: [1] }],
  });

  atlas(framePath, {
    texture: "/main/probe.texturec",
    geometries: [geometry],
    // @ts-expect-error an ordinary array may be empty; the binding needs one animation
    animations: anims,
  });
}
