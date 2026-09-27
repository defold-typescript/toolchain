// Calls the probe never makes, keyed `<ns.fn>`, `<ns>.*` or `<ns.fn>:overload<n>`,
// each with the reason: the call ends or corrupts the run, reaches outside the
// machine, needs a platform the desktop engine is not, or takes a handle
// nothing can produce.
const LIFECYCLE = "a lifecycle hook the script defines, not an engine function";
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
