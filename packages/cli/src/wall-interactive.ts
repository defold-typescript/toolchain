import type { DirectoryWall } from "./directory-walls";
import { groupSourceScriptKindsBySubtree, nearestWall } from "./directory-walls";
import { selectScriptKind } from "./script-kind";
import { applyWallSelection, currentWalledDirs, eligibleWalls } from "./wall";

export interface WallChoice {
  readonly value: string;
  readonly name: string;
  readonly checked?: boolean;
  readonly disabled?: string | false;
}

// Injected so the dispatch route and tests can substitute a fake; the default is
// `@inquirer/prompts`'s `checkbox`, imported lazily so the prompt module never
// loads on the non-interactive paths.
export type CheckboxPrompt = (opts: {
  message: string;
  choices: WallChoice[];
}) => Promise<string[]>;

export interface WallInteractiveDeps {
  readonly checkbox?: CheckboxPrompt;
}

// One choice per directory that owns sources in its subtree, so the boundary a
// user wants — an ancestor holding no sources of its own — is offerable. A
// selectable dir is exactly an eligible wall, pre-checked to its declared state;
// a dir already governed by an ancestor's wall is annotated with that ancestor
// instead, since checking it would declare a redundant second wall. A mixed-kind
// dir is disabled with its competing kinds, since no single narrowing applies.
export function buildWallChoices(cwd: string): WallChoice[] {
  const declared = new Set(currentWalledDirs(cwd));
  const eligible = eligibleWalls(cwd);
  const declaredWalls = eligible.filter((wall) => declared.has(wall.dir));
  const choices: WallChoice[] = [];
  for (const wall of eligible) {
    if (declared.has(wall.dir)) {
      choices.push({ value: wall.dir, name: `${wall.dir} (${wall.kind})`, checked: true });
      continue;
    }
    const governing = nearestWall(wall.dir, declaredWalls);
    const suffix = governing === null ? "" : ` [inherited from ${governing.dir}]`;
    choices.push({ value: wall.dir, name: `${wall.dir} (${wall.kind})${suffix}`, checked: false });
  }
  const selectable = new Set(eligible.map((wall) => wall.dir));
  for (const [dir, kinds] of groupSourceScriptKindsBySubtree(cwd)) {
    if (selectable.has(dir) || selectScriptKind(kinds) !== null) {
      continue;
    }
    choices.push({ value: dir, name: dir, disabled: `mixed: ${[...kinds].sort().join(", ")}` });
  }
  return choices.sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

async function defaultCheckbox(): Promise<CheckboxPrompt> {
  const { checkbox } = await import("@inquirer/prompts");
  return (opts) => checkbox({ message: opts.message, choices: opts.choices });
}

// Presentation only: the checkbox selection is the desired wall set, reconciled
// to disk through the slice E engine (check = add, uncheck = remove), so the
// interactive and flag paths can never diverge.
export async function runWallInteractive(
  cwd: string,
  deps: WallInteractiveDeps = {},
): Promise<DirectoryWall[]> {
  const checkbox = deps.checkbox ?? (await defaultCheckbox());
  const selection = await checkbox({
    message: "Select the source directories to wall (space toggles, enter confirms):",
    choices: buildWallChoices(cwd),
  });
  return applyWallSelection(cwd, selection);
}
