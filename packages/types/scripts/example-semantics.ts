import ts from "typescript";

/**
 * Runtime-validity rules over the authored example bodies the translation
 * store holds.
 *
 * These read the parsed body rather than its diagnostics. Every defect they
 * name compiles: `render.render_target` takes an open
 * `Record<string | number, unknown>`, a texture specification is an open object
 * literal, and nothing types a handle's lifetime — so the compiler cannot see
 * that `{}` declares no attachment, that `page: 1` addresses a page of a
 * one-page array, or that a handle freed in `update` is freed again next frame.
 *
 * Each rule is scoped to a call it can fully resolve inside the one body: an
 * excerpt that queries a target it never creates reports nothing, so the rules
 * stay green under additive change rather than guessing across bodies.
 */

const REPEATING_HOOKS = new Set(["update", "fixed_update", "late_update"]);

const ATTACHMENT_PREFIX = "graphics.BUFFER_TYPE_";

function parse(body: string): ts.SourceFile {
  return ts.createSourceFile("body.ts", body, ts.ScriptTarget.Latest, true);
}

/** The receiver's dotted text when it is built only from identifiers and property accesses. */
function dottedName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (!ts.isPropertyAccessExpression(node)) return undefined;
  const head = dottedName(node.expression);
  return head === undefined ? undefined : `${head}.${node.name.text}`;
}

/** The dotted callee of a call expression, e.g. `render.delete_render_target`. */
function calleeName(node: ts.CallExpression): string | undefined {
  return dottedName(node.expression);
}

function isCallTo(node: ts.Node, name: string): node is ts.CallExpression {
  return ts.isCallExpression(node) && calleeName(node) === name;
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    walk(child, visit);
  });
}

/**
 * The handle name a call's result is bound to: the declared variable, or the
 * property it is assigned to in a returned state object — the form every
 * script hook's `self` is built from.
 */
function boundName(call: ts.CallExpression): string | undefined {
  const parent = call.parent;
  if (parent === undefined) return undefined;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent)) {
    const key = parent.name;
    if (ts.isIdentifier(key) || ts.isStringLiteral(key)) return key.text;
  }
  return undefined;
}

/** The trailing segment of a reference, so `self.target_right` and `target_right` resolve alike. */
function referencedName(node: ts.Expression): string | undefined {
  const dotted = dottedName(node);
  if (dotted === undefined) return undefined;
  return dotted.slice(dotted.lastIndexOf(".") + 1);
}

function numericProperty(spec: ts.ObjectLiteralExpression, key: string): number | undefined {
  for (const property of spec.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name;
    if (!(ts.isIdentifier(name) || ts.isStringLiteral(name)) || name.text !== key) continue;
    if (!ts.isNumericLiteral(property.initializer)) continue;
    return Number(property.initializer.text);
  }
  return undefined;
}

function propertyValue(spec: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined {
  for (const property of spec.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name;
    if ((ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === key) {
      return property.initializer;
    }
  }
  return undefined;
}

/**
 * A render target handle freed from a hook that runs every frame. The creation
 * sits in `init`, so the second frame frees a handle the engine has already
 * reclaimed.
 */
export function freedHandleReuseDefects(body: string): readonly string[] {
  const defects: string[] = [];
  const source = parse(body);
  const visitHook = (node: ts.Node, hook: string): void => {
    if (isCallTo(node, "render.delete_render_target")) {
      defects.push(`render.delete_render_target frees a handle from the repeating "${hook}" hook`);
    }
    ts.forEachChild(node, (child) => {
      visitHook(child, hook);
    });
  };
  walk(source, (node) => {
    let name: ts.PropertyName | undefined;
    let scope: ts.Node | undefined;
    if (ts.isMethodDeclaration(node)) {
      name = node.name;
      scope = node.body;
    } else if (ts.isPropertyAssignment(node) && ts.isFunctionLike(node.initializer)) {
      name = node.name;
      scope = node.initializer;
    }
    if (name === undefined || scope === undefined) return;
    if (!ts.isIdentifier(name) || !REPEATING_HOOKS.has(name.text)) return;
    visitHook(scope, name.text);
  });
  return defects;
}

/** Every render target created in the body, keyed by the handle name it is bound to. */
function renderTargetSpecs(source: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
  const specs = new Map<string, ts.ObjectLiteralExpression>();
  walk(source, (node) => {
    if (!isCallTo(node, "render.render_target")) return;
    const name = boundName(node);
    if (name === undefined) return;
    // Named targets carry the specification second; the unnamed overload first.
    const spec = node.arguments.find((argument) => ts.isObjectLiteralExpression(argument));
    if (spec === undefined || !ts.isObjectLiteralExpression(spec)) return;
    specs.set(name, spec);
  });
  return specs;
}

/** The `graphics.BUFFER_TYPE_*` attachments a specification declares as computed keys. */
function declaredAttachments(spec: ts.ObjectLiteralExpression): Set<string> {
  const declared = new Set<string>();
  for (const property of spec.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = property.name;
    if (!ts.isComputedPropertyName(name)) continue;
    const key = dottedName(name.expression);
    if (key !== undefined) declared.add(key);
  }
  return declared;
}

/**
 * A dimension query naming an attachment its own target never declared. The
 * query compiles against any target, so only the specification says whether the
 * buffer it asks for exists.
 */
export function undeclaredAttachmentQueryDefects(body: string): readonly string[] {
  const source = parse(body);
  const specs = renderTargetSpecs(source);
  if (specs.size === 0) return [];
  const defects: string[] = [];
  walk(source, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = calleeName(node);
    if (
      callee !== "render.get_render_target_width" &&
      callee !== "render.get_render_target_height"
    ) {
      return;
    }
    const [target, attachment] = node.arguments;
    if (target === undefined || attachment === undefined) return;
    const handle = referencedName(target);
    const spec = handle === undefined ? undefined : specs.get(handle);
    if (spec === undefined) return;
    const queried = dottedName(attachment);
    if (queried === undefined || !queried.startsWith(ATTACHMENT_PREFIX)) return;
    if (declaredAttachments(spec).has(queried)) return;
    defects.push(`${callee} queries ${queried}, which "${handle}" does not declare`);
  });
  return defects;
}

interface TexturePageWrite {
  handle: string;
  page: number;
  creation: ts.ObjectLiteralExpression;
  buffer: ts.Expression | undefined;
}

/** Every texture created in the body, keyed by the handle name it is bound to. */
function createdTextures(source: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
  const created = new Map<string, ts.ObjectLiteralExpression>();
  walk(source, (node) => {
    if (!isCallTo(node, "resource.create_texture")) return;
    const name = boundName(node);
    if (name === undefined) return;
    const spec = node.arguments.find((argument) => ts.isObjectLiteralExpression(argument));
    if (spec === undefined || !ts.isObjectLiteralExpression(spec)) return;
    created.set(name, spec);
  });
  return created;
}

/** Page writes whose target resolves to a creation in the same body. */
function resolvedPageWrites(source: ts.SourceFile): TexturePageWrite[] {
  const created = createdTextures(source);
  if (created.size === 0) return [];
  const writes: TexturePageWrite[] = [];
  walk(source, (node) => {
    if (!isCallTo(node, "resource.set_texture")) return;
    const [target, spec, buffer] = node.arguments;
    if (target === undefined || spec === undefined) return;
    if (!ts.isObjectLiteralExpression(spec)) return;
    const page = numericProperty(spec, "page");
    if (page === undefined) return;
    const handle = referencedName(target);
    const creation = handle === undefined ? undefined : created.get(handle);
    if (handle === undefined || creation === undefined) return;
    writes.push({ handle, page, creation, buffer });
  });
  return writes;
}

/**
 * A page written past the end of the array it belongs to: the creation either
 * declares no `page_count` at all — a one-page array — or one too small to hold
 * the index the write addresses.
 */
export function unbackedTexturePageDefects(body: string): readonly string[] {
  const defects: string[] = [];
  for (const write of resolvedPageWrites(parse(body))) {
    const pageCount = numericProperty(write.creation, "page_count");
    if (pageCount !== undefined && pageCount > write.page) continue;
    const declared = pageCount === undefined ? "no page_count" : `page_count: ${pageCount}`;
    defects.push(
      `resource.set_texture writes page ${write.page} of "${write.handle}", created with ${declared}`,
    );
  }
  return defects;
}

/** The identifiers bound to a decoded image in this body. */
function decodedImages(source: ts.SourceFile): Set<string> {
  const decoded = new Set<string>();
  walk(source, (node) => {
    if (!isCallTo(node, "image.load_buffer")) return;
    const name = boundName(node);
    if (name !== undefined) decoded.add(name);
  });
  return decoded;
}

/**
 * An array texture created at dimensions detached from the image it is written
 * from. The write supplies the decoded buffer's own `width` and `height`, so a
 * creation carrying literals claims a size the data does not have.
 */
export function arrayTextureDimensionDefects(body: string): readonly string[] {
  const source = parse(body);
  const decoded = decodedImages(source);
  if (decoded.size === 0) return [];
  const defects: string[] = [];
  for (const write of resolvedPageWrites(source)) {
    // The write is fed from a decoded image only when its buffer argument is
    // rooted in one — read independently of what the creation declares.
    const rooted = write.buffer === undefined ? undefined : dottedName(write.buffer);
    const image = rooted?.slice(0, rooted.indexOf(".") === -1 ? undefined : rooted.indexOf("."));
    if (image === undefined || !decoded.has(image)) continue;
    for (const dimension of ["width", "height"] as const) {
      const value = propertyValue(write.creation, dimension);
      const source = value === undefined ? undefined : dottedName(value);
      if (source === `${image}.${dimension}`) continue;
      defects.push(
        `resource.create_texture declares ${dimension} ${value === undefined ? "nowhere" : value.getText()}, not the decoded "${image}.${dimension}"`,
      );
    }
  }
  return defects;
}
