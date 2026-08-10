import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSceneTextFormat,
  type SceneMessage,
} from "../packages/transpiler/src/scene-text-format";

const repoRoot = join(import.meta.dir, "..");
const examplesDir = join(repoRoot, "docs/examples");

function sceneFiles(): string[] {
  return readdirSync(examplesDir, { recursive: true })
    .map(String)
    .filter((rel) => rel.endsWith(".go") || rel.endsWith(".collection"))
    .sort();
}

function must(message: SceneMessage | undefined): SceneMessage {
  if (message === undefined) throw new Error("expected a message");
  return message;
}

function field(message: SceneMessage, key: string): string {
  const value = message.fields.get(key)?.[0];
  if (value === undefined) throw new Error(`expected a \`${key}\` value`);
  return value;
}

function findById(parent: SceneMessage, key: string, id: string): SceneMessage | undefined {
  return parent.messages.get(key)?.find((message) => message.fields.get("id")?.[0] === id);
}

describe("scene corpus", () => {
  const files = sceneFiles();

  test("the committed examples ship .go/.collection specimens to parse", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)("%s parses", (rel) => {
    const document = parseSceneTextFormat(readFileSync(join(examplesDir, rel), "utf8"));

    expect(document.fields.size + document.messages.size).toBeGreaterThan(0);
  });

  test("the platformer collection reaches every id through its embedded payload", () => {
    const document = parseSceneTextFormat(
      readFileSync(join(examplesDir, "platformer/game/game.collection"), "utf8"),
    );

    const player = must(findById(document, "collection_instances", "player"));
    expect(field(player, "collection")).toBe("/game/player.collection");

    const level = must(findById(document, "embedded_instances", "level"));
    const payload = parseSceneTextFormat(field(level, "data"));

    const levelComponent = must(findById(payload, "components", "level"));
    expect(field(levelComponent, "component")).toBe("/game/level.tilemap");
    expect(findById(payload, "embedded_components", "collisionobject")).toBeDefined();
  });
});
