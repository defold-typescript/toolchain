// The guide names `src/` as where TypeScript sources live on fifteen pages; the
// scope is really the `include` globs in `tsconfig.json`. That fact is authored
// into each page as a GitHub footnote definition so the raw `guide/*.md` shipped
// to consumers stays self-contained, which makes this constant the single owner
// the copies are checked against.
export const SRC_ROOT_FOOTNOTE_ID = "src-root";

export const SRC_ROOT_FOOTNOTE_LINE = `[^${SRC_ROOT_FOOTNOTE_ID}]: \`src/\` is this guide's shorthand and the scaffold's default, not a fixed location. Your source roots are the \`include\` globs in \`tsconfig.json\` — \`["src/**/*.ts"]\` out of the box, and any list of folders you set; \`build\` and \`watch\` compile exactly what those globs match, and ignore \`exclude\`.`;

const DEFINITION = new RegExp(`^\\[\\^${SRC_ROOT_FOOTNOTE_ID}\\]:`);

// Mirrors the fence tracker in `stripGuideChrome` (`scripts/build-llms.ts`): a
// definition-looking line inside fenced code is sample text, not a note.
const FENCE_TOKEN = /^\s*(`{3,}|~{3,})(.*)$/;

export function stripSrcRootDefinitions(body: string): string {
  let fence: string | null = null;
  let removed = false;
  // A definition is authored on its own line after a blank one, so dropping it
  // leaves a doubled blank behind. Swallow that single blank at the removal
  // site: normalizing whitespace across the whole document would also rewrite
  // authored blank runs elsewhere, including inside fenced code.
  let swallowBlank = false;
  const kept: string[] = [];
  for (const line of body.split("\n")) {
    if (swallowBlank) {
      swallowBlank = false;
      if (line === "") continue;
    }
    const token = FENCE_TOKEN.exec(line);
    const marker = token?.[1] ?? "";
    const rest = token?.[2] ?? "";
    if (fence === null) {
      // A backtick fence's info string may not itself contain a backtick, so
      // prose that merely quotes a fence inline does not open a code block.
      if (marker && !(marker[0] === "`" && rest.includes("`"))) {
        fence = marker;
        kept.push(line);
        continue;
      }
    } else {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && rest.trim() === "") {
        fence = null;
      }
      kept.push(line);
      continue;
    }
    if (DEFINITION.test(line)) {
      removed = true;
      swallowBlank = (kept.at(-1) ?? "") === "";
      continue;
    }
    kept.push(line);
  }
  if (!removed) return body;
  return kept.join("\n");
}
