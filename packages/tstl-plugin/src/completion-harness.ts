import { createTranspileSession } from "@defold-typescript/transpiler";
import ts from "typescript";
import sourceInit from "./index";

// The shape `tsserver` calls: the module value it loads is this function, and
// what that function returns is what owns `create`. Both suites take a factory
// rather than importing one, so the built artifact and the source can be driven
// through the identical host.
export type PluginFactory = (modules: { typescript: typeof import("typescript") }) => {
  create(info: ts.server.PluginCreateInfo): ts.LanguageService;
};

// Two scene sources declaring the ids the completion cases expect to be offered,
// plus the `.gui` that owns `main.ts` — the program's only file, which
// `displayPathOf` reports under that name because it sits at the project root.
export const SCENE_DOCUMENTS: Record<string, string> = {
  "main/board.go": 'components {\n  id: "board"\n  component: "/main/board.gui"\n}\n',
  "main/hud.go": 'components {\n  id: "hud"\n  component: "/main/hud.gui"\n}\n',
  "main/hud.gui":
    'script: "/main.ts.gui_script"\nnodes {\n  id: "score"\n}\nnodes {\n  id: "level"\n}\n',
};

// The host handle a test needs to see the plugin's filesystem work and the
// watchers it registered: `documents` is mutable so a scene can change under a
// live proxy, and `fireDirectory` stands in for the editor reporting it.
export interface ProxyHost {
  documents: Record<string, string>;
  directoryReads: string[][];
  openWatchers: number;
  fireDirectory(hostPath: string): void;
}

export interface CompletionSetup {
  service: ts.LanguageService;
  host: ProxyHost;
  baseDisposeCalls(): number;
  detailsCalls(): unknown[][];
}

export function completionSetup(options: {
  source: string;
  base: ts.WithMetadata<ts.CompletionInfo> | undefined;
  documents?: Record<string, string>;
  serverHost?: boolean;
  watch?: boolean;
  baseDispose?: boolean;
  baseDetails?: ts.CompletionEntryDetails;
  fileName?: string;
  init?: PluginFactory;
}): CompletionSetup {
  const fileName = options.fileName ?? "main.ts";
  const session = createTranspileSession();
  session.update({ [fileName]: options.source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  let baseDisposeCalls = 0;
  const detailsCalls: unknown[][] = [];
  const languageService = {
    getProgram: () => program,
    getSemanticDiagnostics: () => [],
    getCompletionsAtPosition: () => options.base,
    getCompletionEntryDetails: (...args: unknown[]) => {
      detailsCalls.push(args);
      return options.baseDetails;
    },
    ...(options.baseDispose
      ? {
          dispose: () => {
            baseDisposeCalls += 1;
          },
        }
      : {}),
  } as unknown as ts.LanguageService;

  let directoryCallback: ((hostPath: string) => void) | undefined;
  const host: ProxyHost = {
    documents: { ...(options.documents ?? SCENE_DOCUMENTS) },
    directoryReads: [],
    openWatchers: 0,
    fireDirectory: (hostPath) => directoryCallback?.(hostPath),
  };
  const watcher = (onClose: () => void): ts.FileWatcher => {
    host.openWatchers += 1;
    return {
      close: () => {
        host.openWatchers -= 1;
        onClose();
      },
    };
  };
  // The real host filters by the extensions it is handed; a fake that ignored
  // them could not tell the `.go` walk from the `.gui` one.
  const serverHost = {
    readDirectory: (_path: string, extensions?: readonly string[]) => {
      host.directoryReads.push([...(extensions ?? [])]);
      return Object.keys(host.documents)
        .filter((path) => extensions === undefined || extensions.some((ext) => path.endsWith(ext)))
        .map((path) => `/project/${path}`);
    },
    readFile: (path: string) => host.documents[path.replace("/project/", "")],
    ...(options.watch === false
      ? {}
      : {
          watchDirectory: (_path: string, callback: (hostPath: string) => void) => {
            directoryCallback = callback;
            return watcher(() => {
              directoryCallback = undefined;
            });
          },
          watchFile: () => watcher(() => {}),
        }),
  };
  const info = {
    languageService,
    project: { getCurrentDirectory: () => "/project" },
    ...(options.serverHost === false ? {} : { serverHost }),
  } as unknown as ts.server.PluginCreateInfo;
  return {
    service: (options.init ?? sourceInit)({ typescript: ts }).create(info),
    host,
    baseDisposeCalls: () => baseDisposeCalls,
    detailsCalls: () => detailsCalls,
  };
}

export function completionProxy(options: {
  source: string;
  base: ts.WithMetadata<ts.CompletionInfo> | undefined;
  documents?: Record<string, string>;
  serverHost?: boolean;
  fileName?: string;
  init?: PluginFactory;
}): ts.LanguageService {
  return completionSetup(options).service;
}
