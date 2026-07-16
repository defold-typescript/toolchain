import { describe, expect, test } from "bun:test";
import {
  classifyDefoldTarget,
  describeTargetOverride,
  diagnoseDefoldNamespace,
  readDefoldTargetPin,
  resolveDefoldTarget,
  resolveTargetHead,
  setDefoldTargetPin,
} from "./defold-target";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";

describe("classifyDefoldTarget", () => {
  test("a semantic version classifies as a fixed version", () => {
    expect(classifyDefoldTarget("1.12.4")).toEqual({ kind: "version", version: "1.12.4" });
  });

  test("each channel name classifies as a moving channel", () => {
    expect(classifyDefoldTarget("stable")).toEqual({ kind: "channel", channel: "stable" });
    expect(classifyDefoldTarget("beta")).toEqual({ kind: "channel", channel: "beta" });
    expect(classifyDefoldTarget("alpha")).toEqual({ kind: "channel", channel: "alpha" });
  });

  test("an unknown token throws, naming --defold-target and the accepted forms", () => {
    for (const bad of ["nightly", ""]) {
      let message = "";
      try {
        classifyDefoldTarget(bad);
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect(message).toContain("--defold-target");
      expect(message).toContain("1.12.4");
      expect(message).toContain("stable|beta|alpha");
    }
  });
});

describe("readDefoldTargetPin", () => {
  test("returns the pinned target for a well-formed package.json", () => {
    expect(readDefoldTargetPin({ "defold-typescript": { "defold-target": "beta" } })).toBe("beta");
  });

  test("returns undefined for a missing target key", () => {
    expect(readDefoldTargetPin({ "defold-typescript": {} })).toBeUndefined();
  });

  test("returns undefined for a missing namespace", () => {
    expect(readDefoldTargetPin({ name: "x" })).toBeUndefined();
  });

  test("returns undefined for a non-object namespace", () => {
    expect(readDefoldTargetPin({ "defold-typescript": "beta" })).toBeUndefined();
  });

  test("returns undefined for a non-string target value", () => {
    expect(readDefoldTargetPin({ "defold-typescript": { "defold-target": 12 } })).toBeUndefined();
  });

  test("returns undefined for a non-object input", () => {
    expect(readDefoldTargetPin(null)).toBeUndefined();
    expect(readDefoldTargetPin("nope")).toBeUndefined();
    expect(readDefoldTargetPin(undefined)).toBeUndefined();
  });
});

describe("diagnoseDefoldNamespace", () => {
  test("a recognized pin produces no diagnostics", () => {
    expect(diagnoseDefoldNamespace({ "defold-typescript": { "defold-target": "1.13.0" } })).toEqual(
      [],
    );
  });

  test("extensions alone is recognized and produces no diagnostics", () => {
    expect(
      diagnoseDefoldNamespace({
        "defold-typescript": { extensions: { "https://github.com/x/y": "1.0.0" } },
      }),
    ).toEqual([]);
  });

  test("the legacy defold-version key is named and points at defold-target", () => {
    const diagnostics = diagnoseDefoldNamespace({
      "defold-typescript": { "defold-version": "1.12.4" },
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain("defold-version");
    expect(diagnostics[0]).toContain("defold-target");
  });

  test("the legacy channel key is named and points at defold-target", () => {
    const diagnostics = diagnoseDefoldNamespace({ "defold-typescript": { channel: "beta" } });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain("channel");
    expect(diagnostics[0]).toContain("defold-target");
  });

  test("an unrecognized non-legacy key is named alongside the recognized keys", () => {
    const diagnostics = diagnoseDefoldNamespace({
      "defold-typescript": { defoldTarget: "1.12.4" },
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain("defoldTarget");
    expect(diagnostics[0]).toContain("defold-target");
    expect(diagnostics[0]).toContain("extensions");
  });

  test("multiple bad keys produce one diagnostic each, in sorted order", () => {
    const diagnostics = diagnoseDefoldNamespace({
      "defold-typescript": { defoldTarget: "1.12.4", channel: "beta", "defold-version": "1.12.4" },
    });
    expect(diagnostics).toHaveLength(3);
    expect(diagnostics[0]).toContain("channel");
    expect(diagnostics[1]).toContain("defold-version");
    expect(diagnostics[2]).toContain("defoldTarget");
  });

  test("an absent, non-object, or unparseable namespace produces no diagnostics", () => {
    expect(diagnoseDefoldNamespace({ name: "x" })).toEqual([]);
    expect(diagnoseDefoldNamespace({ "defold-typescript": "beta" })).toEqual([]);
    expect(diagnoseDefoldNamespace(null)).toEqual([]);
    expect(diagnoseDefoldNamespace("nope")).toEqual([]);
    expect(diagnoseDefoldNamespace(undefined)).toEqual([]);
  });
});

describe("describeTargetOverride", () => {
  test("version flag over a differing version pin names both and how to persist", () => {
    const notices = describeTargetOverride("1.13.0", "1.12.4");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("1.13.0");
    expect(notices[0]).toContain("1.12.4");
    expect(notices[0]).toContain("this run only");
    expect(notices[0]).toContain("does not update the pin");
    expect(notices[0]).toContain("init");
  });

  test("channel flag over a differing channel pin names both tokens", () => {
    const notices = describeTargetOverride("alpha", "beta");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("alpha");
    expect(notices[0]).toContain("beta");
  });

  test("channel flag over a version pin produces one notice", () => {
    const notices = describeTargetOverride("stable", "1.12.4");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("stable");
    expect(notices[0]).toContain("1.12.4");
  });

  test("equal, whitespace-only difference, no pin, or no flag produce no notice", () => {
    expect(describeTargetOverride("1.12.4", "1.12.4")).toEqual([]);
    expect(describeTargetOverride(" 1.12.4 ", "1.12.4")).toEqual([]);
    expect(describeTargetOverride("1.13.0", undefined)).toEqual([]);
    expect(describeTargetOverride(undefined, "1.12.4")).toEqual([]);
  });
});

describe("resolveDefoldTarget", () => {
  test("flag wins over pin", () => {
    expect(resolveDefoldTarget({ flag: "beta", pin: "1.10.0" })).toEqual({
      kind: "channel",
      channel: "beta",
      source: "flag",
    });
  });

  test("pin wins when no flag", () => {
    expect(resolveDefoldTarget({ pin: "1.10.0" })).toEqual({
      kind: "version",
      version: "1.10.0",
      source: "pin",
    });
  });

  test("detected wins over default, resolves as a fixed version", () => {
    expect(resolveDefoldTarget({ detected: "1.9.8" })).toEqual({
      kind: "version",
      version: "1.9.8",
      source: "detected",
    });
  });

  test("default fixed version when nothing is set", () => {
    expect(resolveDefoldTarget({})).toEqual({
      kind: "version",
      version: CURRENT_STABLE_DEFOLD_VERSION,
      source: "default",
    });
  });

  test("flag still wins over detected", () => {
    expect(resolveDefoldTarget({ flag: "alpha", detected: "1.9.8" })).toEqual({
      kind: "channel",
      channel: "alpha",
      source: "flag",
    });
  });
});

describe("resolveTargetHead", () => {
  test("a fixed version resolves its artifact sha via fetchVersionInfo, never a channel", async () => {
    let channelFetched = false;
    const versions: string[] = [];
    const io = {
      fetchChannelInfo: async () => {
        channelFetched = true;
        return { version: "unused", sha1: "unused" };
      },
      fetchVersionInfo: async (version: string) => {
        versions.push(version);
        return { sha1: "version-sha" };
      },
    };
    const head = await resolveTargetHead({ kind: "version", version: "1.12.4" }, io);
    expect(head).toEqual({ version: "1.12.4", channel: null, sha: "version-sha" });
    expect(versions).toEqual(["1.12.4"]);
    expect(channelFetched).toBe(false);
  });

  test("a channel resolves its head via fetchChannelInfo, never a version", async () => {
    const calls: string[] = [];
    let versionFetched = false;
    const io = {
      fetchChannelInfo: async (channel: string) => {
        calls.push(channel);
        return { version: "1.13.0", sha1: "abc123" };
      },
      fetchVersionInfo: async () => {
        versionFetched = true;
        return { sha1: "unused" };
      },
    };
    const head = await resolveTargetHead({ kind: "channel", channel: "beta" }, io);
    expect(calls).toEqual(["beta"]);
    expect(head).toEqual({ version: "1.13.0", channel: "beta", sha: "abc123" });
    expect(versionFetched).toBe(false);
  });
});

describe("setDefoldTargetPin", () => {
  test("replaces the pin and preserves sibling keys in their slot", () => {
    const extensions = { "https://example/ext": "1.0.0" };
    expect(setDefoldTargetPin({ "defold-target": "1.12.4", extensions }, "1.13.0")).toEqual({
      "defold-target": "1.13.0",
      extensions,
    });
  });

  test("setting the current value is idempotent", () => {
    const namespace = { "defold-target": "1.12.4", extensions: {} };
    expect(setDefoldTargetPin(namespace, "1.12.4")).toEqual(namespace);
  });

  test("an absent namespace becomes a pin-only namespace", () => {
    expect(setDefoldTargetPin(undefined, "1.13.0")).toEqual({ "defold-target": "1.13.0" });
    expect(setDefoldTargetPin(null, "1.13.0")).toEqual({ "defold-target": "1.13.0" });
  });

  test("a legacy target key is migrated to defold-target with the new value", () => {
    expect(setDefoldTargetPin({ "defold-version": "1.12.4" }, "1.13.0")).toEqual({
      "defold-target": "1.13.0",
    });
    expect(setDefoldTargetPin({ channel: "beta" }, "1.13.0")).toEqual({
      "defold-target": "1.13.0",
    });
  });

  test("a legacy key beside the pin is dropped, not left behind", () => {
    expect(
      setDefoldTargetPin({ "defold-target": "1.12.4", channel: "beta", name: "x" }, "1.13.0"),
    ).toEqual({ "defold-target": "1.13.0", name: "x" });
  });
});
