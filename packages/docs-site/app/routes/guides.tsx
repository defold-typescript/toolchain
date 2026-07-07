import { createRoute } from "honox/factory";
import { GuidesIndex } from "../components/api-index";
import { guidePages } from "../lib/content";

export default createRoute((c) => {
  return c.render(<GuidesIndex pages={guidePages()} />, { title: "Guides" });
});
