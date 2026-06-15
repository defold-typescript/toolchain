import { readFileSync } from "node:fs";
import { join } from "node:path";

const MANIFEST_PATH = join(process.cwd(), "dist/.vite/manifest.json");
const CLIENT_ENTRY = "app/client.ts";

interface ManifestChunk {
  css?: string[];
}

/**
 * Stylesheets Vite extracted from the client entry (the bundled fonts), read
 * from the build manifest. Empty in dev, where the Vite server injects CSS via
 * the module graph and no manifest exists yet.
 */
export function clientStyleHrefs(): string[] {
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Record<
      string,
      ManifestChunk
    >;
    return (manifest[CLIENT_ENTRY]?.css ?? []).map((file) => `/${file}`);
  } catch {
    return [];
  }
}
