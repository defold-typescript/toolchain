import { describeDetectedPinMismatch } from "./defold-target";
import type { RunWatchOptions } from "./watch";

export interface LateEditorVersionCheckOptions {
  readonly source: "pin" | "detected" | "default";
  readonly targetVersion: string;
  /** The editor version startup already compared against the target, if any. */
  readonly startupVersion: string | undefined;
  /** Startup asked this very editor, so its first attach would repeat the question. */
  readonly skipFirst: boolean;
  readonly readVersion: (signal: AbortSignal) => Promise<string | null>;
  readonly timeoutMs: number;
}

/**
 * The surface is fixed for the whole watch, so an editor that attaches later is
 * only diagnosed. A version is not repeated when it matches the target, the
 * version startup compared, or the last one the watch reported; a notice the
 * watch declines is not recorded, so its version stays reportable.
 */
export function createLateEditorVersionCheck(
  opts: LateEditorVersionCheckOptions,
): NonNullable<RunWatchOptions["editorAttached"]> {
  const { source, targetVersion, startupVersion, readVersion, timeoutMs } = opts;
  let lastReported: string | undefined;
  let skipNext = opts.skipFirst;

  const probeLateEditor = async (signal: AbortSignal): Promise<string | null> => {
    if (signal.aborted) return null;
    const probe = new AbortController();
    const abort = (): void => probe.abort();
    const timer = setTimeout(abort, timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    try {
      // The race ends a wait the transport itself does not honor.
      return await Promise.race([
        readVersion(probe.signal).catch(() => null),
        new Promise<null>((resolve) => {
          probe.signal.addEventListener("abort", () => resolve(null));
        }),
      ]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  };

  return async (baseUrl, signal, report): Promise<void> => {
    if (skipNext) {
      skipNext = false;
      return;
    }
    const version = await probeLateEditor(signal);
    if (
      version === null ||
      version === targetVersion ||
      version === startupVersion ||
      version === lastReported
    )
      return;
    const message =
      source === "pin"
        ? describeDetectedPinMismatch(version, targetVersion)[0]
        : `the Defold editor at ${baseUrl} runs ${version}, but this watch resolved its API surface for ${targetVersion}; restart watch to follow the editor.`;
    if (message === undefined) return;
    if (report({ message, editor: version, target: targetVersion, targetSource: source })) {
      lastReported = version;
    }
  };
}
