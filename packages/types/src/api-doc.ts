export interface ApiModule {
  namespace: string;
  brief: string;
  description: string;
  functions: ApiFunction[];
  variables: ApiVariable[];
  constants: ApiConstant[];
  properties: ApiProperty[];
  typedefs: ApiTypedef[];
}

export interface ApiProperty {
  name: string;
  types: string[];
  brief: string;
  description: string;
}

export interface ApiTypedef {
  name: string;
}

export interface ApiConstant {
  name: string;
  brief: string;
  description: string;
}

export interface ApiFunction {
  name: string;
  brief: string;
  description: string;
  parameters: ApiParameter[];
  returnValues: ApiParameter[];
}

export interface ApiParameter {
  name: string;
  doc: string;
  types: string[];
  isOptional: boolean;
}

export interface ApiVariable {
  name: string;
  brief: string;
  description: string;
  types: string[];
}

export function parseDefoldApiDoc(input: unknown): ApiModule {
  if (!isRecord(input)) {
    throw new Error(`parseDefoldApiDoc: expected object, got ${describeKind(input)}`);
  }
  const info = input.info;
  if (!isRecord(info)) {
    throw new Error(`parseDefoldApiDoc: missing or invalid "info" field`);
  }
  const namespace = info.namespace;
  if (typeof namespace !== "string" || namespace.length === 0) {
    throw new Error(`parseDefoldApiDoc: missing or invalid "info.namespace"`);
  }
  const brief = stringOr(info.brief, "");
  const description = stringOr(info.description, "");

  const rawElements = input.elements;
  const elements = Array.isArray(rawElements) ? rawElements : [];

  const functions: ApiFunction[] = [];
  const variables: ApiVariable[] = [];
  const constants: ApiConstant[] = [];
  const properties: ApiProperty[] = [];
  const typedefs: ApiTypedef[] = [];

  for (const element of elements) {
    if (!isRecord(element)) continue;
    const type = element.type;
    if (type === "FUNCTION") {
      functions.push(parseFunction(element));
    } else if (type === "VARIABLE") {
      variables.push(parseVariable(element));
    } else if (type === "CONSTANT") {
      constants.push(parseConstant(element));
    } else if (type === "PROPERTY") {
      properties.push(parseProperty(element));
    } else if (type === "TYPEDEF") {
      typedefs.push({ name: stringOr(element.name, "") });
    }
  }

  return { namespace, brief, description, functions, variables, constants, properties, typedefs };
}

function parseProperty(element: Record<string, unknown>): ApiProperty {
  const brief = stringOr(element.brief, "");
  const span = /<span class="type">([^<]+)<\/span>/.exec(brief);
  const types =
    span && span[1] !== undefined
      ? span[1]
          .split("|")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];
  return {
    name: stringOr(element.name, ""),
    types,
    brief,
    description: stringOr(element.description, ""),
  };
}

function parseConstant(element: Record<string, unknown>): ApiConstant {
  return {
    name: stringOr(element.name, ""),
    brief: stringOr(element.brief, ""),
    description: stringOr(element.description, ""),
  };
}

function parseFunction(element: Record<string, unknown>): ApiFunction {
  return {
    name: stringOr(element.name, ""),
    brief: stringOr(element.brief, ""),
    description: stringOr(element.description, ""),
    parameters: parseParameterList(element.parameters),
    returnValues: parseParameterList(element.returnvalues),
  };
}

function parseVariable(element: Record<string, unknown>): ApiVariable {
  return {
    name: stringOr(element.name, ""),
    brief: stringOr(element.brief, ""),
    description: stringOr(element.description, ""),
    types: parseStringArray(element.types),
  };
}

function parseParameterList(raw: unknown): ApiParameter[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiParameter[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    out.push({
      name: stringOr(item.name, ""),
      doc: stringOr(item.doc, ""),
      types: parseStringArray(item.types),
      isOptional: item.is_optional === "True",
    });
  }
  return out;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function describeKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
