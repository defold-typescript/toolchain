import { describe, expect, test } from "bun:test";
import {
  arrayTextureDimensionDefects,
  freedHandleReuseDefects,
  unbackedTexturePageDefects,
  undeclaredAttachmentQueryDefects,
} from "./example-semantics";
import { loadTranslations } from "./example-store-io";

const store = loadTranslations();

function defectsAcrossStore(
  rule: (body: string) => readonly string[],
): readonly { fqn: string; defect: string }[] {
  const found: { fqn: string; defect: string }[] = [];
  for (const [fqn, entries] of Object.entries(store)) {
    const seen = new Set<string>();
    for (const entry of entries) {
      for (const defect of rule(entry.ts)) {
        if (seen.has(defect)) continue;
        seen.add(defect);
        found.push({ fqn, defect });
      }
    }
  }
  return found;
}

function report(defects: readonly { fqn: string; defect: string }[]): string[] {
  return defects.map(({ fqn, defect }) => `${fqn}: ${defect}`);
}

describe("example semantics", () => {
  test("a render target handle is not freed from a repeating hook", () => {
    expect(report(defectsAcrossStore(freedHandleReuseDefects))).toEqual([]);
  });

  test("a queried attachment is one the target's specification declares", () => {
    expect(report(defectsAcrossStore(undeclaredAttachmentQueryDefects))).toEqual([]);
  });

  test("a written texture page is one the created array contains", () => {
    expect(report(defectsAcrossStore(unbackedTexturePageDefects))).toEqual([]);
  });

  test("an array texture is created at the dimensions of the image it is written from", () => {
    expect(report(defectsAcrossStore(arrayTextureDimensionDefects))).toEqual([]);
  });
});

const TEXTURE_SPEC_BINDINGS = `const type = graphics.TEXTURE_TYPE_2D_ARRAY;
const format = graphics.TEXTURE_FORMAT_RGBA;
const width = 128;
const height = 128;
`;

describe("binding resolution", () => {
  test("a page held by a binding is read against a creation declaring no page_count", () => {
    const body = `${TEXTURE_SPEC_BINDINGS}const page = 1;
const t = resource.create_texture("/t.texturec", { type, width, height, format });
resource.set_texture(t, { type, width, height, page, format }, buf);
`;
    expect(unbackedTexturePageDefects(body)).toEqual([
      'resource.set_texture writes page 1 of "t", created with no page_count',
    ]);
  });

  test("a page_count held by a binding is read against the page the write addresses", () => {
    const body = `${TEXTURE_SPEC_BINDINGS}const pages = 1;
const page = 1;
const t = resource.create_texture("/t.texturec", { type, width, height, page_count: pages, format });
resource.set_texture(t, { type, width, height, page, format }, buf);
`;
    expect(unbackedTexturePageDefects(body)).toEqual([
      'resource.set_texture writes page 1 of "t", created with page_count: 1',
    ]);
  });

  test("page zero is held by a creation declaring no page_count", () => {
    const body = `${TEXTURE_SPEC_BINDINGS}const page = 0;
const t = resource.create_texture("/t.texturec", { type, width, height, format });
resource.set_texture(t, { type, width, height, page, format }, buf);
`;
    expect(unbackedTexturePageDefects(body)).toEqual([]);
  });

  test("a page_count declared as zero is read as written, not widened to one", () => {
    const body = `${TEXTURE_SPEC_BINDINGS}const page = 0;
const t = resource.create_texture("/t.texturec", { type, width, height, page_count: 0, format });
resource.set_texture(t, { type, width, height, page, format }, buf);
`;
    expect(unbackedTexturePageDefects(body)).toEqual([
      'resource.set_texture writes page 0 of "t", created with page_count: 0',
    ]);
  });

  test("an attachment held by a binding is tested against an inline specification", () => {
    const body = `const color = graphics.BUFFER_TYPE_COLOR0_BIT;
const rt = render.render_target("shadow", { [graphics.BUFFER_TYPE_DEPTH_BIT]: depth_params });
const w = render.get_render_target_width(rt, color);
`;
    expect(undeclaredAttachmentQueryDefects(body)).toEqual([
      'render.get_render_target_width queries graphics.BUFFER_TYPE_COLOR0_BIT, which "rt" does not declare',
    ]);
  });

  test("an attachment held by a binding is tested against a variable-held specification", () => {
    const body = `const color = graphics.BUFFER_TYPE_COLOR0_BIT;
const spec = { [graphics.BUFFER_TYPE_DEPTH_BIT]: depth_params };
const rt = render.render_target("shadow", spec);
const w = render.get_render_target_width(rt, color);
`;
    expect(undeclaredAttachmentQueryDefects(body)).toEqual([
      'render.get_render_target_width queries graphics.BUFFER_TYPE_COLOR0_BIT, which "rt" does not declare',
    ]);
  });

  test("an attachment a computed key holds by binding counts as declared", () => {
    const body = `const color = graphics.BUFFER_TYPE_COLOR0_BIT;
const rt = render.render_target("scene", { [color]: color_params });
const w = render.get_render_target_width(rt, color);
`;
    expect(undeclaredAttachmentQueryDefects(body)).toEqual([]);
  });

  test("a variable-held creation specification is read by both texture rules", () => {
    const body = `${TEXTURE_SPEC_BINDINGS}const buf = image.load_buffer(data);
const tparams = { type, width, height, format };
const t = resource.create_texture("/t.texturec", tparams);
resource.set_texture(t, { type, width: buf.width, height: buf.height, page: 1, format }, buf.buffer);
`;
    expect(unbackedTexturePageDefects(body)).toEqual([
      'resource.set_texture writes page 1 of "t", created with no page_count',
    ]);
    expect(arrayTextureDimensionDefects(body)).toEqual([
      'resource.create_texture declares width 128, not the decoded "buf.width"',
      'resource.create_texture declares height 128, not the decoded "buf.height"',
    ]);
  });

  test("creation dimensions held by bindings are read through to their literals", () => {
    const body = `const type = graphics.TEXTURE_TYPE_2D_ARRAY;
const format = graphics.TEXTURE_FORMAT_RGBA;
const width = 64;
const height = 64;
const buf = image.load_buffer(data);
const t = resource.create_texture("/t.texturec", { type, width, height, page_count: 2, format });
resource.set_texture(t, { type, width: buf.width, height: buf.height, page: 1, format }, buf.buffer);
`;
    expect(arrayTextureDimensionDefects(body)).toEqual([
      'resource.create_texture declares width 64, not the decoded "buf.width"',
      'resource.create_texture declares height 64, not the decoded "buf.height"',
    ]);
  });
});

describe("freed handle scoping", () => {
  test("a handle created in init and freed from a repeating hook is a defect", () => {
    const body = `export default defineRenderScript({
  init() {
    return { rt: render.render_target("target", {}) };
  },

  update(self) {
    render.delete_render_target(self.rt);
  },
});
`;
    expect(freedHandleReuseDefects(body)).toEqual([
      'render.delete_render_target frees a handle from the repeating "update" hook',
    ]);
  });

  test("a handle created and freed inside the same invocation is not a defect", () => {
    const body = `export default defineRenderScript({
  update(self) {
    const rt = render.render_target("scratch", {});
    render.set_render_target(rt);
    render.delete_render_target(rt);
  },
});
`;
    expect(freedHandleReuseDefects(body)).toEqual([]);
  });

  test("a freed handle the body never creates is ignored", () => {
    const body = `export default defineRenderScript({
  update(self) {
    render.delete_render_target(self.rt);
  },
});
`;
    expect(freedHandleReuseDefects(body)).toEqual([]);
  });
});
