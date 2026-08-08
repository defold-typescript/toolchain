import { describe, expect, test } from "bun:test";
import { CURRENT_STABLE_DEFOLD_VERSION } from "../packages/cli/src/defold-version.ts";
import {
  describeReport,
  evaluateDrift,
  issueTitleFor,
  runUpstreamCheckCli,
  type UpstreamCheckIo,
  type UpstreamReport,
} from "./defold-upstream-check.ts";

function collectingIo(head: () => Promise<{ version: string }>): UpstreamCheckIo & {
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    fetchStableHead: head,
  };
}

describe("evaluateDrift", () => {
  test("a newer upstream patch is actionable and classified", () => {
    const report = evaluateDrift("1.13.0", "1.13.1");
    expect(report.actionable).toBe(true);
    expect(report.reason).toBe("drifted");
    expect(report.transition).toBe("patch");
    expect(report.issueBody).toContain("bun run bump:defold --to 1.13.1");
  });

  test("a newer upstream minor is classified as minor and names the demotion", () => {
    const report = evaluateDrift("1.13.0", "1.14.0");
    expect(report.transition).toBe("minor");
    expect(report.issueBody).toContain("generated/versions/");
  });

  test("a patch body says the prior version keeps no historical surface", () => {
    expect(evaluateDrift("1.13.0", "1.13.1").issueBody).toContain("replaced in place");
  });

  test("an upstream head equal to the pin is not actionable", () => {
    const report = evaluateDrift("1.13.0", "1.13.0");
    expect(report.actionable).toBe(false);
    expect(report.reason).toBe("current");
    expect(report.issueTitle).toBeUndefined();
  });

  test("a channel rollback behind the pin is not actionable", () => {
    const report = evaluateDrift("1.13.0", "1.12.4");
    expect(report.actionable).toBe(false);
    expect(report.reason).toBe("behind");
  });

  test("a prerelease head is never actionable, even when it is newer", () => {
    const report = evaluateDrift("1.13.0", "1.13.1-beta");
    expect(report.actionable).toBe(false);
    expect(report.reason).toBe("prerelease");
    expect(report.issueTitle).toBeUndefined();
  });
});

describe("issue identity", () => {
  test("the title is keyed on the upstream version alone, so a rerun dedupes", () => {
    expect(evaluateDrift("1.13.0", "1.13.1").issueTitle).toBe(issueTitleFor("1.13.1"));
    expect(evaluateDrift("1.12.4", "1.13.1").issueTitle).toBe(issueTitleFor("1.13.1"));
  });
});

describe("describeReport", () => {
  test("every reason renders a line", () => {
    const reasons: UpstreamReport["reason"][] = ["drifted", "current", "behind", "prerelease"];
    for (const reason of reasons) {
      const line = describeReport({
        command: "upstream:release-check",
        pinned: "1.13.0",
        upstream: "1.13.1",
        actionable: reason === "drifted",
        reason,
        transition: "patch",
      });
      expect(line.startsWith("upstream:release-check")).toBe(true);
      expect(line.endsWith("\n")).toBe(true);
    }
  });
});

describe("runUpstreamCheckCli", () => {
  test("drift is reported on stdout and still exits 0", async () => {
    const io = collectingIo(async () => ({ version: "1.13.1" }));
    const code = await runUpstreamCheckCli(["--json"], io, "1.13.0");
    expect(code).toBe(0);
    const report = JSON.parse(io.out.join("")) as UpstreamReport;
    expect(report.actionable).toBe(true);
    expect(report.upstream).toBe("1.13.1");
  });

  test("no drift exits 0 with an unactionable report", async () => {
    const io = collectingIo(async () => ({ version: "1.13.0" }));
    const code = await runUpstreamCheckCli(["--json"], io, "1.13.0");
    expect(code).toBe(0);
    expect((JSON.parse(io.out.join("")) as UpstreamReport).actionable).toBe(false);
  });

  test("an unreachable channel is the only failure mode", async () => {
    const io = collectingIo(async () => {
      throw new Error("could not resolve the stable Defold head");
    });
    const code = await runUpstreamCheckCli([], io, "1.13.0");
    expect(code).toBe(1);
    expect(io.out).toHaveLength(0);
    expect(io.err.join("")).toContain("could not resolve the stable Defold head");
  });

  test("the default pin is the shipped tuple's head, not a second literal", async () => {
    const io = collectingIo(async () => ({ version: CURRENT_STABLE_DEFOLD_VERSION }));
    await runUpstreamCheckCli(["--json"], io);
    const report = JSON.parse(io.out.join("")) as UpstreamReport;
    expect(report.pinned).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(report.reason).toBe("current");
  });
});
