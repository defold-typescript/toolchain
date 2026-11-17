import { CategoryLanding } from "../components/category-landing";

export default function Landing() {
  return (
    <CategoryLanding
      id="guides"
      lead="Learn defold-typescript in order — core concepts first, sharp edges last."
    />
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
