import type { EditorNode } from "@defold-typescript/types/editor-script";
import { defineEditorCommand, defineEditorScript } from "@defold-typescript/types/editor-script";
import type { Opaque } from "../../src/core-types";

export default defineEditorScript({
  get_commands: () => [
    // A bare literal without a query stays valid: the erased entry type is
    // backward compatible with commands authored before the coupling landed.
    { label: "Say Hi", locations: ["Edit"], run: () => print("hi") },
    defineEditorCommand({
      label: "One Resource",
      locations: ["Assets"],
      query: { selection: { type: "resource", cardinality: "one" } },
      run: (opts) => {
        const node: EditorNode = opts.selection;
        void editor.get(node, "path");
      },
    }),
    defineEditorCommand({
      label: "Many Resources",
      locations: ["Assets"],
      query: { selection: { type: "resource", cardinality: "many" } },
      active: (opts) => opts.selection.length > 0,
      run: (opts) => {
        for (const node of opts.selection) {
          const each: EditorNode = node;
          void editor.get(each, "path");
        }
      },
    }),
    defineEditorCommand({
      label: "With Argument",
      locations: ["Edit"],
      query: { argument: {} },
      run: (opts) => {
        void opts.argument;
      },
    }),
    defineEditorCommand({
      label: "No Selection Declared",
      locations: ["Edit"],
      query: { argument: {} },
      // @ts-expect-error a query without `selection` does not populate opts.selection
      run: (opts) => void opts.selection,
    }),
    defineEditorCommand({
      label: "Many Is Not One",
      locations: ["Assets"],
      query: { selection: { type: "resource", cardinality: "many" } },
      // @ts-expect-error a "many" selection is a node list, not a single node
      run: (opts) => void editor.get(opts.selection, "path"),
    }),
    defineEditorCommand({
      label: "No Argument Declared",
      locations: ["Edit"],
      query: { selection: { type: "outline", cardinality: "one" } },
      // @ts-expect-error a query without `argument` does not populate opts.argument
      run: (opts) => void opts.argument,
    }),
    defineEditorCommand({
      label: "No Query At All",
      locations: ["Edit"],
      // @ts-expect-error a command declaring no query receives an empty opts bag
      run: (opts) => void opts.selection,
    }),
  ],
});

const _s: string = editor.get("/main/game.script", "path") as string;
editor.transact([editor.tx.set("/main/game.script", "text", "x")]);
void _s;

// The call shapes the reference documents, verbatim from the upstream examples.
editor.bob({ archive: true, platform: editor.platform }, "distclean", "resolve", "build", "bundle");
const _captured: undefined | string = editor.execute("git", "log", "--oneline", {
  reload_resources: false,
  out: "capture",
});
void _captured;
editor.execute("git", "log");
editor.transact([editor.tx.add("/main/game.collection", "children", {})]);
// Print Git history for a file: the upstream `editor.command` example, whose
// body is copied unchanged. Only `locations` is added — upstream's own example
// omits it while upstream's prose declares the key required.
editor.command({
  label: "Git History",
  locations: ["Assets"],
  query: { selection: { type: "resource", cardinality: "one" } },
  run: (opts) => {
    editor.execute("git", "log", "--follow", `.${editor.get(opts.selection, "path")}`, {
      reload_resources: false,
    });
  },
});
editor.command({
  label: "Git History",
  locations: ["Assets"],
  query: { selection: { type: "resource", cardinality: "one" } },
  // @ts-expect-error the command's query never declared an `argument`
  run: (opts) => void opts.argument,
});

// The editor VM libraries, reachable only from this surface. Returns bind to
// explicitly annotated consts so a regression to `unknown` reds here.
const _response: Record<string | number, unknown> = http.request("http://localhost", {
  method: "GET",
});
const _serverUrl: string = http.server.url;
const _serverPort: number = http.server.port;
// Every call shape upstream's own `examples` block shows, translated to
// TypeScript. An optional parameter sitting before a required one has no direct
// rendering, so these forms exist only as hand-authored overloads.
http.server.route("/users/{user}/orders", (request) => void request);
http.server.route("/json", "POST", "json", (request) => void request);
// @ts-expect-error a route without a handler is not a route
http.server.route("/files/{*file}");
// @ts-expect-error the handler is the last argument, never the method
http.server.route("/files/{*file}", (request) => void request, "json");
void _response;
void _serverUrl;
void _serverPort;

// Upstream records no return value for either function while its own prose names
// one, so both are hand-authored. `ReturnType` binding an `unknown` is what a
// regression to the emitted `void` rejects.
const _encoded: string = json.encode({ a: 1 });
const _decoded: ReturnType<typeof json.decode> = 1 as unknown;
json.decode('{"a":1}', { all: true });
// @ts-expect-error an encoded document is a string, not a number
const _encodedBad: number = json.encode({ a: 1 });
// @ts-expect-error a decoded value is `unknown` until the caller narrows it
void _decoded.a;
void _encoded;
void _encodedBad;
void (_decoded as Record<string, unknown>).a;

zip.pack("build.zip", ["build", "game.project"]);
zip.pack("build.zip", [["build/wasm-web", "."]]);
zip.pack("build.zip", { method: zip.METHOD.STORED }, ["build", "resources"]);
zip.pack("build.zip", [{ 1: "assets", method: zip.METHOD.STORED }, "build/wasm-web"]);
// @ts-expect-error an archive with no entries is not an archive
zip.pack("build.zip");

// `unpack`'s second slot is a target path, an options table or a paths table;
// the two table forms are told apart by shape.
zip.unpack("build.zip");
zip.unpack("build.zip", "build/dev/tmp");
zip.unpack("build.zip", { on_conflict: zip.ON_CONFLICT.OVERWRITE });
zip.unpack("build.zip", ["config.json"]);
// @ts-expect-error slot two is a path, an options table or a paths table
zip.unpack("build.zip", 42);
// @ts-expect-error the constant table has no DEFLATE member (it is DEFLATED)
void zip.METHOD.DEFLATE;

const _inflated: string = zlib.inflate(zlib.deflate("payload"));
void _inflated;

const _tiles = tilemap.tiles.new();
const _tile: number = tilemap.tiles.get_tile(tilemap.tiles.set(_tiles, 1, 1, 2), 1, 1);
void _tile;

pprint({ a: 1 });

// Every `localization` function hands back the same opaque `message` handle, so
// the returns bind to explicitly annotated consts: a regression to `unknown`
// (the shape an unmapped token emits) reds here.
const _greeting: Opaque<"message"> = localization.message("greeting", { name: "a" });
const _bareKey: Opaque<"message"> = localization.message("greeting");
const _joined: Opaque<"message"> = localization.concat(["a", "b"], ", ");
const _andList: Opaque<"message"> = localization.and_list(["a", "b"]);
const _orList: Opaque<"message"> = localization.or_list(["a", "b"]);
// @ts-expect-error a localization key is the string name an `.editor_localization` file defines
localization.message(1);
void _greeting;
void _bareKey;
void _joined;
void _andList;
void _orList;

// @ts-expect-error go.* is absent on the editor-script surface
go.get_position();
// @ts-expect-error vmath.* is absent on the editor-script surface
vmath.vector3(1, 2, 3);
// @ts-expect-error msg.* is absent on the editor-script surface
msg.post("#", "hello");

// The UI toolkit. Every builder hands back the same nominal component handle, so
// the bindings are explicitly annotated: a regression to the default token
// mapping (`unknown`) reds here, and so does one that leaves `show_dialog`
// taking something else.
const _heading: Opaque<"component"> = editor.ui.heading({
  text: "Confirm",
  color: editor.ui.COLOR.TEXT,
});
const _confirm: Opaque<"component"> = editor.ui.button({ text: "OK", result: true });
const _confirmDialog: Opaque<"component"> = editor.ui.dialog({
  title: "Confirm",
  content: editor.ui.vertical({ children: [_heading] }),
  buttons: [_confirm],
});
void editor.ui.show_dialog(_confirmDialog);
// @ts-expect-error the constant table is a namespace, not an index signature
void editor.ui.COLOR.TEX;

// Preferences, including the second-level schema group. `enum` is a reserved
// word, so it is reachable only through the emitted export alias.
editor.prefs.set("my.key", 1);
const _pref: unknown = editor.prefs.get("my.key");
const _isSet: boolean = editor.prefs.is_set("my.key");
void editor.prefs.schema.integer({ default: 0, scope: editor.prefs.SCOPE.PROJECT });
void editor.prefs.schema.enum({ values: ["a", "b"] });
void _pref;
void _isSet;
