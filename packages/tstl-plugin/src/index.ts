import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  buildConfigKeyIndex,
  buildGuiNodeIndex,
  buildInputActionIndex,
  buildSceneComponentIndex,
  buildSceneObjectPathIndex,
  buildSpriteAnimationIndex,
  type ClassifiedSlot,
  componentIdOfSameObjectAddress,
  computeOutputRel,
  getProgramDiagnostics,
  isAddressClass,
  resolveClassifiedSlotAtPosition,
} from "@defold-typescript/transpiler";
import type { UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";
import { readBuildConfigFromHost } from "./build-config";
import {
  buildAddressPathCompletionEntries,
  buildSceneCompletionEntries,
  buildWholeLiteralCompletionEntries,
  CONTRIBUTED_ENTRY_KIND,
  DEFOLD_COMPLETION_SOURCE,
} from "./scene-completions";
import {
  displayPathOf,
  GAME_PROJECT_DOCUMENT,
  GUI_EXTENSIONS,
  INPUT_BINDING_EXTENSIONS,
  PROJECT_EXTENSIONS,
} from "./scene-documents";
import {
  createSceneIndexCache,
  type SceneIndexCache,
  type SceneWatchHost,
} from "./scene-index-cache";
import { resolveEntryProvenance } from "./scene-provenance";

// The one extension set no second reader shares: an atlas declares animation
// names, not component ids or node ids, and animation provenance is out of the
// covered set.
const ANIMATION_ASSET_EXTENSIONS = [".atlas", ".tilesource", ".sprite"];

const requireFromHere = createRequire(import.meta.url);

// The JSON subpath, never the package's `.` entry: `@defold-typescript/types`
// resolves that entry to TypeScript source, which would survive
// `--packages=external` into the packed plugin and fail under plain node the
// way bug-88 did. A declared subpath of plain JSON carries none of that hazard.
// Resolved and read rather than `require`d, so the value never depends on
// whether something else in the host process already imported it as a module.
let urlParameterTable: UrlParameterTable | undefined;
function loadUrlParameterTable(): UrlParameterTable | undefined {
  if (!urlParameterTable) {
    try {
      const path = requireFromHere.resolve("@defold-typescript/types/url-parameters.json");
      urlParameterTable = JSON.parse(readFileSync(path, "utf8")) as UrlParameterTable;
    } catch {
      return undefined;
    }
  }
  return urlParameterTable;
}

// A slot resolves for a caret anywhere inside the quotes, but a component
// entry's `replacementSpan` only ever covers the fragment — so offering one to
// a caret in the path would edit text the author is not standing on. `<` not
// `<=`: at `fragmentStart` the fragment is merely empty, which is where it is
// most often typed. The guard is above the walk, so a caret in the path costs no
// `.go`/`.collection` parse.
function componentEntries(
  slot: ClassifiedSlot,
  position: number,
  cache: SceneIndexCache,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  if (slot.fragmentStart === -1 || position < slot.fragmentStart) {
    return [];
  }
  // A partial universe still suggests — unlike the reachability report, a
  // suggestion claims nothing about what is absent.
  return buildSceneCompletionEntries({
    slot,
    ids: cache.derived(
      "component-ids",
      () => buildSceneComponentIndex(cache.documents().documents).ids,
    ),
    baseEntries,
  });
}

// The exact complement of `componentEntries`' guard, so precisely one of the two
// universes answers any caret in an address: component ids from `fragmentStart`
// on, game-object paths everywhere before it — including a literal carrying no
// `#` at all, which is all path. Project-wide like the component universe, and
// for the same reason: what a path resolves to at runtime depends on the
// collection that was loaded, which the file being edited does not say.
function objectPathEntries(
  slot: ClassifiedSlot,
  position: number,
  cache: SceneIndexCache,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  if (slot.fragmentStart !== -1 && position >= slot.fragmentStart) {
    return [];
  }
  return buildAddressPathCompletionEntries({
    slot,
    paths: cache.derived(
      "object-paths",
      () => buildSceneObjectPathIndex(cache.documents().documents).paths,
    ),
    baseEntries,
  });
}

// No caret guard: the span is the whole literal, so an entry is well-formed
// wherever inside the quotes the caret sits. Node ids are scoped to the single
// `.gui` that names this file's generated script — a project-wide union would
// offer ids `gui.get_node` could never resolve at runtime. A scene names an
// output resource, and an output path cannot say which include base produced it,
// so the file being edited is mapped forward through the build's own math rather
// than the resource being mapped back.
function nodeEntries(
  slot: ClassifiedSlot,
  cache: SceneIndexCache,
  fileName: string,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  const { projectRoot } = cache;
  const index = cache.derived("gui-nodes", () =>
    buildGuiNodeIndex(cache.documents(GUI_EXTENSIONS).documents),
  );
  const config = readBuildConfigFromHost(cache.host, projectRoot);
  const resource = computeOutputRel(displayPathOf(projectRoot, fileName), config, "gui-script");
  const ids = index.byScriptResource.get(resource);
  return ids === undefined ? [] : buildWholeLiteralCompletionEntries({ slot, ids, baseEntries });
}

// Also no caret guard, and the same forward output-path mapping — but scoped
// one step further than a node id: to the sprite component the slot's *sibling*
// literal addresses on the one game object that owns this script. Every
// unresolved link returns nothing rather than a project-wide guess, because a
// `sprite.play_flipbook` id the addressed atlas does not declare is a runtime
// crash.
function animationEntries(
  slot: ClassifiedSlot,
  cache: SceneIndexCache,
  fileName: string,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  const component = componentIdOfSameObjectAddress(slot.addressText ?? "");
  if (component === undefined) {
    return [];
  }
  const { projectRoot } = cache;
  const index = cache.derived("sprite-animations", () =>
    buildSpriteAnimationIndex({
      scenes: cache.documents().documents,
      assets: cache.documents(ANIMATION_ASSET_EXTENSIONS).documents,
    }),
  );
  const config = readBuildConfigFromHost(cache.host, projectRoot);
  const resource = computeOutputRel(displayPathOf(projectRoot, fileName), config, "script");
  const ids = index.byScriptResource.get(resource)?.get(component);
  return ids === undefined ? [] : buildWholeLiteralCompletionEntries({ slot, ids, baseEntries });
}

// The one kind needing no scene at all: the candidates are the project's own
// files of the extensions the slot's entry declares, so there is nothing to
// resolve ownership through and no document to parse. Same whole-literal span as
// a node id — a resource path is the entire text between the quotes.
function resourceEntries(
  slot: ClassifiedSlot,
  cache: SceneIndexCache,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  const extensions = slot.resourceExtensions;
  if (extensions === undefined || extensions.length === 0) {
    return [];
  }
  const ids = cache.resourcePaths(extensions);
  return buildWholeLiteralCompletionEntries({ slot, ids, baseEntries });
}

// The kind whose candidates come from a single project file rather than a walk
// of many: `game.project` is the whole universe, since a key it never writes
// answers the reader's default at runtime. Same whole-literal span as a resource
// path — a config key is the entire text between the quotes, including any `#`
// a `dependencies#0`-shaped key carries.
function configKeyEntries(
  slot: ClassifiedSlot,
  cache: SceneIndexCache,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  const text = cache.documents(PROJECT_EXTENSIONS).documents.get(GAME_PROJECT_DOCUMENT);
  if (text === undefined) {
    return [];
  }
  const ids = cache.derived("config-keys", () => buildConfigKeyIndex(text));
  return buildWholeLiteralCompletionEntries({ slot, ids, baseEntries });
}

// The kind with no scene, no owner and no sibling to resolve through: the slot
// resolver has already settled that this `hash("…")` is compared against an
// `on_input` action id, so every action the project declares is a candidate.
// Same whole-literal span as a config key.
function actionIdEntries(
  slot: ClassifiedSlot,
  cache: SceneIndexCache,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  const ids = cache.derived("input-actions", () =>
    buildInputActionIndex(cache.documents(INPUT_BINDING_EXTENSIONS).documents),
  );
  return buildWholeLiteralCompletionEntries({ slot, ids, baseEntries });
}

// The panel a claimed request is answered with. `documentation` rather than
// `displayParts` carries the paths because a host renders the former as the
// body of the panel, which is where a list of files reads as one.
function provenancePanel(
  entryName: string,
  declaredIn: readonly string[],
): ts.CompletionEntryDetails {
  return {
    name: entryName,
    kind: CONTRIBUTED_ENTRY_KIND,
    kindModifiers: "",
    displayParts: [{ kind: "stringLiteral", text: JSON.stringify(entryName) }],
    documentation: [
      {
        kind: "text",
        text: `Declared in ${declaredIn.join(", ")}`,
      },
    ],
    source: [{ kind: "text", text: DEFOLD_COMPLETION_SOURCE }],
  };
}

// A TS language-service plugin is loaded by package name and its main is called
// as this `init` factory; the editor passes its own `typescript` instance so the
// plugin shares the editor's `ts` (notably `DiagnosticCategory`).
export default function init(modules: { typescript: typeof import("typescript") }): {
  create(info: ts.server.PluginCreateInfo): ts.LanguageService;
} {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const proxy = Object.create(null) as ts.LanguageService;
    const writable = proxy as unknown as Record<string, unknown>;
    const base = info.languageService;
    for (const key of Object.keys(base) as Array<keyof ts.LanguageService>) {
      const member = base[key];
      if (typeof member === "function") {
        const fn = member as (...args: unknown[]) => unknown;
        writable[key] = (...args: unknown[]) => fn.apply(base, args);
      }
    }

    // One index for the life of this language service, shared by every
    // completion surface. A host that cannot enumerate files gets none at all —
    // the same early return the completion path already takes.
    const serverHost = info.serverHost as SceneWatchHost | undefined;
    const cache = serverHost?.readDirectory
      ? createSceneIndexCache(serverHost, info.project.getCurrentDirectory())
      : undefined;

    // Set after the member-copy loop, which would otherwise leave `dispose`
    // forwarding straight to the base — closing the project without ever closing
    // a watcher, and silently, because the forwarder does exist.
    proxy.dispose = () => {
      cache?.dispose();
      const disposeBase = (base as Partial<ts.LanguageService>).dispose;
      disposeBase?.call(base);
    };

    // Set after the member-copy loop for the same reason as `dispose`. Claimed
    // only when the host round-tripped our own discriminator, the slot still
    // resolves, and the entry's universe really names a declaring file — every
    // other request is handed to the base member exactly as received, because a
    // fabricated panel is worse than the editor's own.
    proxy.getCompletionEntryDetails = (
      fileName: string,
      position: number,
      entryName: string,
      formatOptions: ts.FormatCodeOptions | ts.FormatCodeSettings | undefined,
      source: string | undefined,
      preferences: ts.UserPreferences | undefined,
      data: ts.CompletionEntryData | undefined,
    ): ts.CompletionEntryDetails | undefined => {
      const forward = () =>
        base.getCompletionEntryDetails?.(
          fileName,
          position,
          entryName,
          formatOptions,
          source,
          preferences,
          data,
        );
      if (source !== DEFOLD_COMPLETION_SOURCE || !cache) {
        return forward();
      }
      const program = base.getProgram();
      const table = loadUrlParameterTable();
      if (!program || !table) {
        return forward();
      }
      const slot = resolveClassifiedSlotAtPosition({ program, table, fileName, position });
      if (!slot) {
        return forward();
      }
      const declaredIn = resolveEntryProvenance({ slot, cache, fileName, entryName });
      return declaredIn.length === 0 ? forward() : provenancePanel(entryName, declaredIn);
    };

    proxy.getSemanticDiagnostics = (fileName: string): ts.Diagnostic[] => {
      const prior = base.getSemanticDiagnostics(fileName);
      const program = base.getProgram();
      if (!program) {
        return prior;
      }
      // Advisory category so a valid project's `tsc --noEmit` stays clean — the
      // plugin adds signal, never hard errors on supported code.
      const transpiler = getProgramDiagnostics(program, program.getSourceFile(fileName)).map(
        (diagnostic) => ({ ...diagnostic, category: ts.DiagnosticCategory.Suggestion }),
      );
      return [...prior, ...transpiler];
    };

    // Strictly additive: every path that cannot produce a suggestion returns the
    // base result untouched, because a plugin that swallows the editor's own
    // completions is worse than one that offers nothing.
    proxy.getCompletionsAtPosition = (
      fileName: string,
      position: number,
      options: ts.GetCompletionsAtPositionOptions | undefined,
      formattingSettings?: ts.FormatCodeSettings,
    ): ts.WithMetadata<ts.CompletionInfo> | undefined => {
      const prior = base.getCompletionsAtPosition(fileName, position, options, formattingSettings);
      const program = base.getProgram();
      const table = loadUrlParameterTable();
      if (!program || !table) {
        return prior;
      }
      const slot = resolveClassifiedSlotAtPosition({ program, table, fileName, position });
      if (!slot) {
        return prior;
      }
      if (!cache) {
        return prior;
      }

      // Read through the index the host's own watchers invalidate, so a slot the
      // author keeps typing in costs no walk after the first — and still reflects
      // a scene edited, added or removed. On a host missing either watch
      // facility the cache delegates straight through, walking per request the
      // way this path always did.
      const baseEntries = prior?.entries ?? [];
      const entries = isAddressClass(slot.class)
        ? [
            ...componentEntries(slot, position, cache, baseEntries),
            ...objectPathEntries(slot, position, cache, baseEntries),
          ]
        : slot.class === "gui-node"
          ? nodeEntries(slot, cache, fileName, baseEntries)
          : slot.class === "animation"
            ? animationEntries(slot, cache, fileName, baseEntries)
            : slot.class === "resource-path"
              ? resourceEntries(slot, cache, baseEntries)
              : slot.class === "config-key"
                ? configKeyEntries(slot, cache, baseEntries)
                : slot.class === "action-id"
                  ? actionIdEntries(slot, cache, baseEntries)
                  : [];
      if (entries.length === 0) {
        return prior;
      }
      if (!prior) {
        return {
          isGlobalCompletion: false,
          isMemberCompletion: false,
          isNewIdentifierLocation: false,
          entries,
        };
      }
      return { ...prior, entries: [...prior.entries, ...entries] };
    };

    return proxy;
  }

  return { create };
}
