import { useEffect, useState } from "hono/jsx";
import type { Heading } from "../lib/headings";

/**
 * Sticky, scroll-spy'd table of contents for the current page. Renders as a
 * client island so the page still SSGs without layout shift; the headings
 * list is shipped as a prop (so the initial paint is correct) and the
 * intersection observer only re-lights the active link.
 */
export default function Toc({ headings }: { headings: Heading[] }) {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    if (headings.length === 0) return;
    const targets = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost intersecting heading as the active one.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0]?.target.id ?? null);
        }
      },
      { rootMargin: "-80px 0px -75% 0px", threshold: [0, 1] },
    );
    for (const t of targets) observer.observe(t);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" class="text-sm">
      <p class="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
        On this page
      </p>
      <ul class="space-y-1.5 border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={activeId === h.id ? "location" : undefined}
              class={
                "-ml-px block border-l py-1 text-text-muted transition hover:text-text " +
                (h.level === 3 ? "pl-6" : "pl-3 ") +
                (activeId === h.id ? "border-accent font-medium text-accent" : "border-transparent")
              }
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
