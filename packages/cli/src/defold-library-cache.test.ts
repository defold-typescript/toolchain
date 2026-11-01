import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip } from "@defold-typescript/types/cli-runtime";
import { writeZipArchive } from "../../types/test/zip-fixture";
import { findDefoldBuildArchive, findDefoldLibraryArchive } from "./defold-library-cache";

// Read off a project Defold fetched: the zip for this URL is named
// `f7a4a6e5...-<base64 of its ETag>.zip`, and its comment is the commit
// `dependencies.json` lists for it.
const URL = "https://github.com/king8fisher/defold-pixels/archive/refs/heads/master.zip";
const URL_SHA1 = "f7a4a6e51f23d741a5f233b044f3c47395025345";
const COMMIT = "d1b21f1956652ca7ed5e17497aa702b2afbab349";
const OTHER_COMMIT = "0123456789abcdef0123456789abcdef01234567";

const ETAG_A = Buffer.from('"a3609651673e17b69f486a5a3ca6db3e"').toString("base64");
const ETAG_B = Buffer.from('"d3d9ac9aa7c7e6507ac3f34ebda3cdb9"').toString("base64");

function project(): { dir: string; lib: string } {
  const dir = mkdtempSync(join(tmpdir(), "defold-library-cache-"));
  const lib = join(dir, ".internal", "lib");
  mkdirSync(lib, { recursive: true });
  return { dir, lib };
}

function writeArchive(lib: string, name: string, comment: string): string {
  const path = join(lib, name);
  writeFileSync(
    path,
    writeZipArchive([{ name: "defold-pixels-master/game.project", text: "[project]\n" }], {
      comment,
    }),
  );
  return path;
}

function writeDependencies(lib: string, entries: unknown): void {
  writeFileSync(join(lib, "dependencies.json"), JSON.stringify(entries, null, 2));
}

const listed = [{ url: URL, "commit-sha1": COMMIT, "payload-sha1": "a".repeat(40) }];

describe("findDefoldLibraryArchive", () => {
  test("returns the zip under the URL's sha1 whose comment is the listed commit", async () => {
    const { dir, lib } = project();
    writeDependencies(lib, listed);
    const path = writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, COMMIT);

    expect(await findDefoldLibraryArchive(dir, URL, readZip)).toBe(path);
  });

  test("picks the matching zip when two share the URL's prefix", async () => {
    const { dir, lib } = project();
    writeDependencies(lib, listed);
    writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, OTHER_COMMIT);
    const path = writeArchive(lib, `${URL_SHA1}-${ETAG_B}.zip`, COMMIT);

    expect(await findDefoldLibraryArchive(dir, URL, readZip)).toBe(path);
  });

  test("returns null when the zip's comment is not the listed commit", async () => {
    const { dir, lib } = project();
    writeDependencies(lib, listed);
    writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, OTHER_COMMIT);

    expect(await findDefoldLibraryArchive(dir, URL, readZip)).toBeNull();
  });

  test("returns null when dependencies.json does not list the URL", async () => {
    const { dir, lib } = project();
    writeDependencies(lib, [{ ...listed[0], url: `${URL}?other` }]);
    writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, COMMIT);

    expect(await findDefoldLibraryArchive(dir, URL, readZip)).toBeNull();
  });

  test("returns null when no zip carries the URL's prefix", async () => {
    const { dir, lib } = project();
    writeDependencies(lib, listed);
    writeArchive(lib, `${"0".repeat(40)}-${ETAG_A}.zip`, COMMIT);

    expect(await findDefoldLibraryArchive(dir, URL, readZip)).toBeNull();
  });

  test("returns null when dependencies.json is missing or not a JSON array", async () => {
    const { dir, lib } = project();
    writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, COMMIT);
    expect(await findDefoldLibraryArchive(dir, URL, readZip)).toBeNull();

    writeFileSync(join(lib, "dependencies.json"), "{ not json");
    expect(await findDefoldLibraryArchive(dir, URL, readZip)).toBeNull();

    writeDependencies(lib, { url: URL, "commit-sha1": COMMIT });
    expect(await findDefoldLibraryArchive(dir, URL, readZip)).toBeNull();
  });

  test("returns null when the zip under the prefix is not a readable archive", async () => {
    const { dir, lib } = project();
    writeDependencies(lib, listed);
    writeFileSync(join(lib, `${URL_SHA1}-${ETAG_A}.zip`), "partial download");

    expect(await findDefoldLibraryArchive(dir, URL, readZip)).toBeNull();
  });
});

describe("findDefoldBuildArchive", () => {
  const listedEmpty = [{ ...listed[0], "commit-sha1": "" }];

  test("returns the zip whose comment is the listed commit", async () => {
    const { dir, lib } = project();
    writeDependencies(lib, listed);
    const path = writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, COMMIT);

    expect(await findDefoldBuildArchive(dir, URL, readZip)).toEqual({ path });
  });

  test("an empty listed commit returns the one zip under the prefix with an empty comment", async () => {
    const { dir, lib } = project();
    writeDependencies(lib, listedEmpty);
    const path = writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, "");

    expect(await findDefoldBuildArchive(dir, URL, readZip)).toEqual({ path });
  });

  // Bob builds the first zip its directory listing yields under a prefix, whatever
  // its comment says, so no comment can say which of two the build reads.
  test.each([
    ["an empty listed commit and two uncommented zips", listedEmpty, "", ""],
    ["a listed commit and two zips naming it", listed, COMMIT, COMMIT],
    ["a listed commit and only one zip naming it", listed, COMMIT, OTHER_COMMIT],
  ] as const)("%s return a reason", async (_, entries, first, second) => {
    const { dir, lib } = project();
    writeDependencies(lib, entries);
    writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, first);
    writeArchive(lib, `${URL_SHA1}-${ETAG_B}.zip`, second);

    const found = await findDefoldBuildArchive(dir, URL, readZip);

    expect(found).toEqual({ reason: expect.stringContaining(URL) });
  });

  type Setup = (dir: { lib: string }) => void;
  const failures: readonly (readonly [string, Setup])[] = [
    [
      "an empty listed commit and a zip with a comment",
      ({ lib }) => {
        writeDependencies(lib, listedEmpty);
        writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, COMMIT);
      },
    ],
    [
      "an unlisted URL",
      ({ lib }) => {
        writeDependencies(lib, [{ ...listed[0], url: `${URL}?other` }]);
        writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, COMMIT);
      },
    ],
    [
      "a comment naming another commit",
      ({ lib }) => {
        writeDependencies(lib, listed);
        writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, OTHER_COMMIT);
      },
    ],
    [
      "an empty comment under a listed commit",
      ({ lib }) => {
        writeDependencies(lib, listed);
        writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, "");
      },
    ],
    [
      "bytes that are not a zip",
      ({ lib }) => {
        writeDependencies(lib, listed);
        writeFileSync(join(lib, `${URL_SHA1}-${ETAG_A}.zip`), "partial download");
      },
    ],
    ["no zip under the prefix", ({ lib }) => writeDependencies(lib, listed)],
    [
      "a manifest that does not parse",
      ({ lib }) => {
        writeFileSync(join(lib, "dependencies.json"), "{ not json");
        writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, COMMIT);
      },
    ],
    [
      "a listed entry with no commit field",
      ({ lib }) => {
        writeDependencies(lib, [{ url: URL }]);
        writeArchive(lib, `${URL_SHA1}-${ETAG_A}.zip`, "");
      },
    ],
  ];

  test.each(failures)("%s returns a reason naming the URL", async (_, setup) => {
    const { dir, lib } = project();
    setup({ lib });

    const found = await findDefoldBuildArchive(dir, URL, readZip);

    expect(found).toEqual({ reason: expect.stringContaining(URL) });
  });
});
