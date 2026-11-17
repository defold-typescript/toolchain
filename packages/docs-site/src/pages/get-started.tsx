import { CategoryLanding } from "../components/category-landing";

export default function Landing() {
  return (
    <CategoryLanding
      id="get-started"
      lead="Install the toolchain, scaffold a project, and wire it into the Defold editor."
    />
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
