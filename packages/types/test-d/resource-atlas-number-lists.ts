/// <reference path="../index.d.ts" />

declare const numberListPath: string;

resource.create_atlas(numberListPath, {
  texture: "/main/probe.texturec",
  geometries: [{ vertices: [0, 0, 1, 1], uvs: [0, 0], indices: [0, 1, 2] }],
  animations: [{ id: "idle", width: 1, height: 1 }],
});

resource.create_atlas(numberListPath, {
  texture: "/main/probe.texturec",
  // @ts-expect-error vertices is number[]; a string element is rejected
  geometries: [{ vertices: ["x"], uvs: [0, 0], indices: [0, 1, 2] }],
  animations: [{ id: "idle", width: 1, height: 1 }],
});
