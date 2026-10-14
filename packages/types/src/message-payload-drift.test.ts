import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadApiTargets } from "../scripts/regen";
import { type MessageField, parseMessagesDoc } from "./emit-messages";

const PACKAGE_ROOT = join(import.meta.dir, "..");

function loadCatalogPayloads(): Map<string, MessageField[]> {
  const raw = JSON.parse(readFileSync(join(PACKAGE_ROOT, "fixtures", "messages_doc.json"), "utf8"));
  const byName = new Map<string, MessageField[]>();
  for (const entry of parseMessagesDoc(raw).entries) byName.set(entry.name, entry.payload);
  return byName;
}

interface ReferenceField {
  name: string;
  optional: boolean;
}

interface MessageElement {
  fixture: string;
  name: string;
  fields: ReferenceField[];
}

function collectDefaultTargetMessages(): MessageElement[] {
  const target = loadApiTargets().find((candidate) => candidate.default === true);
  if (!target) throw new Error("api-targets.json declares no default target");
  const elements: MessageElement[] = [];
  for (const module of target.modules) {
    const fixture = join(target.fixturesDir, module.fixture);
    const raw = JSON.parse(readFileSync(join(PACKAGE_ROOT, fixture), "utf8"));
    const docElements = Array.isArray(raw.elements) ? raw.elements : [];
    for (const element of docElements) {
      if (element?.type !== "MESSAGE") continue;
      const params: { name?: unknown; is_optional?: unknown }[] = Array.isArray(element.parameters)
        ? element.parameters
        : [];
      const fields = params
        .filter((p): p is { name: string; is_optional?: unknown } => typeof p?.name === "string")
        .map((p) => ({ name: p.name, optional: p.is_optional === "True" }));
      elements.push({ fixture, name: element.name, fields });
    }
  }
  return elements;
}

describe("message payload ref-doc drift guard", () => {
  const catalog = loadCatalogPayloads();
  const messageElements = collectDefaultTargetMessages();

  test("finds MESSAGE elements to compare in the default target's references", () => {
    expect(messageElements.length).toBeGreaterThan(0);
  });

  test("every reference MESSAGE element exists in the catalog with an exact field-name set", () => {
    for (const element of messageElements) {
      const payload = catalog.get(element.name);
      expect(payload, `${element.fixture}: "${element.name}" missing from catalog`).toBeDefined();
      if (!payload) continue;
      expect(
        payload.map((field) => field.name).sort(),
        `${element.fixture}: "${element.name}" payload field-name set drifted from ref-doc`,
      ).toEqual(element.fields.map((field) => field.name).sort());
    }
  });

  test("every field the reference marks optional is optional in the catalog", () => {
    for (const element of messageElements) {
      const payload = catalog.get(element.name) ?? [];
      for (const field of element.fields.filter((candidate) => candidate.optional)) {
        expect(
          payload.find((candidate) => candidate.name === field.name)?.optional,
          `${element.fixture}: "${element.name}" field "${field.name}" is optional in the ref-doc`,
        ).toBe(true);
      }
    }
  });

  test("play_sound catalog payload includes start_time and start_frame", () => {
    const fields = catalog.get("play_sound")?.map((field) => field.name);
    expect(fields).toContain("start_time");
    expect(fields).toContain("start_frame");
  });
});
