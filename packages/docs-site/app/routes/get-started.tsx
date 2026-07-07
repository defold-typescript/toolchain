import { createRoute } from "honox/factory";
import { GetStartedIndex } from "../components/api-index";
import { guidePages } from "../lib/content";

export default createRoute((c) => {
  return c.render(<GetStartedIndex pages={guidePages()} />, { title: "Get started" });
});
