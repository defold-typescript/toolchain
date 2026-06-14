export interface FormatJsonOptions {
  readonly lineWidth?: number;
  readonly indentWidth?: number;
}

const DEFAULT_LINE_WIDTH = 100;
const DEFAULT_INDENT_WIDTH = 2;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flat(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return `[${value.map(flat).join(", ")}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return "{}";
    }
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${flat(v)}`).join(", ")} }`;
  }
  return JSON.stringify(value) ?? "null";
}

interface RenderContext {
  readonly lineWidth: number;
  readonly indentWidth: number;
}

function render(
  value: unknown,
  level: number,
  column: number,
  followedByComma: boolean,
  ctx: RenderContext,
): string {
  const flatForm = flat(value);
  const budget = column + flatForm.length + (followedByComma ? 1 : 0);
  if (budget <= ctx.lineWidth || (!Array.isArray(value) && !isPlainObject(value))) {
    return flatForm;
  }

  const childIndent = " ".repeat(ctx.indentWidth * (level + 1));
  const closeIndent = " ".repeat(ctx.indentWidth * level);

  if (Array.isArray(value)) {
    const items = value.map((item, index) => {
      const hasComma = index < value.length - 1;
      return `${childIndent}${render(item, level + 1, childIndent.length, hasComma, ctx)}`;
    });
    return `[\n${items.join(",\n")}\n${closeIndent}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const lines = entries.map(([key, child], index) => {
    const hasComma = index < entries.length - 1;
    const prefix = `${childIndent}${JSON.stringify(key)}: `;
    return `${prefix}${render(child, level + 1, prefix.length, hasComma, ctx)}`;
  });
  return `{\n${lines.join(",\n")}\n${closeIndent}}`;
}

export function formatJsonLikeBiome(value: unknown, opts?: FormatJsonOptions): string {
  const ctx: RenderContext = {
    lineWidth: opts?.lineWidth ?? DEFAULT_LINE_WIDTH,
    indentWidth: opts?.indentWidth ?? DEFAULT_INDENT_WIDTH,
  };
  return render(value, 0, 0, false, ctx);
}
