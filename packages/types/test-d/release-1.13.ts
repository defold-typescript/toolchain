const fixture = b2d.fixture.get_density({} as Opaque<"b2Body">, 0);
const adapter = graphics.get_adapter_info();
// The records-collection getters return arrays; indexed and iterated element
// field reads only compile when the returns are `...[]` (a bare record has no
// numeric index and is not iterable). Indexed reads use `[0]?.` so the strict
// index check is satisfied without a non-null assertion.
const computeConstant: Hash | undefined = compute.get_constants("/main/compute.computec")[0]?.name;
const computeConstantValue = compute.get_constants("/main/compute.computec")[0]?.value;
let computeSampler: Hash | undefined;
for (const s of compute.get_samplers("/main/compute.computec")) {
  computeSampler = s.name;
  const wrap: number = s.u_wrap;
  void wrap;
}
const computeTextureWidth: number | undefined =
  compute.get_textures("/main/compute.computec")[0]?.width;
const materialConstant: Hash | undefined = material.get_constants("/main/material.materialc")[0]
  ?.name;
let materialSampler: Hash | undefined;
for (const s of material.get_samplers("/main/material.materialc")) {
  materialSampler = s.name;
}
const materialTextureWidth: number | undefined = material.get_textures(
  "/main/material.materialc",
)[0]?.width;
const materialAttrNormalize: boolean | undefined = material.get_vertex_attributes(
  "/main/material.materialc",
)[0]?.normalize;
const weights = model.get_blend_weights("#model");
const zoom = camera.get_orthographic_auto_zoom();
const excluded = liveupdate.is_built_with_excluded_files();

render.set_blend_func_separate(1, 1, 1, 1);
compute.set_constants("/main/compute.computec", { tint: { type: 0, value: 1 } });
material.set_constants("/main/material.materialc", { tint: { type: 0, value: 1 } });
model.set_blend_weights("#model", [0.5]);
model.reset_constant("#model", "tint");
sprite.reset_constant("#sprite", "tint");
tilemap.reset_constant("#tilemap", "tint");

void fixture;
void adapter;
void computeConstant;
void computeConstantValue;
void computeSampler;
void computeTextureWidth;
void materialConstant;
void materialSampler;
void materialTextureWidth;
void materialAttrNormalize;
void weights;
void zoom;
void excluded;
