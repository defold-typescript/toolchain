import { CategoryLanding } from "../components/category-landing";

export default function Landing() {
  return <CategoryLanding id="get-started" />;
}

export async function getConfig() {
  return { render: "static" } as const;
}
