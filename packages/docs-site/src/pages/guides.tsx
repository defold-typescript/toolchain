import { CategoryLanding } from "../components/category-landing";

export default function Landing() {
  return <CategoryLanding id="guides" />;
}

export async function getConfig() {
  return { render: "static" } as const;
}
