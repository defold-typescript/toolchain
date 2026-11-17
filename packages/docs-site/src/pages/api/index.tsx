import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import { TYPES_DIR } from "../../../app/lib/api-content";
import { versionShortLabel } from "../../../app/lib/version-switch";
import { CategoryLanding } from "../../components/category-landing";
import { navCategories } from "../../lib/site";

export default function Landing() {
  // Newest first, so the axis ends on the oldest release this reference covers.
  const versions = apiVersions(TYPES_DIR).map((version) => versionShortLabel(version.id));
  const oldest = versions[versions.length - 1];
  const count = (navCategories().find((category) => category.id === "api")?.links ?? []).flatMap(
    (group) => group.children ?? [],
  ).length;
  return (
    <CategoryLanding
      id="api"
      lead={
        <>
          Every namespace across the tracked Defold versions, unified into one surface. Each symbol
          is annotated with the versions it is available in.
          <span className="mt-1 block text-sm">
            Tracked releases: {versions.join(", ")}.{" "}
            {oldest
              ? `A symbol carrying no availability note exists in all of them, and may be older still — Defold ${oldest} is the oldest release this reference covers.`
              : "No release is tracked yet."}
          </span>
          <span className="mt-1 block text-sm">
            {count} namespace{count === 1 ? "" : "s"} documented.
          </span>
        </>
      }
    />
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
