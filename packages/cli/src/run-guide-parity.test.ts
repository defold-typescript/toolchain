import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { targetPlatform } from "./debug-launcher";
import { type EngineMarker, resolveRunnable } from "./engine-launch";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");

const RUN_GUIDE = readFileSync(path.join(REPO_ROOT, "packages/docs/guide/run.md"), "utf8")
  // Fenced blocks would desynchronize the inline-span pairing below.
  .replace(/^```[\s\S]*?^```/gm, "");

// Each quoted sentence is one code span, wrapped across source lines by the
// markdown. Scoping the spans to the bullet that labels the state — rather than
// to the whole page — is what makes the match exact: a page-wide set accepts any
// documented sentence, so two resolver branches could swap messages and stay
// green.
function guideBulletSpans(label: string): Set<string> {
  const lines = RUN_GUIDE.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`- **${label}**`));
  if (start === -1) {
    throw new Error(`run.md has no "- **${label}**" bullet`);
  }
  let end = start + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end] ?? "")) {
    end += 1;
  }
  return new Set(
    Array.from(
      lines
        .slice(start, end)
        .join("\n")
        .matchAll(/`([^`]+)`/g),
      (m) => (m[1] ?? "").replace(/\s+/g, " ").trim(),
    ),
  );
}

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

// The suite covers exactly the states listed here. A fourth `resolveRunnable`
// throw stays undetected until a row is added for it; nothing enumerates the
// throw sites at runtime.
const RESOLVER_STATES: readonly { label: string; sentence: () => string }[] = [
  {
    label: "no compiled project",
    sentence: () =>
      quotedSentence(() =>
        resolveRunnable({ cwd, platform: "darwin", arch: "arm64", probe: () => false }),
      ),
  },
  {
    label: "no engine",
    sentence: () => {
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
      return sentence.replaceAll(platform, "<platform>");
    },
  },
  {
    label: "version disagreement",
    sentence: () =>
      quotedSentence(() =>
        resolveRunnable({
          cwd,
          platform: "darwin",
          arch: "arm64",
          probe: (p) => p === projectc || p === marker,
          readEngineMarker: () => engineMarker("sha-old", "<engine>"),
          readBuildMarker: () => ({ sha: "sha-new", version: "<build>" }),
        }),
      ),
  },
];

describe("run.md quotes each resolver error under its own label", () => {
  for (const state of RESOLVER_STATES) {
    test(state.label, () => {
      const sentence = state.sentence();
      expect([...guideBulletSpans(state.label)]).toContain(sentence);
      for (const other of RESOLVER_STATES) {
        if (other.label === state.label) continue;
        expect([...guideBulletSpans(other.label)]).not.toContain(sentence);
      }
    });
  }
});
