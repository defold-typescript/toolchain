import { engineIndexBaseTable } from "@defold-typescript/types";

// A guide line that stands for content generated from the types package, so the
// guide cannot drift from the table it describes. The source keeps the comment;
// every reader surface expands it.
const DIRECTIVES: Readonly<Record<string, () => string>> = {
  "<!-- engine-index-base-table -->": () => engineIndexBaseTable(),
};

export function expandGuideDirectives(body: string): string {
  return body
    .split("\n")
    .map((line) => DIRECTIVES[line.trim()]?.() ?? line)
    .join("\n");
}
