import { useEffect } from "hono/jsx";

// Phosphor "copy" and "check" glyphs, inlined so the island ships no extra
// import. Toggled by the `is-clipped` class on the button (see styles.css).
const COPY_SVG = `<svg class="code-clip-icon" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"/></svg>`;
const CHECK_SVG = `<svg class="code-clip-check" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>`;

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Non-secure contexts (or denied permission) have no async clipboard;
    // fall back to the legacy selection copy.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* nothing else to try */
    }
    ta.remove();
  }
}

/**
 * Injects a copy-to-clipboard button into every code block in the article.
 *
 * The button is purely interactive (the clipboard needs JS), so it is created
 * here rather than in the markdown pipeline — no server markup, no first-paint
 * styling to mirror into critical.css. Each `<pre>` is wrapped in a
 * `position: relative` `.code-body` so the absolutely-positioned button stays
 * pinned to the visible top-right even while the code scrolls horizontally.
 */
export default function CodeCopy() {
  useEffect(() => {
    const article = document.querySelector("article");
    if (!article) return;
    const pres = Array.from(article.querySelectorAll<HTMLPreElement>("pre"));
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wrappers: HTMLElement[] = [];

    for (const pre of pres) {
      if (pre.parentElement?.classList.contains("code-body")) continue;

      const body = document.createElement("div");
      body.className = "code-body";
      pre.replaceWith(body);
      body.appendChild(pre);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-clip";
      btn.setAttribute("aria-label", "Copy code");
      btn.innerHTML = `${COPY_SVG}${CHECK_SVG}`;
      btn.addEventListener("click", async () => {
        await copyText(pre.querySelector("code")?.textContent ?? pre.textContent ?? "");
        btn.classList.add("is-clipped");
        btn.setAttribute("aria-label", "Copied");
        const t = setTimeout(() => {
          btn.classList.remove("is-clipped");
          btn.setAttribute("aria-label", "Copy code");
        }, 1500);
        timers.push(t);
      });
      body.appendChild(btn);
      wrappers.push(body);
    }

    return () => {
      for (const t of timers) clearTimeout(t);
      // Unwrap on teardown (HMR) so a re-mount doesn't double-wrap.
      for (const body of wrappers) {
        const pre = body.querySelector("pre");
        if (pre) body.replaceWith(pre);
      }
    };
  }, []);

  return <div class="code-clip-root" style={{ display: "contents" }} />;
}
