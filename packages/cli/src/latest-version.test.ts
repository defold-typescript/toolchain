import { describe, expect, test } from "bun:test";
import { LATEST_CLI_VERSION_URL, resolveLatestCliVersion } from "./latest-version";

function jsonResponse(body: unknown, init?: { status?: number; statusText?: string }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText ?? "OK",
  });
}

describe("resolveLatestCliVersion", () => {
  test("resolves the version from the registry dist-tag document", async () => {
    const seen: string[] = [];
    const version = await resolveLatestCliVersion(async (url) => {
      seen.push(String(url));
      return jsonResponse({ version: "1.3.0" });
    });

    expect(version).toBe("1.3.0");
    expect(seen).toEqual([LATEST_CLI_VERSION_URL]);
  });

  test("throws an actionable error naming the registry URL on a non-200", async () => {
    const failing = async (): Promise<Response> =>
      jsonResponse({}, { status: 404, statusText: "Not Found" });

    await expect(resolveLatestCliVersion(failing)).rejects.toThrow(LATEST_CLI_VERSION_URL);
    await expect(resolveLatestCliVersion(failing)).rejects.toThrow("404");
  });

  test("throws when the registry answers without a version", async () => {
    await expect(resolveLatestCliVersion(async () => jsonResponse({}))).rejects.toThrow(
      LATEST_CLI_VERSION_URL,
    );
  });

  test("an offline fetch throws and mentions the network, never resolving a fallback version", async () => {
    const offline = async (): Promise<Response> => {
      throw new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
    };

    await expect(resolveLatestCliVersion(offline)).rejects.toThrow(/network connection/i);
  });
});
