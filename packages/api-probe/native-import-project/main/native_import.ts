import { defineScript } from "@defold-typescript/types";
import * as uuid4 from "uuid4";

export default defineScript({
  init() {
    print(`native-import-probe: ${uuid4.generate()}`);
    sys.exit(0);
  },
});
