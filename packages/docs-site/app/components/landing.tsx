import type { Child } from "hono/jsx";
import { withBase } from "../lib/base";

// Reusable building blocks for every category landing ("root node") page —
// Get started, Guides, API, Libraries. Each landing is an article of the same
// shape: a prose header, then one or more sections of link cards. Centralising
// the markup here keeps the four pages visually uniform and lets a new category
// get a landing for free.

/**
 * A single link card: a title (mono for API namespaces) over an optional summary.
 * Pass `description` for plain text or `descriptionHtml` for pre-rendered inline
 * HTML (e.g. a card summary's rendered markdown); the latter wins if both are set.
 */
export function LandingCard({
  href,
  title,
  description,
  descriptionHtml,
  mono = false,
}: {
  href: string;
  title: Child;
  description?: string | null;
  descriptionHtml?: string | null;
  mono?: boolean;
}) {
  return (
    <li>
      <a
        href={withBase(href)}
        class="block rounded-lg border border-border bg-surface px-4 py-3 transition hover:border-border-strong hover:bg-surface-2"
      >
        <span
          class={
            mono
              ? "font-mono text-[13px] font-semibold text-accent"
              : "text-[15px] font-semibold text-accent"
          }
        >
          {title}
        </span>
        {descriptionHtml ? (
          <span
            class="mt-1 block text-sm text-text-muted"
            dangerouslySetInnerHTML={{ __html: descriptionHtml }}
          />
        ) : description ? (
          <span class="mt-1 block text-sm text-text-muted">{description}</span>
        ) : null}
      </a>
    </li>
  );
}

/** The responsive two-column grid wrapping a set of `LandingCard`s. */
export function LandingCardGrid({ children }: { children: Child }) {
  return (
    <ul class="not-prose mt-4 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">{children}</ul>
  );
}

/** A titled section: an `h2`/`h3` heading, an optional lead, then its content. */
export function LandingSection({
  heading,
  level = 2,
  subtitle,
  children,
}: {
  heading: string;
  level?: 2 | 3;
  subtitle?: Child;
  children: Child;
}) {
  return (
    <section>
      {level === 3 ? <h3>{heading}</h3> : <h2>{heading}</h2>}
      {subtitle ? <p>{subtitle}</p> : null}
      {children}
    </section>
  );
}

/** The article shell: an `h1`, an optional lead node, then the sections/cards. */
export function LandingPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: Child;
  children: Child;
}) {
  return (
    <article class="prose">
      <h1>{title}</h1>
      {lead}
      {children}
    </article>
  );
}
