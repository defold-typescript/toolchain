// Calls the probe never makes, keyed `<ns.fn>`, `<ns>.*` or `<ns.fn>:overload<n>`,
// each with the reason: the call ends or corrupts the run, reaches outside the
// machine, needs a platform the desktop engine is not, or takes a handle
// nothing can produce.
const LIFECYCLE = "a lifecycle hook the script defines, not an engine function";
const NO_BULLET3D = "the probe project runs 2D physics, so no bullet3d world or object exists";
const PROPERTY_DEFAULT =
  "a go.property default bob reads at build time; the runtime does not define it";

export const PROBE_DENYLIST: Readonly<Record<string, string>> = {
  "sys.exit": "ends the run",
  "sys.reboot": "restarts the engine",
  "sys.open_url": "opens the host browser",
  "http.request": "reaches the network",
  "liveupdate.*": "mounts and downloads archives",
  "crash.write_dump": "writes a crash dump beside the engine",
  "html5.*": "exists only in HTML5 builds",
  "bullet3d.*": NO_BULLET3D,
  "bullet3d.collision_object.*": NO_BULLET3D,
  "bullet3d.constraint.*": NO_BULLET3D,
  "bullet3d.rigid_body.*": NO_BULLET3D,
  "bullet3d.shape.*": NO_BULLET3D,
  "bullet3d.world.*": NO_BULLET3D,
  "window.set_mouse_lock": "grabs the host pointer",
  "render.dispatch_compute":
    "crashes the engine's command parse when no compute program is set, and the probe project has none",
  "b2d.body.create_fixture:overload2":
    "the b2Shape handle form documents C++ b2Body::CreateFixture, which neither Lua binding implements",
  "go.property": "a build-time declaration bob rejects anywhere but a script's top level",
  "resource.atlas": PROPERTY_DEFAULT,
  "resource.buffer": PROPERTY_DEFAULT,
  "resource.font": PROPERTY_DEFAULT,
  "resource.material": PROPERTY_DEFAULT,
  "resource.render_target": PROPERTY_DEFAULT,
  "resource.texture": PROPERTY_DEFAULT,
  "resource.tile_source": PROPERTY_DEFAULT,
  "go.init": LIFECYCLE,
  "go.final": LIFECYCLE,
  "go.update": LIFECYCLE,
  "go.fixed_update": LIFECYCLE,
  "go.late_update": LIFECYCLE,
  "go.on_input": LIFECYCLE,
  "go.on_message": LIFECYCLE,
  "go.on_reload": LIFECYCLE,
  "gui.init": LIFECYCLE,
  "gui.final": LIFECYCLE,
  "gui.update": LIFECYCLE,
  "gui.on_input": LIFECYCLE,
  "gui.on_message": LIFECYCLE,
  "gui.on_reload": LIFECYCLE,
};

// Catalog members the probe never reads or writes, keyed `<ns>.<member>`.
const ONE_SAMPLER =
  "the probe model's material binds one sampler, so only texture0 names a texture";

export const PROPERTY_DENYLIST: Readonly<Record<string, string>> = {
  "model.texture1": ONE_SAMPLER,
  "model.texture2": ONE_SAMPLER,
  "model.texture3": ONE_SAMPLER,
  "model.texture4": ONE_SAMPLER,
  "model.texture5": ONE_SAMPLER,
  "model.texture6": ONE_SAMPLER,
  "model.texture7": ONE_SAMPLER,
};

// Built-in messages the probe never posts, keyed by message id.
export const MESSAGE_DENYLIST: Readonly<Record<string, string>> = {
  exit: "ends the run",
  reboot: "restarts the engine",
  start_record: "writes a video file beside the engine",
  stop_record: "logs an error unless start_record began a recording, which the probe never posts",
};
