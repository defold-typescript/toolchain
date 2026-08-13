import type { EditorNode } from "@defold-typescript/types/editor-script";
import { defineEditorCommand, defineEditorScript } from "@defold-typescript/types/editor-script";

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

// @ts-expect-error go.* is absent on the editor-script surface
go.get_position();
// @ts-expect-error vmath.* is absent on the editor-script surface
vmath.vector3(1, 2, 3);
// @ts-expect-error msg.* is absent on the editor-script surface
msg.post("#", "hello");
// @ts-expect-error editor.ui.* is out of scope for this slice
editor.ui.label({ text: "x" });
