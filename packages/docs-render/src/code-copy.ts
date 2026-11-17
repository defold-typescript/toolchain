// Phosphor "copy" and "check" glyphs, toggled by the `is-clipped` class on the
// button (see styles.css).
const COPY_SVG = `<svg class="code-clip-icon" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"/></svg>`;
const CHECK_SVG = `<svg class="code-clip-check" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>`;

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
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
 * A copy-to-clipboard button on every code block in `body`, for both docs sites'
 * page scripts. Each `<pre>` is wrapped in a `position: relative` `.code-body` so
 * the button stays pinned to the visible top-right while the code scrolls
 * sideways. Returns a cleanup that clears the pending label resets.
 */
export function addCopyButtons(body: HTMLElement): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const pre of Array.from(body.querySelectorAll<HTMLPreElement>("pre"))) {
    if (pre.parentElement?.classList.contains("code-body")) continue;
    const wrapper = document.createElement("div");
    wrapper.className = "code-body";
    pre.replaceWith(wrapper);
    wrapper.appendChild(pre);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-clip";
    btn.setAttribute("aria-label", "Copy code");
    btn.innerHTML = `${COPY_SVG}${CHECK_SVG}`;
    btn.addEventListener("click", async () => {
      await copyText(pre.querySelector("code")?.textContent ?? pre.textContent ?? "");
      btn.classList.add("is-clipped");
      btn.setAttribute("aria-label", "Copied");
      timers.push(
        setTimeout(() => {
          btn.classList.remove("is-clipped");
          btn.setAttribute("aria-label", "Copy code");
        }, 1500),
      );
    });
    wrapper.appendChild(btn);
  }
  return () => {
    for (const t of timers) clearTimeout(t);
  };
}
