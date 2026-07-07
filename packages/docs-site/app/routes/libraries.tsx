import { createRoute } from "honox/factory";
import { LibraryIndex } from "../components/api-index";
import { apiPages, libraryDirs, libraryOwners } from "../lib/api-content";

export default createRoute((c) => {
  return c.render(
    <LibraryIndex pages={apiPages()} moduleDir={libraryDirs()} owners={libraryOwners()} />,
    {
      title: "Libraries",
    },
  );
});
