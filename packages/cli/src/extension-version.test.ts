import { describe, expect, test } from "bun:test";
import {
  extensionArchiveVersion,
  mergeResolvedVersionPins,
  readExtensionVersionPins,
} from "./extension-version";

const URL_A = "https://github.com/defold/extension-iap/archive/main.zip";
const URL_B = "https://github.com/defold/extension-push/archive/main.zip";

describe("extensionArchiveVersion", () => {
  test("returns a stable sha256-prefixed digest for the same bytes", () => {
    const bytes = new TextEncoder().encode("alpha-bytes");
    const a = extensionArchiveVersion(bytes);
    const b = extensionArchiveVersion(new TextEncoder().encode("alpha-bytes"));
    expect(a).toBe(b);
  });

  test("prefixes the digest with 'sha256:'", () => {
    const out = extensionArchiveVersion(new TextEncoder().encode("z"));
    expect(out.startsWith("sha256:")).toBe(true);
  });

  test("differs for different bytes", () => {
    const a = extensionArchiveVersion(new TextEncoder().encode("alpha"));
    const b = extensionArchiveVersion(new TextEncoder().encode("beta"));
    expect(a).not.toBe(b);
  });

  test("is insensitive to extra Uint8Array instances of the same content", () => {
    const a = extensionArchiveVersion(new Uint8Array([1, 2, 3]));
    const b = extensionArchiveVersion(new Uint8Array([1, 2, 3]));
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("readExtensionVersionPins", () => {
  test("returns the { url: version } map for a well-formed package.json", () => {
    const pkg = {
      "defold-typescript": {
        extensions: { [URL_A]: "sha256:abc", [URL_B]: "sha256:def" },
      },
    };
    expect(readExtensionVersionPins(pkg)).toEqual({
      [URL_A]: "sha256:abc",
      [URL_B]: "sha256:def",
    });
  });

  test("returns {} when the extensions key is absent", () => {
    expect(readExtensionVersionPins({ "defold-typescript": {} })).toEqual({});
  });

  test("returns {} when the defold-typescript namespace is absent", () => {
    expect(readExtensionVersionPins({ name: "x" })).toEqual({});
  });

  test("returns {} when extensions is a non-object value", () => {
    expect(readExtensionVersionPins({ "defold-typescript": { extensions: "nope" } })).toEqual({});
  });

  test("drops non-string values without throwing", () => {
    expect(
      readExtensionVersionPins({
        "defold-typescript": {
          extensions: {
            [URL_A]: "sha256:abc",
            [URL_B]: 42,
            [`${URL_A}#x`]: null,
          },
        },
      }),
    ).toEqual({ [URL_A]: "sha256:abc" });
  });

  test("returns {} for non-object inputs without throwing", () => {
    expect(readExtensionVersionPins(null)).toEqual({});
    expect(readExtensionVersionPins(undefined)).toEqual({});
    expect(readExtensionVersionPins("nope")).toEqual({});
    expect(readExtensionVersionPins(42)).toEqual({});
    expect(readExtensionVersionPins([])).toEqual({});
  });

  test("returns {} when the namespace itself is a non-object value", () => {
    expect(readExtensionVersionPins({ "defold-typescript": "1.9.8" })).toEqual({});
  });
});

describe("mergeResolvedVersionPins", () => {
  test("adds a pin when the url is absent", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { "defold-target": "1.9.8" } },
      { [URL_A]: "sha256:new" },
    );
    expect(merged).toEqual({
      "defold-typescript": {
        "defold-target": "1.9.8",
        extensions: { [URL_A]: "sha256:new" },
      },
    });
  });

  test("preserves an existing pin for the same url (no clobber)", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:old" } } },
      { [URL_A]: "sha256:new" },
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:old" } },
    });
  });

  test("preserves unrelated defold-typescript keys (defold-target)", () => {
    const merged = mergeResolvedVersionPins(
      {
        "defold-typescript": { "defold-target": "1.9.8" },
        name: "my-game",
      },
      { [URL_A]: "sha256:abc" },
    );
    expect(merged).toEqual({
      "defold-typescript": {
        "defold-target": "1.9.8",
        extensions: { [URL_A]: "sha256:abc" },
      },
      name: "my-game",
    });
  });

  test("merges multiple urls at once, keeping existing pins", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:a" } } },
      { [URL_A]: "sha256:A", [URL_B]: "sha256:B" },
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:a", [URL_B]: "sha256:B" } },
    });
  });

  test("is a no-op on a second identical call", () => {
    const first = mergeResolvedVersionPins({}, { [URL_A]: "sha256:abc" });
    const second = mergeResolvedVersionPins(first, { [URL_A]: "sha256:abc" });
    expect(second).toEqual(first);
  });

  test("treats a missing defold-typescript namespace as an empty namespace", () => {
    const merged = mergeResolvedVersionPins({ name: "x" }, { [URL_A]: "sha256:abc" });
    expect(merged).toEqual({
      name: "x",
      "defold-typescript": { extensions: { [URL_A]: "sha256:abc" } },
    });
  });

  test("returns a fresh object, not a reference to the input", () => {
    const original = { "defold-typescript": { "defold-target": "1.9.8" } };
    const merged = mergeResolvedVersionPins(original, { [URL_A]: "sha256:abc" });
    expect(merged).not.toBe(original);
    expect(merged["defold-typescript"]).not.toBe(original["defold-typescript"]);
  });

  test("drops an orphan pin absent from the live url set", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:a", [URL_B]: "sha256:b" } } },
      {},
      [URL_A],
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:a" } },
    });
  });

  test("preserves live pins while seeding a new one", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:a" } } },
      { [URL_B]: "sha256:B" },
      [URL_A, URL_B],
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:a", [URL_B]: "sha256:B" } },
    });
  });

  test("never clobbers a live pin during reconcile", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:old" } } },
      { [URL_A]: "sha256:new" },
      [URL_A],
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:old" } },
    });
  });

  test("omitting the live url set prunes nothing", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:a", [URL_B]: "sha256:b" } } },
      {},
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:a", [URL_B]: "sha256:b" } },
    });
  });
});
