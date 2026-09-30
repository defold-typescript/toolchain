/// <reference types="lua-types/5.1" />
/// <reference types="lua-types/special/jit-only" />
import "./generated/builtin-messages";
import "./src/custom-messages";
import "./src/msg-overloads";
import "./src/message-guard";
import "./src/window-event-guard";
import "./src/message-dispatch";
import "./src/scene-addresses";
import "./src/engine-globals";
import "./generated/b2d";
import "./generated/b2d_body";
import "./generated/b2d_chain";
import "./generated/b2d_fixture";
import "./generated/b2d_joint";
import "./generated/b2d_shape";
import "./generated/b2d_world";
import "./generated/buffer";
import "./generated/bullet3d";
import "./generated/bullet3d_collision_object";
import "./generated/bullet3d_constraint";
import "./generated/bullet3d_rigid_body";
import "./generated/bullet3d_shape";
import "./generated/bullet3d_world";
import "./generated/camera";
import "./generated/collectionfactory";
import "./generated/collectionproxy";
import "./generated/compute";
import "./generated/crash";
import "./generated/factory";
import "./generated/font";
import "./generated/go";
import "./src/go-overloads";
import "./src/component-properties";
import "./generated/graphics";
import "./generated/gui";
import "./generated/html5";
import "./generated/http";
import "./generated/image";
import "./generated/json";
import "./generated/label";
import "./generated/liveupdate";
import "./generated/material";
import "./generated/model";
import "./generated/msg";
import "./generated/particlefx";
import "./generated/physics";
import "./generated/profiler";
import "./generated/render";
import "./src/render-overloads";
import "./generated/resource";
import "./generated/socket";
import "./src/socket-types";
import "./generated/sound";
import "./generated/sprite";
import "./generated/sys";
import "./generated/tilemap";
import "./generated/timer";
import "./generated/types";
import "./generated/vmath";
import "./src/vmath-overloads";
import "./src/sys-overloads";
import "./generated/window";
import "./generated/zlib";

// The root export set lives in `src/index.ts`, the runtime `default` condition.
// Re-exporting it keeps the `types` condition from drifting into a subset, and
// is what `@defold-typescript/types/api` publishes for a pinned entrypoint.
export * from "./src/index";
