import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  buildGuiNodeIndex,
  buildSceneComponentIndex,
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
  buildSceneCompletionEntries,
  buildWholeLiteralCompletionEntries,
} from "./scene-completions";
import { displayPathOf, readSceneDocuments, type SceneReadHost } from "./scene-documents";

const GUI_EXTENSIONS = [".gui"];

// A third extension set, disjoint from the other two: an atlas declares
// animation names, not component ids or node ids.
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
  host: SceneReadHost,
  projectRoot: string,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  if (slot.fragmentStart === -1 || position < slot.fragmentStart) {
    return [];
  }
  const { documents } = readSceneDocuments(host, projectRoot);
  // A partial universe still suggests — unlike the reachability report, a
  // suggestion claims nothing about what is absent.
  return buildSceneCompletionEntries({
    slot,
    ids: buildSceneComponentIndex(documents).ids,
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
  host: SceneReadHost,
  projectRoot: string,
  fileName: string,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  const { documents } = readSceneDocuments(host, projectRoot, GUI_EXTENSIONS);
  const config = readBuildConfigFromHost(host, projectRoot);
  const resource = computeOutputRel(displayPathOf(projectRoot, fileName), config, "gui-script");
  const ids = buildGuiNodeIndex(documents).byScriptResource.get(resource);
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
  host: SceneReadHost,
  projectRoot: string,
  fileName: string,
  baseEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
  const component = componentIdOfSameObjectAddress(slot.addressText ?? "");
  if (component === undefined) {
    return [];
  }
  const { documents: scenes } = readSceneDocuments(host, projectRoot);
  const { documents: assets } = readSceneDocuments(host, projectRoot, ANIMATION_ASSET_EXTENSIONS);
  const config = readBuildConfigFromHost(host, projectRoot);
  const resource = computeOutputRel(displayPathOf(projectRoot, fileName), config, "script");
  const ids = buildSpriteAnimationIndex({ scenes, assets })
    .byScriptResource.get(resource)
    ?.get(component);
  return ids === undefined ? [] : buildWholeLiteralCompletionEntries({ slot, ids, baseEntries });
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
      const serverHost = info.serverHost as SceneReadHost | undefined;
      if (!serverHost?.readDirectory) {
        return prior;
      }
      const projectRoot = info.project.getCurrentDirectory();

      // Rebuilt per request, deliberately: completions only fire inside a
      // classified slot, and a cache without watch facilities would go stale
      // exactly the way a generated declaration does.
      const baseEntries = prior?.entries ?? [];
      const entries = isAddressClass(slot.class)
        ? componentEntries(slot, position, serverHost, projectRoot, baseEntries)
        : slot.class === "gui-node"
          ? nodeEntries(slot, serverHost, projectRoot, fileName, baseEntries)
          : slot.class === "animation"
            ? animationEntries(slot, serverHost, projectRoot, fileName, baseEntries)
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
