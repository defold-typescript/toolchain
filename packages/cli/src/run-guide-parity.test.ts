import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { targetPlatform } from "./debug-launcher";
import { type EngineMarker, resolveRunnable } from "./engine-launch";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");

// Each quoted sentence is one code span, wrapped across source lines by the
// markdown. Comparing against the span set rather than the whole page keeps the
// match exact: a resolver message shortened to a prefix of what the guide
// quotes would still be `toContain`ed by the page.
const RUN_GUIDE_CODE_SPANS = new Set(
  Array.from(
    readFileSync(path.join(REPO_ROOT, "packages/docs/guide/run.md"), "utf8")
      // Fenced blocks would desynchronize the inline-span pairing below.
      .replace(/^```[\s\S]*?^```/gm, "")
      .matchAll(/`([^`]+)`/g),
    (m) => (m[1] ?? "").replace(/\s+/g, " ").trim(),
  ),
);

const cwd = "/proj";
const projectc = path.join(cwd, "build/default/game.projectc");
const marker = "/cache/stock/dmengine";
const ERROR_PREFIX = "defold-typescript run: ";

const engineMarker = (sha: string | null, version: string | null): EngineMarker => ({
  enginePath: marker,
  sha,
  version,
});

// The guide quotes each resolver sentence inside a code span and leaves the
// sentence's final period outside it, so the quotable half is the thrown
// message minus its command prefix and trailing period.
function quotedSentence(run: () => unknown): string {
  let message = "";
  try {
    run();
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message.startsWith(ERROR_PREFIX)).toBe(true);
  return message.slice(ERROR_PREFIX.length).replace(/\.$/, "");
}

describe("run.md quotes the resolver errors verbatim", () => {
  test("no compiled project", () => {
    const sentence = quotedSentence(() =>
      resolveRunnable({ cwd, platform: "darwin", arch: "arm64", probe: () => false }),
    );
    expect([...RUN_GUIDE_CODE_SPANS]).toContain(sentence);
  });

  test("no engine, with the resolved platform standing in for the guide's placeholder", () => {
    const platform = targetPlatform("darwin", "arm64").enginePlatform;
    const sentence = quotedSentence(() =>
      resolveRunnable({
        cwd,
        platform: "darwin",
        arch: "arm64",
        probe: (p) => p === projectc,
        readEngineMarker: () => null,
      }),
    );
    expect(sentence).toContain(platform);
    expect([...RUN_GUIDE_CODE_SPANS]).toContain(sentence.replaceAll(platform, "<platform>"));
  });

  test("version disagreement", () => {
    const sentence = quotedSentence(() =>
      resolveRunnable({
        cwd,
        platform: "darwin",
        arch: "arm64",
        probe: (p) => p === projectc || p === marker,
        readEngineMarker: () => engineMarker("sha-old", "<engine>"),
        readBuildMarker: () => ({ sha: "sha-new", version: "<build>" }),
      }),
    );
    expect([...RUN_GUIDE_CODE_SPANS]).toContain(sentence);
  });
});
