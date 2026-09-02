import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  ANIMATION_ASSET_EXTENSIONS,
  buildComponentAnimationIndex,
  buildConfigKeyIndex,
  buildGuiFlipbookIndex,
  buildGuiNodeIndex,
  buildInputActionIndex,
  buildSceneComponentIndex,
  buildSceneObjectPathIndex,
  type ClassifiedSlot,
  componentIdOfSameObjectAddress,
  computeOutputRel,
  displayPathOf,
  GAME_PROJECT_DOCUMENT,
  GUI_EXTENSIONS,
  getProgramDiagnostics,
  INPUT_BINDING_EXTENSIONS,
  isAddressClass,
  isFragmentCaret,
  PROJECT_EXTENSIONS,
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
  createSceneIndexCache,
  type SceneIndexCache,
  type SceneWatchHost,
  sceneCollectionRolesOf,
} from "./scene-index-cache";
import { resolveEntryProvenance, resolveRelativeEntryProvenance } from "./scene-provenance";
import { offersBareWorld, relativeUniverseFor } from "./scene-relative-addresses";

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
// a caret in the path would edit text the author is not standing on. The guard
// is above the walk, so a caret in the path costs no `.go`/`.collection` parse.
function componentEntries(
  slot: ClassifiedSlot,
  position: number,
  cache: SceneIndexCache,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  if (!isFragmentCaret(slot, position)) {
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
// universes answers any caret in an address. The absolute half is project-wide
// like the component universe, and for the same reason: what a path resolves to
// at runtime depends on the collection that was loaded, which the file being
// edited does not say. The relative half cannot be — a relative address
// continues the collection path of the object hosting *this* script — so it is
// read per file and merged in, and the caller's own world decides whether a bare
// absolute path can resolve at all.
function objectPathEntries(
  slot: ClassifiedSlot,
  position: number,
  cache: SceneIndexCache,
  fileName: string,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  if (isFragmentCaret(slot, position)) {
    return [];
  }
  const universe = relativeUniverseFor(cache, fileName);
  const bare = offersBareWorld(universe);
  const absolute = cache.derived(
    "object-paths",
    () =>
      buildSceneObjectPathIndex(cache.documents().documents, sceneCollectionRolesOf(cache)).paths,
  );
  const paths = new Set<string>();
  for (const key of absolute) {
    if (bare || !key.startsWith("/")) paths.add(key);
  }
  for (const key of universe.paths) paths.add(key);
  const entries = buildAddressPathCompletionEntries({ slot, paths, baseEntries });
  // A join is the whole literal, so accepting one where the author already typed
  // a `#` would silently rewrite the fragment they are holding.
  if (slot.fragmentStart === -1) {
    entries.push(
      ...buildWholeLiteralCompletionEntries({ slot, ids: universe.addresses, baseEntries }),
    );
  }
  return entries;
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
// one step further than a node id, in whichever of the two ways the slot's own
// entry declares. Every unresolved link returns nothing rather than a
// project-wide guess, because an animation id the resolved atlas does not
// declare is a runtime crash.
//
// The branch is the table's own discriminator rather than a second arm in the
// class chain: an `animation` entry names either an address companion or a node
// companion, and the drift guard is what keeps it to exactly one.
function animationEntries(
  slot: ClassifiedSlot,
  cache: SceneIndexCache,
  fileName: string,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  const { projectRoot } = cache;
  // Scoped to the `.gui` scene naming this file's generated gui script, never
  // to the node the call addresses: `gui.set_texture` retargets a node at
  // runtime, so the scene's textures are the honest universe.
  if (slot.nodeParameter !== undefined) {
    const index = cache.derived("gui-flipbook", () =>
      buildGuiFlipbookIndex({
        scenes: cache.documents(GUI_EXTENSIONS).documents,
        assets: cache.documents(ANIMATION_ASSET_EXTENSIONS).documents,
      }),
    );
    const config = readBuildConfigFromHost(cache.host, projectRoot);
    const resource = computeOutputRel(displayPathOf(projectRoot, fileName), config, "gui-script");
    const declared = index.byScriptResource.get(resource);
    return declared === undefined
      ? []
      : buildWholeLiteralCompletionEntries({ slot, ids: new Set(declared.keys()), baseEntries });
  }
  // Scoped to the sprite or model component the slot's *sibling* literal
  // addresses on the one game object that owns this script.
  const component = componentIdOfSameObjectAddress(slot.addressText ?? "");
  if (component === undefined) {
    return [];
  }
  const index = cache.derived("component-animations", () =>
    buildComponentAnimationIndex({
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
// `displayParts` carries the sentence because a host renders the former as the
// body of the panel, which is where a list of files — or of objects — reads as
// one. The sentence is the caller's, since an absolute entry is answered with
// the files declaring it and a relative one with the objects it resolves from.
function provenancePanel(entryName: string, documentation: string): ts.CompletionEntryDetails {
  return {
    name: entryName,
    kind: CONTRIBUTED_ENTRY_KIND,
    kindModifiers: "",
    displayParts: [{ kind: "stringLiteral", text: JSON.stringify(entryName) }],
    documentation: [{ kind: "text", text: documentation }],
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
      // Tried first because the two universes are disjoint by construction and
      // only this one knows which object an entry is relative to; a name it does
      // not carry falls straight through to the declaring-file answer.
      const relative = resolveRelativeEntryProvenance({
        slot,
        position,
        cache,
        fileName,
        entryName,
      });
      if (relative !== undefined) {
        return provenancePanel(entryName, relative);
      }
      const declaredIn = resolveEntryProvenance({ slot, position, cache, fileName, entryName });
      return declaredIn.length === 0
        ? forward()
        : provenancePanel(entryName, `Declared in ${declaredIn.join(", ")}`);
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
            ...objectPathEntries(slot, position, cache, fileName, baseEntries),
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
