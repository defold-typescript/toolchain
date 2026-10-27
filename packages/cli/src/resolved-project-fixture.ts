import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { loadApiTargetsRegistry } from "./api-registry";
import type { ExtensionDeclarations } from "./extension-declarations";
import { emitExtensionDeclarationFromDoc } from "./extension-emit";
import {
  ensureExtensionTypesReference,
  materializeExtensionDeclarations,
} from "./extension-materialize";
import { ensureLibraryTypesReference, materializeVendoredLibraries } from "./library-materialize";
import { loadVendoredLibraryRegistry, loadVendoredNativeRegistry } from "./library-registry";
import {
  ensureMaterializedReference,
  materializeApiSurface,
  resolveCurrentSurfaceGeneratedDir,
} from "./materialize";
import { DEFAULT_TYPES_ENTRYPOINT } from "./script-kind";

/** The tsconfig `init` leaves before `resolve` adds its `typeRoots` and `types`. */
export const RESOLVED_PROJECT_TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      strict: true,
      types: [DEFAULT_TYPES_ENTRYPOINT],
    },
    include: ["src/**/*.ts"],
  },
  null,
  2,
)}\n`;

/** The `types/` declaration a native extension ships for itself, in module form. */
export const SHIPPED_GLOBAL_TABLE_DTS = [
  "/**",
  " * @noResolution",
  " * @globalTable",
  " */",
  'declare module "pixels" {',
  "  export function fill(color: number): void;",
  "}",
  "",
].join("\n");

/** A script that reaches each kind of declaration `installResolvedDeclarations` installs. */
export const RESOLVED_PROJECT_MAIN = [
  'import { defineScript } from "@defold-typescript/types";',
  'import * as checkpoint from "checkpoint.checkpoint";',
  'import * as pixels from "pixels";',
  'import * as png from "png";',
  'import * as uuid4 from "uuid4";',
  "export default defineScript({",
  "  init() {",
  "    print(uuid4.generate(), checkpoint.project_save_path, png.RGBA);",
  "    pixels.fill(7);",
  "  },",
  "});",
  "",
].join("\n");

function curatedNative(namespace: string): ExtensionDeclarations["declarations"][number] {
  const target = loadVendoredNativeRegistry().find((entry) => entry.namespace === namespace);
  if (target === undefined) {
    throw new Error(`the vendored native registry carries no ${namespace} target`);
  }
  return {
    namespace: target.namespace,
    contents: readFileSync(target.declarationPath, "utf8"),
    dropped: [],
  };
}

function extensionBundle(url: string): ExtensionDeclarations {
  return {
    url,
    provenance: "cache",
    assetOnly: false,
    resolvedVersion: "sha256:stub",
    declarations: [],
    luaModules: [],
    manifestDirs: [],
    sceneSources: [],
    sceneReasons: [],
    sceneRefused: [],
    shipped: [],
  };
}

/**
 * Installs what `resolve` writes for four dependencies — the curated `png`
 * and `uuid4` natives, a native shipping its own `@globalTable` declaration, and the
 * vendored `checkpoint` library — through `resolve`'s own writers, so a test
 * sees the tree and the `tsconfig.json` entries a real resolve leaves.
 */
export function installResolvedDeclarations(cwd: string): void {
  const { materializedDir: extensionsDir } = materializeExtensionDeclarations({
    cwd,
    bundles: [
      {
        ...extensionBundle("https://github.com/britzl/defold-png/archive/refs/tags/1.2.2.zip"),
        declarations: [curatedNative("png")],
      },
      {
        ...extensionBundle("https://github.com/selimanac/defold-uuid4/archive/main.zip"),
        declarations: [curatedNative("uuid4")],
      },
      {
        ...extensionBundle("https://github.com/king8fisher/defold-pixels/archive/main.zip"),
        shipped: [
          { entry: "defold-pixels-main/types/pixels.d.ts", contents: SHIPPED_GLOBAL_TABLE_DTS },
        ],
      },
    ],
  });
  ensureExtensionTypesReference(cwd, extensionsDir);

  const { registry, generatedDir } = loadVendoredLibraryRegistry();
  const checkpoint = registry.find((library) => library.modules.includes("checkpoint.checkpoint"));
  if (checkpoint === undefined) {
    throw new Error("the vendored library registry carries no checkpoint.checkpoint module");
  }
  const { materializedDir: librariesDir } = materializeVendoredLibraries({
    cwd,
    matched: [{ ...checkpoint, modules: ["checkpoint.checkpoint"] }],
    generatedDir,
  });
  ensureLibraryTypesReference(cwd, librariesDir);
}

/** Adds the engine `surfaceId` entry and surface `resolve` writes beside the two above. */
export function installEngineSurface(cwd: string): void {
  const target = loadApiTargetsRegistry().find((candidate) => candidate.default === true);
  if (target === undefined) {
    throw new Error("the API targets registry names no default target");
  }
  const { materializedDir } = materializeApiSurface({
    cwd,
    surface: { surfaceId: target.id, available: true },
    sourceGeneratedDir: resolveCurrentSurfaceGeneratedDir(),
  });
  if (materializedDir === null) {
    throw new Error(`the engine surface ${target.id} did not materialize`);
  }
  ensureMaterializedReference(cwd, materializedDir);
}

/** Writes a project holding only what `init` and `resolve` leave behind. */
export function scaffoldResolvedProject(cwd: string): void {
  const write = (rel: string, contents: string): void => {
    const target = path.join(cwd, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };
  write("tsconfig.json", RESOLVED_PROJECT_TSCONFIG);
  write("src/main.ts", RESOLVED_PROJECT_MAIN);
  installResolvedDeclarations(cwd);
}

const EXTENSION_API_DOCS = path.join(
  import.meta.dir,
  "../../library-types/defold-extensions/api-doc",
);

/**
 * A script importing both dependencies' share of `firebase` and the dotted
 * `rive.cmd`.
 */
export const SCRIPT_API_PROJECT_MAIN = [
  'import { defineScript } from "@defold-typescript/types";',
  'import * as firebase from "firebase";',
  'import * as cmd from "rive.cmd";',
  "export default defineScript({",
  "  init() {",
  "    firebase.initialize();",
  '    firebase.analytics.log("level_up");',
  "    print(cmd.deleteArtboard);",
  "  },",
  "});",
  "",
].join("\n");

/**
 * Writes a project holding what `init` and `resolve` leave for
 * `extension-firebase` and `extension-firebase-analytics`, which share
 * `firebase`, and `extension-rive`, whose `rive.cmd` is dotted: each committed
 * `.script_api` doc through the real emitter and materializer.
 */
export async function scaffoldScriptApiProject(cwd: string): Promise<void> {
  const write = (rel: string, contents: string): void => {
    const target = path.join(cwd, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };
  write("tsconfig.json", RESOLVED_PROJECT_TSCONFIG);
  write("src/main.ts", SCRIPT_API_PROJECT_MAIN);
  const emit = (page: string) =>
    emitExtensionDeclarationFromDoc(
      JSON.parse(readFileSync(path.join(EXTENSION_API_DOCS, `${page}.json`), "utf8")),
      [page],
    );
  const { materializedDir } = materializeExtensionDeclarations({
    cwd,
    bundles: [
      {
        ...extensionBundle("https://github.com/defold/extension-firebase/archive/1.zip"),
        declarations: [await emit("firebase")],
      },
      {
        ...extensionBundle("https://github.com/defold/extension-firebase-analytics/archive/1.zip"),
        declarations: [await emit("firebase-analytics")],
      },
      {
        ...extensionBundle("https://github.com/defold/extension-rive/archive/1.zip"),
        declarations: [await emit("rive.cmd")],
      },
    ],
  });
  ensureExtensionTypesReference(cwd, materializedDir);
}
