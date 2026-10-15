import { defineRenderScript } from "../../generated/kinds/render-script";

vmath.vector3(1, 2, 3);
const _w: number = render.get_width();
void _w;

// Both hand-authored arities reach the one kind the namespace is restricted to.
// Feeding each result to `set_render_target` pins the branded handle type
// without importing `Opaque` past the kind surface under test.
render.set_render_target(render.render_target({}));
render.set_render_target(render.render_target("rt", {}));

// @ts-expect-error gui.* is absent on the render-script surface
gui.get_width();

// A render script has no game object, so a function that resolves one is
// absent. Every function in these namespaces needs one.
// @ts-expect-error sprite needs a game object
sprite.set_hflip("#sprite", true);
// @ts-expect-error factory needs a game object
factory.create("#factory");
// @ts-expect-error collectionfactory needs a game object
collectionfactory.create("#collectionfactory");
// @ts-expect-error collectionproxy needs a game object
collectionproxy.get_resources("#proxy");
// @ts-expect-error label needs a game object
label.set_text("#label", "text");
// @ts-expect-error model needs a game object
model.cancel("#model");
// @ts-expect-error particlefx needs a game object
particlefx.play("#particlefx");
// @ts-expect-error physics needs a game object
physics.get_gravity();
// @ts-expect-error tilemap needs a game object
tilemap.get_bounds("#tilemap");

// These namespaces keep the functions that need none.
// @ts-expect-error b2d.get_world needs a game object
b2d.get_world();
b2d.get_version();
// @ts-expect-error bullet3d.get_world needs a game object
bullet3d.get_world();
bullet3d.get_version();
// @ts-expect-error resource.release needs a game object
resource.release("/main/atlas.texturec");
resource.load("/main/data.bin");
// @ts-expect-error sound.stop needs a game object
sound.stop("#sound");
sound.get_groups();
// @ts-expect-error go.get_position needs a game object
go.get_position();
// What `go` keeps callable is the lifecycle hooks, which no script calls, so
// its constants stand for the rest of the namespace.
const _playback = go.PLAYBACK_ONCE_FORWARD;
void _playback;

defineRenderScript({
  init: () => ({ frames: 0 }),
  update(self) {
    const _frames: number = self.frames;
    void _frames;
  },
});

defineRenderScript({
  // @ts-expect-error a render script cannot declare properties
  properties: { speed: 1 },
});
