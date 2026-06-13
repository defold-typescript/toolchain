import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DEFOLD_CHANNEL,
  isDefoldChannel,
  readDefoldChannelPin,
  resolveDefoldChannel,
} from "./defold-channel";

describe("resolveDefoldChannel", () => {
  test("flag wins over pin and default", () => {
    expect(resolveDefoldChannel({ flag: "alpha", pin: "beta" })).toEqual({
      channel: "alpha",
      source: "flag",
    });
  });

  test("pin wins when no flag", () => {
    expect(resolveDefoldChannel({ pin: "beta" })).toEqual({
      channel: "beta",
      source: "pin",
    });
  });

  test("default when neither flag nor pin", () => {
    expect(resolveDefoldChannel({})).toEqual({
      channel: DEFAULT_DEFOLD_CHANNEL,
      source: "default",
    });
  });

  test("DEFAULT_DEFOLD_CHANNEL is stable", () => {
    expect(DEFAULT_DEFOLD_CHANNEL).toBe("stable");
  });

  test("an unknown flag throws naming the value and the accepted set", () => {
    expect(() => resolveDefoldChannel({ flag: "nightly" })).toThrow(/nightly/);
    expect(() => resolveDefoldChannel({ flag: "nightly" })).toThrow(/stable\|beta\|alpha/);
  });
});

describe("isDefoldChannel", () => {
  test("accepts the three literals, rejects everything else", () => {
    expect(isDefoldChannel("stable")).toBe(true);
    expect(isDefoldChannel("beta")).toBe(true);
    expect(isDefoldChannel("alpha")).toBe(true);
    expect(isDefoldChannel("nightly")).toBe(false);
    expect(isDefoldChannel(undefined)).toBe(false);
    expect(isDefoldChannel(null)).toBe(false);
    expect(isDefoldChannel(3)).toBe(false);
  });
});

describe("readDefoldChannelPin", () => {
  test("returns the pinned channel for a well-formed package.json", () => {
    expect(readDefoldChannelPin({ "defold-typescript": { channel: "beta" } })).toBe("beta");
  });

  test("returns undefined for a missing channel key", () => {
    expect(readDefoldChannelPin({ "defold-typescript": {} })).toBeUndefined();
  });

  test("returns undefined for a missing namespace", () => {
    expect(readDefoldChannelPin({ name: "x" })).toBeUndefined();
  });

  test("returns undefined for a non-object namespace", () => {
    expect(readDefoldChannelPin({ "defold-typescript": "beta" })).toBeUndefined();
  });

  test("returns undefined for a non-string channel value", () => {
    expect(readDefoldChannelPin({ "defold-typescript": { channel: 3 } })).toBeUndefined();
  });

  test("returns undefined for a string that is not one of the three channels", () => {
    expect(readDefoldChannelPin({ "defold-typescript": { channel: "nightly" } })).toBeUndefined();
  });

  test("returns undefined for a non-object input", () => {
    expect(readDefoldChannelPin(null)).toBeUndefined();
    expect(readDefoldChannelPin("nope")).toBeUndefined();
    expect(readDefoldChannelPin(undefined)).toBeUndefined();
  });
});
