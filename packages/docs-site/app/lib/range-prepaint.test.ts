import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  API_SURFACE_STORAGE_KEY,
  type ApiSurfaceConfig,
  chooseRangeOption,
  readStoredRange,
  resolveApiSurfaceRedirect,
} from "./api-surface-pref";
import { rangePrepaintScript } from "./range-prepaint";

// The windowed registry `api-surface-pref.test.ts` uses: newest first, the
// default newest, and the oldest the `from` a full-range URL leaves implicit.
const NEWEST = "defold-1.13.0";
const MIDDLE = "defold-1.12.4";
const OLDEST = "defold-1.12.0";
const CONFIG: ApiSurfaceConfig = {
  base: "",
  versionIds: [NEWEST, MIDDLE, OLDEST],
  defaultVersionId: NEWEST,
  namespacesByVersion: {
    [NEWEST]: ["camera", "go", "model"],
    [MIDDLE]: ["go", "model"],
    [OLDEST]: ["go", "legacy"],
  },
  badgeCounts: {},
};

// One symbol heading as the API renderer writes it: the marker names the newest
// version the symbol is present in, and the body follows the heading.
function symbol(id: string, newest: string): string {
  return `<h3 id="${id}"><span data-span-newest="${newest}" data-span-cats="-|-|-"></span>${id}</h3><div class="api-symbol-body">${id} body</div>`;
}

// Symbols newer and older than `MIDDLE` inside the page body, and one old symbol
// outside it that the filter must leave alone.
const PAGE = `<nav>${symbol("outside", OLDEST)}</nav><article data-page-body="">${symbol("removed", OLDEST)}${symbol("kept", MIDDLE)}${symbol("current", NEWEST)}</article>`;

let replace: ReturnType<typeof spyOn>;
let assign: ReturnType<typeof spyOn>;

function visit(path: string, stored: string | null, page: string = PAGE): void {
  history.replaceState(null, "", path);
  localStorage.clear();
  if (stored !== null) localStorage.setItem(API_SURFACE_STORAGE_KEY, stored);
  document.documentElement.removeAttribute("data-api-range");
  document.body.innerHTML = page;
  replace = spyOn(window.location, "replace").mockImplementation(() => {});
  assign = spyOn(window.location, "assign").mockImplementation(() => {});
}

function runScript(): void {
  // `new Function` runs the text in global scope, as the inline script does, so
  // a helper the serialized functions reach for but the text omits throws here.
  new Function(rangePrepaintScript(CONFIG))();
}

function displayOf(id: string): string {
  const heading = document.getElementById(id) as HTMLElement;
  return heading.style.display;
}

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost/" });
});

afterEach(() => {
  replace.mockRestore();
  assign.mockRestore();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

describe("rangePrepaintScript", () => {
  test("a stored narrower window redirects an un-prefixed API page to that window", () => {
    const stored = `${OLDEST}|${MIDDLE}`;
    visit("/api/go", stored);
    runScript();
    const expected = resolveApiSurfaceRedirect("/api/go", "", stored, CONFIG, readStoredRange);
    expect(expected).not.toBeNull();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(expected);
  });

  test("no stored window leaves an un-prefixed API page put", () => {
    visit("/api/go", null);
    runScript();
    expect(replace).not.toHaveBeenCalled();
  });

  test("a stored window never moves a guide page", () => {
    visit("/getting-started", `${OLDEST}|${MIDDLE}`);
    runScript();
    expect(replace).not.toHaveBeenCalled();
  });

  test("after DOMContentLoaded the page body hides what the stored `from` excludes, and nothing outside it", () => {
    visit(`/api/${NEWEST}/go`, `${MIDDLE}|${NEWEST}`);
    Object.defineProperty(document, "readyState", { configurable: true, value: "loading" });
    try {
      runScript();
      expect(displayOf("removed")).toBe("");
      document.dispatchEvent(new Event("DOMContentLoaded"));
    } finally {
      delete (document as { readyState?: string }).readyState;
    }

    expect(replace).not.toHaveBeenCalled();
    expect(displayOf("removed")).toBe("none");
    expect(displayOf("kept")).toBe("");
    expect(displayOf("current")).toBe("");
    expect(displayOf("outside")).toBe("");
    expect(document.documentElement.dataset.apiRange).toBe(`${MIDDLE}|${NEWEST}`);
  });

  test("a click on a picker option stores the window it chooses and goes where that window lives", () => {
    const stored = `${OLDEST}|${MIDDLE}`;
    // Before hydration the option still carries the server's href, built for
    // the default window this guide page states.
    const option = `<a data-range-option="${MIDDLE}" data-range-bound="from" href="/api/${NEWEST}?since=${MIDDLE}"><span>${MIDDLE}</span></a>`;
    visit("/getting-started", stored, option);
    runScript();
    (document.querySelector("[data-range-option] span") as HTMLElement).click();

    const expected = chooseRangeOption(
      "/getting-started",
      "",
      stored,
      "from",
      MIDDLE,
      CONFIG,
      readStoredRange,
      resolveApiSurfaceRedirect,
    );
    expect(expected.target).not.toBeNull();
    expect(localStorage.getItem(API_SURFACE_STORAGE_KEY)).toBe(expected.stored);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(expected.target);
  });
});
