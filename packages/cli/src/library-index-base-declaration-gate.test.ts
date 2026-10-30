import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { libraryIndexBaseNotes } from "@defold-typescript/types";
import * as ts from "typescript";
import { emitExtensionDeclarationFromDoc } from "./extension-emit";
import { readLibraryData } from "./library/library-data";
import { LIBRARY_DATA_DIR } from "./library/package-root";
import { printCorpus } from "./library/print-corpus";
import { loadLibraryIndexSlotClassifications } from "./library-registry";

const LIBRARY_TYPES_DIR = join(import.meta.dir, "../../library-types");
const MAP_FILE = "the library data folder's index slots";
const CLASSIFICATIONS = loadLibraryIndexSlotClassifications(LIBRARY_DATA_DIR);

type Lane = "script-api" | "extension" | "luals" | "authored" | "native" | "portal";

// Lanes whose declarations do not yet carry library index notes. Each entry
// leaves once its own emitter notes the classified positions it declares.
// `portal`: `resolve` matches a `.script_api` to its page through
// `defold-extensions.json` only, so an Asset Portal extension's declaration
// names no page.
const PENDING_LANES: ReadonlySet<Lane> = new Set<Lane>(["portal"]);

interface ExtensionManifest {
  libraries: { docs: { page: string }[] }[];
}

const extensionPages = (
  JSON.parse(
    readFileSync(join(LIBRARY_TYPES_DIR, "defold-extensions.json"), "utf8"),
  ) as ExtensionManifest
).libraries.flatMap((library) => library.docs.map((doc) => doc.page));

const portalPages = (
  JSON.parse(
    readFileSync(join(LIBRARY_TYPES_DIR, "asset-portal-script-api.json"), "utf8"),
  ) as ExtensionManifest
).libraries.flatMap((library) => library.docs.map((doc) => doc.page));

const LIBRARIES = readLibraryData(LIBRARY_DATA_DIR);
const scriptApiTargets = LIBRARIES.flatMap((library) => library.scriptApi);
const authoredTargets = LIBRARIES.flatMap((library) => library.authored);
const lualsTargets = LIBRARIES.flatMap((library) => library.luals);

const CORPUS = await printCorpus(LIBRARY_DATA_DIR);

function printed(moduleId: string): string {
  const contents = CORPUS.get(moduleId);
  if (contents === undefined) throw new Error(`library data prints no module ${moduleId}`);
  return contents;
}

const nativeTargets = LIBRARIES.flatMap((library) => library.native);

// The page key each lane gives its libraries, the same key the API reference
// and the classification map use.
function pageLanes(): Map<string, Lane> {
  const lanes = new Map<string, Lane>();
  const claim = (page: string, lane: Lane): void => {
    const owner = lanes.get(page);
    if (owner !== undefined && owner !== lane) {
      throw new Error(`library page "${page}" belongs to both the ${owner} and ${lane} lanes`);
    }
    lanes.set(page, lane);
  };
  for (const target of scriptApiTargets) claim(basename(target.apiDoc, ".json"), "script-api");
  for (const page of extensionPages) claim(page, "extension");
  for (const page of portalPages) claim(page, "portal");
  for (const { namespace } of lualsTargets) claim(namespace, "luals");
  for (const { apiDoc } of authoredTargets) claim(basename(apiDoc, ".json"), "authored");
  for (const { namespace } of nativeTargets) claim(namespace, "native");
  return lanes;
}

interface ClassifiedSlot {
  readonly page: string;
  readonly element: string;
  readonly kind: "param" | "return" | "field";
  readonly slot: string;
}

// One entry per slot holding a native base, itself or through a field, since a
// slot's notes cover all of its classified fields at once.
function classifiedSlots(): ClassifiedSlot[] {
  const slots = new Map<string, ClassifiedSlot>();
  for (const [key, { class: base }] of CLASSIFICATIONS) {
    if (base !== "native-1" && base !== "native-0") continue;
    const page = key.slice(0, key.indexOf("/"));
    const [element = "", kind = "", slot = ""] = key.slice(page.length + 1).split(":");
    if (kind !== "param" && kind !== "return" && kind !== "field") {
      throw new Error(`${key}: unknown slot kind "${kind}" in ${MAP_FILE}`);
    }
    slots.set(`${page}/${element}:${kind}:${slot}`, { page, element, kind, slot });
  }
  return [...slots.values()];
}

// Every function declaration by its dotted path through the nested namespaces
// that hold it; a quoted module name and `declare global` are not part of the
// path.
function functionDeclarations(text: string): Map<string, ts.FunctionDeclaration[]> {
  const source = ts.createSourceFile("library.d.ts", text, ts.ScriptTarget.Latest, true);
  const found = new Map<string, ts.FunctionDeclaration[]>();
  const visit = (node: ts.Node, scope: readonly string[]): void => {
    if (ts.isModuleDeclaration(node)) {
      const global = (node.flags & ts.NodeFlags.GlobalAugmentation) !== 0;
      // A `@globalTable` module's id is its namespace; another module's id is a
      // require path wrapping a namespace of its own.
      const globalTable =
        ts.isStringLiteral(node.name) &&
        ts.getJSDocTags(node).some((tag) => tag.tagName.text === "globalTable");
      const named = (ts.isIdentifier(node.name) && !global) || globalTable;
      const inner = named ? [...scope, node.name.text] : scope;
      if (node.body !== undefined) visit(node.body, inner);
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      const path = [...scope, node.name.text].join(".");
      found.set(path, [...(found.get(path) ?? []), node]);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, scope));
  };
  visit(source, []);
  return found;
}

function slotTagTexts(fn: ts.SignatureDeclarationBase, slot: ClassifiedSlot): string[] {
  return ts
    .getJSDocTags(fn)
    .filter((tag) =>
      slot.kind === "param"
        ? ts.isJSDocParameterTag(tag) && tag.name.getText() === slot.slot
        : ts.isJSDocReturnTag(tag),
    )
    .map((tag) => ts.getTextOfJSDocComment(tag.comment) ?? "");
}

// Every interface member of a LuaLS, authored or native declaration by name,
// with the interface that declares it, plus every function, whether inside
// `declare module '<id>'` or `declare global { namespace <ns> }`; a typedef
// method is keyed by its bare name, so one key reaches every class that
// declares it.
interface DeclaredMembers {
  readonly callables: Map<string, ts.SignatureDeclarationBase[]>;
  readonly fields: Map<string, ts.TypeElement[]>;
}

function declaredMembers(text: string): DeclaredMembers {
  const source = ts.createSourceFile("library.d.ts", text, ts.ScriptTarget.Latest, true);
  const callables = new Map<string, ts.SignatureDeclarationBase[]>();
  const fields = new Map<string, ts.TypeElement[]>();
  const add = <T>(map: Map<string, T[]>, key: string, node: T): void => {
    map.set(key, [...(map.get(key) ?? []), node]);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node)) {
      for (const member of node.members) {
        if (member.name === undefined) continue;
        const name = ts.isStringLiteral(member.name) ? member.name.text : member.name.getText();
        add(fields, `${node.name.text}.${name}`, member);
        if (ts.isMethodSignature(member)) add(callables, name, member);
      }
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      add(callables, node.name.text, node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { callables, fields };
}

// The doc texts a member-checked slot's notes must appear in: one per declaration that
// holds the slot. `undefined` means no declaration holds it.
function memberSlotTexts(members: DeclaredMembers, slot: ClassifiedSlot): string[] | undefined {
  if (slot.kind === "field") {
    const nodes = members.fields.get(`${slot.element}.${slot.slot}`) ?? [];
    if (nodes.length === 0) return undefined;
    return nodes.map((node) =>
      ts
        .getJSDocCommentsAndTags(node)
        .filter(ts.isJSDoc)
        .map((doc) => ts.getTextOfJSDocComment(doc.comment) ?? "")
        .join("\n"),
    );
  }
  const holders = (members.callables.get(slot.element) ?? []).filter((fn) =>
    slot.kind === "param"
      ? fn.parameters.some((param) => param.name.getText() === slot.slot)
      : fn.type !== undefined && fn.type.kind !== ts.SyntaxKind.VoidKeyword,
  );
  if (holders.length === 0) return undefined;
  return holders.map((fn) => slotTagTexts(fn, slot).join("\n"));
}

async function emitLaneDeclaration(page: string, lane: Lane): Promise<string> {
  if (lane === "luals") {
    const target = lualsTargets.find((t) => t.namespace === page);
    if (target === undefined) throw new Error(`no luals target for page ${page}`);
    return printed(target.moduleId);
  }
  if (lane === "script-api") {
    const target = scriptApiTargets.find((t) => basename(t.apiDoc, ".json") === page);
    if (target === undefined) throw new Error(`no script-api target for page ${page}`);
    return printed(target.moduleId);
  }
  if (lane === "authored") {
    const target = authoredTargets.find((t) => basename(t.apiDoc, ".json") === page);
    if (target === undefined) throw new Error(`no authored target for page ${page}`);
    return printed(target.moduleId);
  }
  if (lane === "native") {
    const target = nativeTargets.find((t) => t.namespace === page);
    if (target === undefined) throw new Error(`no native target for page ${page}`);
    return readFileSync(join(LIBRARY_DATA_DIR, target.declaration), "utf8");
  }
  const docDir = lane === "portal" ? "asset-portal-script-api" : "defold-extensions";
  const doc = JSON.parse(
    readFileSync(join(LIBRARY_TYPES_DIR, docDir, "api-doc", `${page}.json`), "utf8"),
  ) as { info: { namespace: string } };
  return (await emitExtensionDeclarationFromDoc(doc, [page], CLASSIFICATIONS)).contents;
}

describe("library index base declaration gate", () => {
  const lanes = pageLanes();
  const slots = classifiedSlots();

  test("every classified page belongs to a lane", () => {
    const orphaned = [...new Set(slots.map((slot) => slot.page))].filter(
      (page) => !lanes.has(page),
    );
    if (orphaned.length > 0) {
      throw new Error(
        `these ${MAP_FILE} pages match no library manifest page:\n${orphaned.join("\n")}`,
      );
    }
  });

  test("every pending lane still owns a classified page", () => {
    const owning = new Set(slots.map((slot) => lanes.get(slot.page)));
    const idle = [...PENDING_LANES].filter((lane) => !owning.has(lane));
    if (idle.length > 0) {
      throw new Error(`drop these lanes from PENDING_LANES; none owns a classified page: ${idle}`);
    }
  });

  test("every classified position of an emit-lane library ships its note in the hover", async () => {
    const byPage = new Map<string, ClassifiedSlot[]>();
    for (const slot of slots) {
      const lane = lanes.get(slot.page);
      if (lane === undefined || PENDING_LANES.has(lane)) continue;
      byPage.set(slot.page, [...(byPage.get(slot.page) ?? []), slot]);
    }
    expect([...byPage.keys()]).toContain("bridge");
    expect([...byPage.keys()]).toContain("spine.gui");
    expect([...byPage.keys()]).toContain("druid");
    for (const page of ["gooey", "node_repeat", "sprite_repeat", "tile_raycast"]) {
      expect([...byPage.keys()]).toContain(page);
    }

    const missing: string[] = [];
    for (const [page, pageSlots] of byPage) {
      const lane = lanes.get(page) as Lane;
      const text = await emitLaneDeclaration(page, lane);
      const byMember = lane === "luals" || lane === "authored" || lane === "native";
      const declarations = byMember ? undefined : functionDeclarations(text);
      const members = byMember ? declaredMembers(text) : undefined;
      for (const slot of pageSlots) {
        const label = `${slot.page}/${slot.element}:${slot.kind}:${slot.slot}`;
        const notes = libraryIndexBaseNotes(
          CLASSIFICATIONS,
          slot.page,
          slot.element,
          slot.kind,
          slot.slot,
        );
        const texts =
          members !== undefined
            ? (memberSlotTexts(members, slot) ?? [])
            : (declarations?.get(slot.element) ?? []).flatMap((fn) => slotTagTexts(fn, slot));
        if (texts.length === 0) {
          missing.push(`${label}: no declared ${slot.kind} tag`);
          continue;
        }
        for (const note of notes) {
          if (!texts.every((text) => text.includes(note))) missing.push(`${label}: ${note}`);
        }
      }
    }
    if (missing.length > 0) {
      throw new Error(`these classified positions lack their note:\n${missing.join("\n")}`);
    }
  });

  test("no emit-lane declaration names Defold as a library index's receiver", async () => {
    const leaking: string[] = [];
    for (const [page, lane] of lanes) {
      if (PENDING_LANES.has(lane)) continue;
      if ((await emitLaneDeclaration(page, lane)).includes("passed to Defold")) leaking.push(page);
    }
    expect(leaking).toEqual([]);
  });
});
