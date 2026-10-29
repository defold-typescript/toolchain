import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip } from "@defold-typescript/types/cli-runtime";
import { writeZipArchive } from "../../types/test/zip-fixture";
import { findDefoldLibraryArchive } from "./defold-library-cache";

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
