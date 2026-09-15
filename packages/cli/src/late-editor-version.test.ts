import { describe, expect, test } from "bun:test";
import { createLateEditorVersionCheck } from "./late-editor-version";
import type { EditorVersionNotice } from "./watch";

const BASE_URL = "http://localhost:7777";

function probeSequence(versions: readonly (string | null)[]) {
  let next = 0;
  return async (): Promise<string | null> => versions[next++] ?? null;
}

async function attachEach(
  check: NonNullable<ReturnType<typeof createLateEditorVersionCheck>>,
  times: number,
  accept: (call: number) => boolean = () => true,
): Promise<string[]> {
  const offered: string[] = [];
  for (let call = 0; call < times; call += 1) {
    await check(BASE_URL, new AbortController().signal, (notice: EditorVersionNotice) => {
      offered.push(notice.editor);
      return accept(call);
    });
  }
  return offered;
}

describe("createLateEditorVersionCheck", () => {
  test("a notice the watch declines leaves its version reportable", async () => {
    const check = createLateEditorVersionCheck({
      source: "pin",
      targetVersion: "1.12.4",
      startupVersion: undefined,
      skipFirst: false,
      readVersion: probeSequence(["1.13.0", "1.13.0"]),
      timeoutMs: 1000,
    });

    const offered = await attachEach(check, 2, (call) => call > 0);

    expect(offered).toEqual(["1.13.0", "1.13.0"]);
  });

  test("the version startup compared stays quiet after a late notice", async () => {
    const check = createLateEditorVersionCheck({
      source: "pin",
      targetVersion: "1.12.4",
      startupVersion: "1.13.0",
      skipFirst: false,
      readVersion: probeSequence(["1.14.0", "1.13.0"]),
      timeoutMs: 1000,
    });

    expect(await attachEach(check, 2)).toEqual(["1.14.0"]);
  });

  test("only the last reported version is suppressed", async () => {
    const check = createLateEditorVersionCheck({
      source: "pin",
      targetVersion: "1.12.4",
      startupVersion: undefined,
      skipFirst: false,
      readVersion: probeSequence(["1.13.0", "1.13.0", "1.14.0", "1.13.0"]),
      timeoutMs: 1000,
    });

    expect(await attachEach(check, 4)).toEqual(["1.13.0", "1.14.0", "1.13.0"]);
  });
});
