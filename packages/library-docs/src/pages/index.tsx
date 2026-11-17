import { Card, Cards } from "fumadocs-ui/components/card";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { libraryIndexSections } from "../../app/lib/library-routes";
import { SITE_NAME } from "../lib/site";

const sectionId = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export default function LibrariesIndex() {
  const { namespaceCount, sections } = libraryIndexSections();
  return (
    <DocsPage
      toc={sections.map((section) => ({
        title: section.label,
        url: `#${sectionId(section.label)}`,
        depth: 2,
      }))}
    >
      <title>{`Libraries | ${SITE_NAME}`}</title>
      <DocsBody>
        <h1>Libraries</h1>
        <p>
          Library API blocks, and libraries that have no typed API.
          <br />
          The TypeScript definitions behind each API block are maintained in the library data repo —
          generated from the upstream sources that ship machine-readable types, and hand-forked
          where upstream ships none — and pinned to an upstream commit or tag.
          <br />A card marked with the no-typed-API icon links to a page describing what the library
          ships and how to use it, but it has no typed API.
          <br />
          <span className="mt-1 block text-sm text-text-faint">
            {namespaceCount} namespace{namespaceCount === 1 ? "" : "s"} documented.
          </span>
        </p>
        {sections.map((section) => (
          // One section per owner; the owner heads the block, so each card
          // shows only `repo/namespace`.
          <section key={section.label}>
            <h2 id={sectionId(section.label)}>
              {section.label}
              {section.note ? (
                <span className="font-normal text-text-faint"> {section.note}</span>
              ) : null}
            </h2>
            <Cards>
              {section.cards.map((card) => (
                <Card
                  key={card.href}
                  title={
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: built from the repo's own library data, escaped
                    <span dangerouslySetInnerHTML={{ __html: card.titleHtml }} />
                  }
                  description={card.description}
                  href={card.href}
                  data-mono=""
                />
              ))}
            </Cards>
          </section>
        ))}
      </DocsBody>
    </DocsPage>
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
