import { fetchChannelInfo } from "../packages/cli/src/defold-target.ts";
import { CURRENT_STABLE_DEFOLD_VERSION } from "../packages/cli/src/defold-version.ts";
import { compareSemver } from "../packages/cli/src/upgrade.ts";
import { classifyTransition, type ReleaseTransition } from "./release-model.ts";

// Checks the upstream stable channel for a release the pinned surface has not
// adopted yet. Nothing else in the repo looks outward: `bump:defold --check` and
// `release-readiness` both gate evidence for a bump already made, so without this
// the only trigger for a rotation is a maintainer noticing.
//
// The stable channel head is the correct source precisely because it never
// advertises the `-beta`/`-alpha` tags that would otherwise fire this every few
// weeks (`d.defold.com/stable/info.json`).

export type DriftReason = "drifted" | "current" | "behind" | "prerelease";

export interface UpstreamReport {
  readonly command: "upstream:release-check";
  readonly pinned: string;
  readonly upstream: string;
  readonly actionable: boolean;
  readonly reason: DriftReason;
  readonly transition?: ReleaseTransition;
  readonly issueTitle?: string;
  readonly issueBody?: string;
}

// Keyed on the upstream version alone so a rerun before the bump lands finds the
// issue it opened last time; folding the pinned version in would mint a second
// issue the moment anything else rotated the pin.
export function issueTitleFor(upstream: string): string {
  return `Defold ${upstream} released — bump the pinned target`;
}

function issueBodyFor(pinned: string, upstream: string, transition: ReleaseTransition): string {
  const demotion =
    transition === "minor"
      ? `\`${pinned}\` is demoted to a committed historical surface under \`packages/types/generated/versions/\`.`
      : `\`${pinned}\` is replaced in place — a patch keeps no historical surface for it.`;
  return [
    `The upstream stable channel now heads at **${upstream}**; the pinned target is **${pinned}**.`,
    "",
    `This is a **${transition}** transition. ${demotion}`,
    "",
    "```sh",
    `bun run bump:defold --to ${upstream}`,
    "bun run bump:defold --check",
    "```",
    "",
    "The bump reports the decisions it deliberately will not make — curating",
    "`api-migrations.json`, re-confirming the import and extension release tags, and",
    "authoring the upgrade guide. See *Bump the pinned Defold version* in",
    "`packages/docs/guide/agent-runbooks.md`.",
    "",
    "_Opened automatically by `defold-upstream-check`._",
  ].join("\n");
}

// A channel head that is equal to, older than, or a prerelease of the pin is not
// actionable. Older sounds impossible, but a channel rollback would otherwise
// open an issue asking for a downgrade the release model cannot express.
export function evaluateDrift(pinned: string, upstream: string): UpstreamReport {
  const base = { command: "upstream:release-check", pinned, upstream } as const;
  if (upstream.includes("-")) {
    return { ...base, actionable: false, reason: "prerelease" };
  }
  const ordering = compareSemver(upstream, pinned);
  if (ordering === 0) {
    return { ...base, actionable: false, reason: "current" };
  }
  if (ordering < 0) {
    return { ...base, actionable: false, reason: "behind" };
  }
  const transition = classifyTransition(pinned, upstream);
  return {
    ...base,
    actionable: true,
    reason: "drifted",
    transition,
    issueTitle: issueTitleFor(upstream),
    issueBody: issueBodyFor(pinned, upstream, transition),
  };
}

export function describeReport(report: UpstreamReport): string {
  switch (report.reason) {
    case "drifted":
      return `upstream:release-check — upstream stable ${report.upstream} is ahead of the pinned ${report.pinned} (${report.transition})\n`;
    case "current":
      return `upstream:release-check — pinned ${report.pinned} matches upstream stable\n`;
    case "behind":
      return `upstream:release-check — upstream stable ${report.upstream} is behind the pinned ${report.pinned}; nothing to do\n`;
    case "prerelease":
      return `upstream:release-check — upstream stable resolved to the prerelease ${report.upstream}; nothing to do\n`;
  }
}

export interface UpstreamCheckIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly fetchStableHead: () => Promise<{ version: string }>;
}

// Exit 0 whether or not there is drift: drift is a finding to report, not a
// failure. Only an unreachable channel is an error, so a scheduled run stays
// quiet until upstream actually moves and still goes red if the fetch breaks.
export async function runUpstreamCheckCli(
  argv: string[],
  io: UpstreamCheckIo,
  pinned: string = CURRENT_STABLE_DEFOLD_VERSION,
): Promise<number> {
  const json = argv.includes("--json");
  let head: { version: string };
  try {
    head = await io.fetchStableHead();
  } catch (error) {
    io.stderr(
      `upstream:release-check FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
  const report = evaluateDrift(pinned, head.version);
  io.stdout(json ? `${JSON.stringify(report)}\n` : describeReport(report));
  return 0;
}

if (import.meta.main) {
  const io: UpstreamCheckIo = {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    fetchStableHead: () => fetchChannelInfo("stable"),
  };
  process.exit(await runUpstreamCheckCli(process.argv.slice(2), io));
}
