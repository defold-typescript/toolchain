const fixture = b2d.fixture.get_density({} as Opaque<"b2Body">, 0);
const adapter = graphics.get_adapter_info();
const computeConstants = compute.get_constants("/main/compute.computec");
const materialConstants = material.get_constants("/main/material.materialc");
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
void computeConstants;
void materialConstants;
void weights;
void zoom;
void excluded;
