import type { ApiPage } from "../api-surface";

// A page with one member of each anchored shape: a function whose two ref-doc
// forms share one overload heading, a namespace-qualified constant, a bare
// property, a constant-union alias, and a typedef with a definition line, a
// function and a property.
export const memberAnchorPage: ApiPage = {
  namespace: "demo",
  route: "/api/demo",
  brief: "Demo brief",
  module: {
    namespace: "demo",
    brief: "Demo brief",
    description: "Demo module introToken.",
    functions: [
      {
        name: "demo.move",
        brief: "",
        description: "Moves by a stepProseToken.",
        parameters: [
          { name: "dx", doc: "<p>stepParamToken</p>", types: ["number"], isOptional: false },
        ],
        returnValues: [
          { name: "", doc: "<p>movedReturnToken</p>", types: ["boolean"], isOptional: false },
        ],
        examples: "local secretExampleToken = demo.move(1)",
      },
      {
        name: "demo.move",
        brief: "",
        description: "Moves to a pointProseToken.",
        parameters: [
          { name: "x", doc: "", types: ["number"], isOptional: false },
          { name: "y", doc: "", types: ["number"], isOptional: false },
        ],
        returnValues: [],
      },
    ],
    variables: [],
    constants: [{ name: "demo.LIMIT", brief: "", description: "The limitProseToken." }],
    properties: [
      { name: "speed", brief: "", description: "How fastProseToken.", types: ["number"] },
    ],
    typedefs: [
      {
        name: "Options",
        extends: ["BaseOptions"],
        functions: [
          {
            name: "open",
            brief: "",
            description: "Opens with openProseToken.",
            parameters: [],
            returnValues: [],
            examples: "local secretTypeExampleToken = options.open()",
          },
        ],
        properties: [
          {
            name: "no_stack",
            brief: "",
            description: "Skips the stack noStackProseToken.",
            types: ["boolean"],
            isOptional: true,
          },
        ],
      },
    ],
  },
  authoritativeSignatures: new Map([
    ["demo\u0000TYPEDEF\u0000Mode\u0000", "type Mode = typeof demo.LIMIT;"],
  ]),
  translations: {},
  signatures: {},
  category: "engine",
};
