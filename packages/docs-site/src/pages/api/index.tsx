import { CategoryLanding } from "../../components/category-landing";

export default function Landing() {
  return <CategoryLanding id="api" />;
}

export async function getConfig() {
  return { render: "static" } as const;
}
