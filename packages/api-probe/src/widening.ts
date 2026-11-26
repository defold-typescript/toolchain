import { basename } from "node:path";
import ts from "typescript";
import { comparedNamespaces } from "../../types/scripts/engine-binding-diff";
import {
  type BindingSlot,
  mergeBindings,
  readBindingsForTarget,
} from "../../types/scripts/engine-binding-extract";
import { declaredMembers } from "../../types/scripts/lua-kind";
import type { ApiTarget } from "../../types/scripts/regen";
import { type CheckedCall, checkCalls } from "./call-check";
import {
  baseCalls,
  type DeclaredReturns,
  declaredReturns,
  isTypeApplication,
  probeTarget,
  type Unwitnessed,
} from "./witness";

// A widened argument the declaration handles worse than the members it
// covers. `sound`: the widened call compiles though a member call does not, or
// resolves to a return or callback parameter a member call's does not fit.
// `complete`: every member call compiles and the widened call does not.
export type WideningRule = "sound" | "complete";

export interface WideningFinding {
  readonly fn: string;
  readonly variant: string;
  readonly slot: string;
  // A member's type text, or `union`, `mixed`, `base` or `boolean`.
  readonly form: string;
  readonly rule: WideningRule;
  // Whether a verdict may record the finding instead of a fix: the open
  // primitive of an open domain.
  readonly verdictable: boolean;
  readonly detail: string;
}

export interface CheckedSlot {
  readonly fn: string;
  readonly variant: string;
  readonly slot: string;
  readonly forms: readonly string[];
}

export interface UncheckedEntry {
  readonly fn: string;
  readonly key: string;
  readonly reason: string;
}

export interface Widening {
  readonly findings: readonly WideningFinding[];
  readonly checked: readonly CheckedSlot[];
  readonly unchecked: readonly UncheckedEntry[];
}

// A call that reaches a checked function with arguments that compile. The call
// to `name` may sit inside it, as a filter does inside a system factory call.
export interface BaseCall {
  readonly name: string;
  readonly variant: string;
  readonly call: string;
}

// How the engine treats `nil` at an argument: `accepts` runs the call as if the
// argument were left out, `raises` fails it.
export type NilHandling = "accepts" | "raises";

// What the gate checks: each function by the name its base calls carry.
export interface WideningSurface {
  readonly functions: ReadonlyMap<string, ts.Symbol>;
  readonly calls: readonly BaseCall[];
  readonly unwitnessed: readonly Unwitnessed[];
  // Statements the call check places before the calls, such as imports.
  readonly prelude?: readonly string[];
  // The string literals a slot keyed `<fn> <slot>` is checked with, beside
  // `string`, in place of the members its declared type holds.
  readonly literals?: ReadonlyMap<string, readonly string[]>;
  // The engine's nil handling at a function's 1-based argument, `undefined`
  // where nothing records it. Unset, no omitted argument is judged.
  readonly nilHandling?: (fn: string, slot: number) => NilHandling | undefined;
}

export function findingKey(finding: WideningFinding): string {
  return `${finding.fn} ${finding.variant} ${finding.slot} ${finding.form} ${finding.rule}`;
}

const PLACEHOLDER = "__WIDENED__";
const TYPE_TEXT = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const ANONYMOUS = new Set(["__type", "__object", "__function"]);

interface Member {
  readonly text: string;
  // The open primitive the member is a literal of.
  readonly literalOf?: "string" | "number";
}

interface Domain {
  readonly members: Member[];
  readonly open: Set<"string" | "number">;
}

interface Form {
  readonly label: string;
  readonly text: string;
  // The member texts a widened form stands for; empty for a member.
  readonly members: readonly string[];
}

interface Slot {
  readonly fn: string;
  readonly variant: string;
  readonly name: string;
  readonly template: string;
  readonly domain: Domain;
}

function restIndex(signature: ts.Signature): number | undefined {
  const params = signature.getParameters();
  const declaration = params[params.length - 1]?.valueDeclaration;
  return declaration !== undefined &&
    ts.isParameter(declaration) &&
    declaration.dotDotDotToken !== undefined
    ? params.length - 1
    : undefined;
}

// The type `signature` declares for argument `index`, `undefined` included
// when the parameter is optional; a rest tuple computed from a conditional
// declares none.
function argumentType(
  signature: ts.Signature,
  index: number,
  checker: ts.TypeChecker,
): ts.Type | undefined {
  const params = signature.getParameters();
  const rest = restIndex(signature);
  if (rest !== undefined && index >= rest) {
    const type = checker.getTypeOfSymbol(params[rest] as ts.Symbol);
    if (!checker.isArrayType(type)) return undefined;
    return checker.getTypeArguments(type as ts.TypeReference)[0];
  }
  const param = params[index];
  return param === undefined ? undefined : checker.getTypeOfSymbol(param);
}

function constrained(type: ts.Type): ts.Type {
  if (!(type.flags & ts.TypeFlags.TypeParameter)) return type;
  return type.getConstraint() ?? type;
}

// Each constituent of a type parameter's declared constraint, read from its
// syntax: the checker reduces `keyof ReceiverMessages<R> & string | MessageId`
// to `string`, losing every literal id.
function constraintParts(type: ts.Type, checker: ts.TypeChecker): ts.Type[] {
  const declaration = type.getSymbol()?.declarations?.find(ts.isTypeParameterDeclaration);
  const node = declaration?.constraint;
  if (node === undefined) {
    const constraint = type.getConstraint();
    return constraint === undefined ? [] : [constraint];
  }
  return (ts.isUnionTypeNode(node) ? node.types : [node]).map((part) =>
    checker.getTypeFromTypeNode(part),
  );
}

// A type text without the `import("<absolute path>").` qualifier, which would
// make a key depend on the checkout.
function readable(text: string): string {
  return text.replace(/import\("[^"]*"\)\./g, "");
}

function isTable(type: ts.Type): boolean {
  const parts = type.isIntersection() ? type.types : [type];
  return parts.every((part) => (part.flags & ts.TypeFlags.Object) !== 0);
}

// The type each table `signature` accepts for argument `index` declares for
// property `name`. An optional property's type holds `undefined` even under
// `exactOptionalPropertyTypes`, which only refuses writing it.
function propertyTypes(
  signature: ts.Signature,
  index: number,
  name: string,
  checker: ts.TypeChecker,
): ts.Type[] {
  const argument = argumentType(signature, index, checker);
  if (argument === undefined) return [];
  const type = checker.getNonNullableType(constrained(argument));
  return (type.isUnion() ? type.types : [type]).flatMap((table) => {
    const property = isTable(table) ? checker.getPropertyOfType(table, name) : undefined;
    return property === undefined ? [] : [checker.getTypeOfSymbol(property)];
  });
}

// The properties a table argument may hold: those the base call's literal
// holds and those any signature declares for it.
function propertyNames(
  signatures: readonly ts.Signature[],
  index: number,
  literal: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
): string[] {
  const names = new Set<string>();
  for (const property of literal.properties) {
    if (ts.isPropertyAssignment(property) && IDENTIFIER.test(property.name.getText())) {
      names.add(property.name.getText());
    }
  }
  for (const signature of signatures) {
    const argument = argumentType(signature, index, checker);
    if (argument === undefined) continue;
    const type = checker.getNonNullableType(constrained(argument));
    for (const table of type.isUnion() ? type.types : [type]) {
      if (!isTable(table)) continue;
      if (checker.isArrayType(table) || checker.isTupleType(table)) continue;
      if (table.getCallSignatures().length > 0) continue;
      for (const property of checker.getPropertiesOfType(table)) {
        if (IDENTIFIER.test(property.name)) names.add(property.name);
      }
    }
  }
  return [...names];
}

function isNamed(type: ts.Type): boolean {
  if (type.aliasSymbol !== undefined) return true;
  const symbol = type.getSymbol();
  return symbol !== undefined && !ANONYMOUS.has(symbol.name);
}

function isEmptyObject(type: ts.Type, checker: ts.TypeChecker): boolean {
  return (
    (type.flags & ts.TypeFlags.Object) !== 0 &&
    checker.getPropertiesOfType(type).length === 0 &&
    type.getCallSignatures().length === 0 &&
    type.getConstructSignatures().length === 0
  );
}

function addMember(domain: Domain, member: Member): void {
  if (!domain.members.some((known) => known.text === member.text)) domain.members.push(member);
}

// Splits `type` into the members of a slot's domain: literals, `true` and
// `false`, `undefined` and named non-primitive types. `string`, `number` and
// `string & {}` open it instead.
function split(type: ts.Type, checker: ts.TypeChecker, domain: Domain, depth = 0): void {
  if (depth > 8) return;
  const flags = type.flags;
  if (flags & ts.TypeFlags.TypeParameter) {
    for (const part of constraintParts(type, checker)) split(part, checker, domain, depth + 1);
    return;
  }
  if (
    flags &
    (ts.TypeFlags.IndexedAccess |
      ts.TypeFlags.Conditional |
      ts.TypeFlags.Substitution |
      ts.TypeFlags.Index)
  ) {
    const constraint = checker.getBaseConstraintOfType(type);
    if (constraint !== undefined && constraint !== type) {
      split(constraint, checker, domain, depth + 1);
    }
    return;
  }
  if (type.isUnion()) {
    for (const member of type.types) split(member, checker, domain, depth + 1);
    return;
  }
  const text = checker.typeToString(type, undefined, TYPE_TEXT);
  if (type.isStringLiteral()) {
    addMember(domain, { text, literalOf: "string" });
  } else if (type.isNumberLiteral()) {
    addMember(domain, { text, literalOf: "number" });
  } else if (flags & (ts.TypeFlags.BooleanLiteral | ts.TypeFlags.Undefined)) {
    addMember(domain, { text });
  } else if (flags & ts.TypeFlags.String) {
    domain.open.add("string");
  } else if (flags & ts.TypeFlags.Number) {
    domain.open.add("number");
  } else if (type.isIntersection()) {
    const primitive = type.types.find(
      (member) => member.flags & (ts.TypeFlags.String | ts.TypeFlags.Number),
    );
    if (
      primitive !== undefined &&
      type.types.every((member) => member === primitive || isEmptyObject(member, checker))
    ) {
      domain.open.add(primitive.flags & ts.TypeFlags.String ? "string" : "number");
    } else if (isNamed(type)) {
      addMember(domain, { text });
    }
  } else if (flags & ts.TypeFlags.Object && isNamed(type)) {
    addMember(domain, { text });
  }
}

function domainOf(declared: readonly (ts.Type | undefined)[], checker: ts.TypeChecker): Domain {
  const domain: Domain = { members: [], open: new Set() };
  for (const type of declared) {
    if (type !== undefined) split(type, checker, domain);
  }
  return domain;
}

function replaced(text: string, start: number, end: number, value: string): string {
  return `${text.slice(0, start)}${value}${text.slice(end)}`;
}

// The outermost call in `node` whose callee reads `name`.
function callTo(node: ts.Node, name: string, source: ts.SourceFile): ts.CallExpression | undefined {
  if (ts.isCallExpression(node) && node.expression.getText(source) === name) return node;
  return ts.forEachChild(node, (child) => callTo(child, name, source));
}

// The call to `call.name` in a base call, with the source parsed from it.
function parsedCall(
  call: BaseCall,
): { readonly source: ts.SourceFile; readonly target: ts.CallExpression } | undefined {
  const source = ts.createSourceFile("base.ts", call.call, ts.ScriptTarget.Latest, true);
  const [statement] = source.statements;
  if (
    statement === undefined ||
    !ts.isExpressionStatement(statement) ||
    !ts.isCallExpression(statement.expression)
  ) {
    return undefined;
  }
  return {
    source,
    target: callTo(statement.expression, call.name, source) ?? statement.expression,
  };
}

// Each argument of the call to `call.name` and each property of a table
// argument, with the base call's text that puts a widened value there.
function slotsOf(
  call: BaseCall,
  signatures: readonly ts.Signature[],
  checker: ts.TypeChecker,
): Slot[] {
  const parsed = parsedCall(call);
  if (parsed === undefined) return [];
  const { source, target } = parsed;
  const overload = /^overload(\d+)-/.exec(call.variant)?.[1];
  const own = signatures[overload === undefined ? 0 : Number(overload) - 1];
  if (own === undefined) return [];
  const text = call.call;
  const slots: Slot[] = [];
  target.arguments.forEach((argument, index) => {
    const params = own.getParameters();
    const param = params[Math.min(index, params.length - 1)];
    const name = param?.name ?? `arg${index + 1}`;
    slots.push({
      fn: call.name,
      variant: call.variant,
      name,
      template: replaced(text, argument.getStart(source), argument.end, PLACEHOLDER),
      domain: domainOf(
        signatures.map((signature) => argumentType(signature, index, checker)),
        checker,
      ),
    });
    if (!ts.isObjectLiteralExpression(argument)) return;
    for (const property of propertyNames(signatures, index, argument, checker)) {
      const held = argument.properties.find(
        (candidate) => ts.isPropertyAssignment(candidate) && candidate.name.getText() === property,
      ) as ts.PropertyAssignment | undefined;
      const template =
        held !== undefined
          ? replaced(text, held.initializer.getStart(source), held.initializer.end, PLACEHOLDER)
          : argument.properties.length > 0
            ? replaced(
                text,
                argument.properties.end,
                argument.properties.end,
                `, ${property}: ${PLACEHOLDER}`,
              )
            : replaced(
                text,
                argument.getStart(source),
                argument.end,
                `{ ${property}: ${PLACEHOLDER} }`,
              );
      slots.push({
        fn: call.name,
        variant: call.variant,
        name: `${name}.${property}`,
        template,
        domain: domainOf(
          signatures.flatMap((signature) => propertyTypes(signature, index, property, checker)),
          checker,
        ),
      });
    }
  });
  return slots;
}

const OMITTED = "omitted";

// The last argument of a base call that another base call of the same function
// leaves out. A binding records how the engine treats `nil` passed last, where
// `f(a, nil)` runs as `f(a)` or raises; a `nil` before other arguments can take
// another branch, so an argument the call passes before its last is no slot.
interface OmittedSlot {
  readonly fn: string;
  readonly variant: string;
  // 1-based, as the engine counts arguments.
  readonly index: number;
  readonly template: string;
  // `undefined` when no signature declares a type for the argument.
  readonly form: Form | undefined;
  // The base call passing the argument, and the base calls leaving it out that
  // hold the most of its leading arguments unchanged.
  readonly longer: BaseCall;
  readonly shorter: readonly BaseCall[];
}

// Whether `signature` takes a call of `count` arguments.
function admits(signature: ts.Signature, count: number, checker: ts.TypeChecker): boolean {
  const params = signature.getParameters();
  const required = params.filter((param) => {
    const declaration = param.valueDeclaration;
    return (
      declaration !== undefined &&
      ts.isParameter(declaration) &&
      declaration.dotDotDotToken === undefined &&
      !checker.isOptionalParameter(declaration)
    );
  }).length;
  return required <= count && (restIndex(signature) !== undefined || params.length >= count);
}

// A following `|` extends a function, constructor or conditional type's last
// part instead of joining the union, so such a constituent is parenthesized.
function unionConstituent(text: string): string {
  const source = ts.createSourceFile("constituent.ts", `type T = ${text};`, ts.ScriptTarget.Latest);
  const [statement] = source.statements;
  if (statement === undefined || !ts.isTypeAliasDeclaration(statement)) return text;
  const node = statement.type;
  return ts.isFunctionTypeNode(node) ||
    ts.isConstructorTypeNode(node) ||
    ts.isConditionalTypeNode(node)
    ? `(${text})`
    : text;
}

// Each type a signature taking `index + 1` arguments declares for the last, its
// constraint in place of a type parameter, or `undefined`.
function omittedForm(
  signatures: readonly ts.Signature[],
  index: number,
  checker: ts.TypeChecker,
): Form | undefined {
  const texts = new Set<string>();
  for (const signature of signatures) {
    if (!admits(signature, index + 1, checker)) continue;
    const declared = argumentType(signature, index, checker);
    if (declared === undefined) continue;
    const type = checker.getBaseConstraintOfType(declared) ?? declared;
    for (const part of type.isUnion() ? type.types : [type]) {
      texts.add(checker.typeToString(part, undefined, TYPE_TEXT));
    }
  }
  if (texts.size === 0) return undefined;
  texts.delete("undefined");
  if (texts.has("true") && texts.has("false")) {
    texts.delete("true");
    texts.delete("false");
    texts.add("boolean");
  }
  return {
    label: OMITTED,
    text: [...[...texts].map(unionConstituent), "undefined"].join(" | "),
    members: [],
  };
}

function omittedSlotsOf(
  calls: readonly BaseCall[],
  signatures: readonly ts.Signature[],
  checker: ts.TypeChecker,
): OmittedSlot[] {
  const parsed = calls.flatMap((call) => {
    const own = parsedCall(call);
    if (own === undefined) return [];
    const texts = own.target.arguments.map((argument) => argument.getText(own.source));
    return [{ call, ...own, texts }];
  });
  const slots: OmittedSlot[] = [];
  for (const longer of parsed) {
    const index = longer.texts.length - 1;
    const argument = longer.target.arguments[index];
    if (argument === undefined || !parsed.some((other) => other.texts.length <= index)) continue;
    const leading = parsed.filter(
      (other) =>
        other.texts.length <= index && other.texts.every((text, at) => text === longer.texts[at]),
    );
    const most = Math.max(...leading.map((other) => other.texts.length));
    slots.push({
      fn: longer.call.name,
      variant: longer.call.variant,
      index: index + 1,
      template: replaced(
        longer.call.call,
        argument.getStart(longer.source),
        argument.end,
        PLACEHOLDER,
      ),
      form: omittedForm(signatures, index, checker),
      longer: longer.call,
      shorter: leading.filter((other) => other.texts.length === most).map((other) => other.call),
    });
  }
  return slots;
}

function memberForm(member: Member): Form {
  return { label: readable(member.text), text: member.text, members: [] };
}

// The member forms and the widened forms that need no check result to build:
// the union of the finite members, `boolean` and the open primitive.
function formsOf(domain: Domain): Form[] {
  const forms: Form[] = domain.members.map(memberForm);
  const texts = domain.members.map((member) => member.text);
  const labels = texts.map(readable);
  const both = texts.includes("true") && texts.includes("false");
  if (both) forms.push({ label: "boolean", text: "boolean", members: ["true", "false"] });
  const unionText = (
    both ? ["boolean", ...texts.filter((text) => text !== "true" && text !== "false")] : texts
  ).join(" | ");
  if (texts.length >= 2) forms.push({ label: "union", text: unionText, members: labels });
  if (domain.open.size > 0) {
    const open = [...domain.open];
    forms.push({
      label: "base",
      text: open.join(" | "),
      members: domain.members
        .filter((member) => member.literalOf !== undefined && domain.open.has(member.literalOf))
        .map((member) => readable(member.text)),
    });
  }
  const seen = new Set<string>();
  return forms.filter((form) => {
    if (seen.has(form.text)) return false;
    seen.add(form.text);
    return true;
  });
}

type Placed = Slot | OmittedSlot;

interface Checked {
  readonly checker: ts.TypeChecker;
  // Each slot's forms, by label, with the call the checker made of it.
  readonly results: ReadonlyMap<Placed, ReadonlyMap<string, CheckedCall>>;
  // Each form whose type text the checker rejects, with its errors.
  readonly invalid: ReadonlyMap<Placed, ReadonlyMap<string, readonly string[]>>;
  // Each call checked as written, by its text.
  readonly raw: ReadonlyMap<string, CheckedCall>;
}

function check(
  program: ts.Program,
  plan: ReadonlyMap<Placed, readonly Form[]>,
  prelude: readonly string[],
  raw: readonly string[] = [],
): Checked {
  if (plan.size === 0 && raw.length === 0) {
    return {
      checker: program.getTypeChecker(),
      results: new Map(),
      invalid: new Map(),
      raw: new Map(),
    };
  }
  const bindings = new Map<string, string>();
  const calls: string[] = [];
  const placed: [Placed, Form][] = [];
  for (const [slot, forms] of plan) {
    for (const form of forms) {
      let binding = bindings.get(form.text);
      if (binding === undefined) {
        binding = `__w${bindings.size}`;
        bindings.set(form.text, binding);
      }
      calls.push(slot.template.replace(PLACEHOLDER, binding));
      placed.push([slot, form]);
    }
  }
  const texts = [...bindings.keys()];
  const declarations = texts.map((text) => `declare const ${bindings.get(text)}: ${text};`);
  const checked = checkCalls(program, [...calls, ...raw], declarations, prelude);
  const declarationErrors = new Map(
    texts.map((text, i) => [text, checked.declarations[i] ?? []] as const),
  );
  const results = new Map<Placed, Map<string, CheckedCall>>();
  const invalid = new Map<Placed, Map<string, readonly string[]>>();
  placed.forEach(([slot, form], i) => {
    const errors = declarationErrors.get(form.text) ?? [];
    if (errors.length > 0) {
      const own = invalid.get(slot) ?? new Map<string, readonly string[]>();
      own.set(form.label, errors);
      invalid.set(slot, own);
      return;
    }
    const own = results.get(slot) ?? new Map<string, CheckedCall>();
    own.set(form.label, checked.calls[i] as CheckedCall);
    results.set(slot, own);
  });
  const rawResults = new Map(
    raw.map((call, i) => [call, checked.calls[calls.length + i] as CheckedCall] as const),
  );
  return { checker: checked.checker, results, invalid, raw: rawResults };
}

function typeText(type: ts.Type, checker: ts.TypeChecker): string {
  return readable(checker.typeToString(type, undefined, TYPE_TEXT));
}

// Where the widened call resolves to a type the call `subject` names does not
// fit, a sentence naming it: a captured value's type when the call captures
// one, else its return or a callback parameter's type.
function uncovered(
  subject: string,
  ownCall: CheckedCall,
  widenedCall: CheckedCall,
  checker: ts.TypeChecker,
): string | undefined {
  const captured = widenedCall.captures ?? [];
  if (captured.length > 0) {
    for (const [at, type] of captured.entries()) {
      const ownType = ownCall.captures?.[at];
      if (ownType !== undefined && !checker.isTypeAssignableTo(ownType, type)) {
        return `captures ${typeText(type, checker)}, but ${subject} captures ${typeText(ownType, checker)}`;
      }
    }
    return undefined;
  }
  const own = ownCall.signature as ts.Signature;
  const widened = widenedCall.signature as ts.Signature;
  const returned = own.getReturnType();
  const widenedReturn = widened.getReturnType();
  if (!checker.isTypeAssignableTo(returned, widenedReturn)) {
    return `returns ${typeText(widenedReturn, checker)}, but ${subject} returns ${typeText(returned, checker)}`;
  }
  const params = widened.getParameters();
  for (const [index, param] of params.entries()) {
    const ownParam = own.getParameters()[index];
    if (ownParam === undefined) continue;
    const callback = checker.getNonNullableType(checker.getTypeOfSymbol(param));
    const ownCallback = checker.getNonNullableType(checker.getTypeOfSymbol(ownParam));
    const [signature] = callback.getCallSignatures();
    const [ownSignature] = ownCallback.getCallSignatures();
    if (signature === undefined || ownSignature === undefined) continue;
    for (const [at, received] of signature.getParameters().entries()) {
      const ownReceived = ownSignature.getParameters()[at];
      if (ownReceived === undefined) continue;
      const passed = checker.getTypeOfSymbol(ownReceived);
      const declared = checker.getTypeOfSymbol(received);
      if (!checker.isTypeAssignableTo(passed, declared)) {
        return `callback ${param.name} parameter ${received.name} is typed ${typeText(declared, checker)}, but ${subject} passes ${typeText(passed, checker)}`;
      }
    }
  }
  return undefined;
}

function judge(
  slot: Slot,
  form: Form,
  results: ReadonlyMap<string, CheckedCall>,
  checker: ts.TypeChecker,
): WideningFinding | undefined {
  const widened = results.get(form.label);
  if (widened === undefined) return undefined;
  const members = form.members.flatMap((label) => {
    const result = results.get(label);
    return result === undefined ? [] : [[label, result] as const];
  });
  if (members.length < form.members.length) return undefined;
  const open = form.label === "base";
  const finding = (rule: WideningRule, detail: string): WideningFinding => ({
    fn: slot.fn,
    variant: slot.variant,
    slot: slot.name,
    form: form.label,
    rule,
    verdictable: open && rule === "sound",
    detail,
  });
  const rejected = members.filter(([, result]) => result.signature === undefined);
  if (widened.signature === undefined) {
    if (rejected.length > 0 || (form.label !== "union" && form.label !== "boolean")) {
      return undefined;
    }
    return finding(
      "complete",
      `accepts each member but rejects ${readable(form.text)}: ${widened.errors.join("; ")}`,
    );
  }
  const [first] = rejected;
  if (first !== undefined) {
    const more = rejected.length > 1 ? ` and ${rejected.length - 1} more` : "";
    return finding(
      "sound",
      `accepts ${readable(form.text)}, but rejects member ${first[0]}${more}: ${first[1].errors.join("; ")}`,
    );
  }
  for (const [label, result] of members) {
    const detail = uncovered(`member ${label}`, result, widened, checker);
    if (detail !== undefined) return finding("sound", detail);
  }
  return undefined;
}

// An omitted argument's form judged against the engine's nil handling there:
// where the engine accepts nil, the form compiles with a result covering the
// calls passing and leaving out the argument; where it raises, it does not
// compile.
function judgeOmitted(
  slot: OmittedSlot,
  form: Form,
  handling: NilHandling,
  widened: CheckedCall | undefined,
  raw: ReadonlyMap<string, CheckedCall>,
  checker: ts.TypeChecker,
): WideningFinding | undefined {
  if (widened === undefined) return undefined;
  const text = readable(form.text);
  const finding = (rule: WideningRule, detail: string): WideningFinding => ({
    fn: slot.fn,
    variant: slot.variant,
    slot: String(slot.index),
    form: form.label,
    rule,
    verdictable: false,
    detail,
  });
  if (handling === "raises") {
    if (widened.signature === undefined) return undefined;
    return finding(
      "sound",
      `accepts ${text}, but the engine raises on nil at argument ${slot.index}`,
    );
  }
  if (widened.signature === undefined) {
    return finding(
      "complete",
      `rejects ${text}, but the engine accepts nil at argument ${slot.index}: ${widened.errors.join("; ")}`,
    );
  }
  for (const call of [...slot.shorter, slot.longer]) {
    const own = raw.get(call.call);
    if (own?.signature === undefined) continue;
    const detail = uncovered(`call ${call.variant}`, own, widened, checker);
    if (detail !== undefined) return finding("sound", detail);
  }
  return undefined;
}

function literalDomain(literals: readonly string[]): Domain {
  return {
    members: literals.map((literal) => ({ text: JSON.stringify(literal), literalOf: "string" })),
    open: new Set(["string"]),
  };
}

const bindingSlotCache = new Map<string, ReadonlyMap<string, readonly BindingSlot[]>>();

// The nil handling `target`'s bindings record, read on first use: a slot the
// binding requires, or raises on when passed nil, raises; any other optional
// slot accepts nil; a slot it reads in a way the extractor cannot follow, or
// never reads, records nothing.
function bindingNilHandling(
  target: ApiTarget,
): (fn: string, slot: number) => NilHandling | undefined {
  return (fn, index) => {
    let functions = bindingSlotCache.get(target.id);
    if (functions === undefined) {
      functions = new Map(
        mergeBindings(readBindingsForTarget(target.id).functions).map(
          (binding) => [`${binding.namespace}.${binding.name}`, binding.slots] as const,
        ),
      );
      bindingSlotCache.set(target.id, functions);
    }
    const slot = functions.get(fn)?.find((candidate) => candidate.index === index);
    if (slot === undefined || slot.manual !== undefined) return undefined;
    return slot.optional && slot.nilRaises !== true ? "accepts" : "raises";
  };
}

// The engine functions `target` declares, with the witness generator's base
// calls and the nil handling its bindings record.
export function engineSurface(
  program: ts.Program,
  target: ApiTarget = probeTarget(),
): WideningSurface {
  const { functions } = declaredMembers(program, comparedNamespaces(target));
  const { calls, unwitnessed } = baseCalls(target, program);
  return { functions, calls, unwitnessed, nilHandling: bindingNilHandling(target) };
}

// The slots of every function of `surface` that branches on an argument's
// type, its omitted arguments when the surface records nil handling, and the
// branching functions no base call reaches.
function branchingSlots(
  surface: WideningSurface,
  checker: ts.TypeChecker,
): { slots: Slot[]; omitted: OmittedSlot[]; unchecked: UncheckedEntry[] } {
  const callsByName = new Map<string, BaseCall[]>();
  for (const call of surface.calls) {
    const own = callsByName.get(call.name) ?? [];
    own.push(call);
    callsByName.set(call.name, own);
  }
  const unchecked: UncheckedEntry[] = [];
  const slots: Slot[] = [];
  const omitted: OmittedSlot[] = [];
  for (const [fqn, symbol] of surface.functions) {
    const signatures = checker
      .getTypeOfSymbol(symbol)
      .getCallSignatures()
      .filter((signature) => !isTypeApplication(signature));
    const branching =
      signatures.length > 1 ||
      signatures.some((signature) => (signature.getTypeParameters()?.length ?? 0) > 0);
    if (!branching) continue;
    const calls = callsByName.get(fqn) ?? [];
    if (calls.length === 0) {
      const reasons = surface.unwitnessed
        .filter((entry) => entry.name === fqn || entry.name.startsWith(`${fqn}:`))
        .map((entry) => entry.reason);
      unchecked.push({
        fn: fqn,
        key: `${fqn} unchecked`,
        reason: [...new Set(reasons)].join("; ") || "the witness generator builds no call",
      });
      continue;
    }
    const templates = new Set<string>();
    for (const call of calls) {
      for (const declaredSlot of slotsOf(call, signatures, checker)) {
        if (templates.has(declaredSlot.template)) continue;
        templates.add(declaredSlot.template);
        const literals = surface.literals?.get(`${fqn} ${declaredSlot.name}`);
        const slot =
          literals === undefined
            ? declaredSlot
            : { ...declaredSlot, domain: literalDomain(literals) };
        const { members, open } = slot.domain;
        if (members.length >= 2 || open.size > 0) slots.push(slot);
      }
    }
    if (surface.nilHandling === undefined) continue;
    const omittedTemplates = new Set<string>();
    for (const slot of omittedSlotsOf(calls, signatures, checker)) {
      if (omittedTemplates.has(slot.template)) continue;
      omittedTemplates.add(slot.template);
      omitted.push(slot);
    }
  }
  return { slots, omitted, unchecked };
}

// A call of a branching function with one slot holding a literal member of its
// domain, and what the overload the checker resolves that call to returns.
export interface MemberCall {
  readonly name: string;
  readonly variant: string;
  readonly slot: string;
  // The member's type text: `"color"`, `2`, `true` or `undefined`.
  readonly member: string;
  readonly call: string;
  readonly returns: DeclaredReturns;
}

const LITERAL_VALUES = new Set(["true", "false", "undefined"]);

function isLiteralValue(member: Member): boolean {
  return member.literalOf !== undefined || LITERAL_VALUES.has(member.text);
}

// Each slot of the widening gate called with each of its literal members that
// the checker accepts. The literal stands in the call itself, so the checker
// types the text the engine runs.
export function memberCalls(
  program: ts.Program,
  surface: WideningSurface = engineSurface(program),
): MemberCall[] {
  const { slots } = branchingSlots(surface, program.getTypeChecker());
  const planned = slots.flatMap((slot) =>
    slot.domain.members.filter(isLiteralValue).map((member) => ({
      name: slot.fn,
      variant: slot.variant,
      slot: slot.name,
      member: member.text,
      call: slot.template.replace(PLACEHOLDER, () => member.text),
    })),
  );
  if (planned.length === 0) return [];
  const checked = checkCalls(
    program,
    planned.map((call) => call.call),
    [],
    surface.prelude ?? [],
  );
  return planned.flatMap((call, i) => {
    const result = checked.calls[i];
    if (result?.signature === undefined || result.errors.length > 0) return [];
    return [{ ...call, returns: declaredReturns(result.signature, checked.checker) }];
  });
}

// Every function of `surface` that branches on an argument's type, called with
// each member of each argument's domain and with widened forms of it, judged
// against the member calls.
export function wideningFindings(
  program: ts.Program,
  surface: WideningSurface = engineSurface(program),
): Widening {
  const checker = program.getTypeChecker();
  const prelude = surface.prelude ?? [];
  const { slots, omitted, unchecked } = branchingSlots(surface, checker);
  const plan = new Map(slots.map((slot) => [slot, formsOf(slot.domain)] as const));
  const omittedKey = (slot: OmittedSlot) =>
    `${slot.fn} ${slot.variant} ${slot.index} ${OMITTED} unchecked`;
  const handled = omitted.flatMap((slot) => {
    const handling = surface.nilHandling?.(slot.fn, slot.index);
    const { form } = slot;
    if (handling !== undefined && form !== undefined) return [{ slot, form, handling }];
    unchecked.push({
      fn: slot.fn,
      key: omittedKey(slot),
      reason:
        handling === undefined
          ? "no binding records the slot's nil handling"
          : "no signature declares a type for the argument",
    });
    return [];
  });
  const raw = [
    ...new Set(
      handled
        .filter(({ handling }) => handling === "accepts")
        .flatMap(({ slot }) => [slot.longer, ...slot.shorter].map((call) => call.call)),
    ),
  ];
  const first = check(
    program,
    new Map<Placed, readonly Form[]>([
      ...plan,
      ...handled.map(({ slot, form }) => [slot, [form]] as const),
    ]),
    prelude,
    raw,
  );
  // The first accepted and the first rejected member, which need the member
  // results, are checked with their two members in a second pass.
  const mixed = new Map<Slot, Form[]>();
  for (const slot of slots) {
    const results = first.results.get(slot);
    if (results === undefined) continue;
    const forms = slot.domain.members.map(memberForm);
    const accepted = forms.find((form) => results.get(form.label)?.signature !== undefined);
    const rejected = forms.find(
      (form) => results.has(form.label) && results.get(form.label)?.signature === undefined,
    );
    if (accepted === undefined || rejected === undefined) continue;
    const text = `${accepted.text} | ${rejected.text}`;
    if ((plan.get(slot) ?? []).some((form) => form.text === text)) continue;
    mixed.set(slot, [
      accepted,
      rejected,
      { label: "mixed", text, members: [accepted.label, rejected.label] },
    ]);
  }
  const second = check(program, mixed, prelude);
  const findings: WideningFinding[] = [];
  const checked: CheckedSlot[] = [];
  for (const slot of slots) {
    const forms = [...(plan.get(slot) ?? [])];
    const invalid = first.invalid.get(slot);
    for (const [label, errors] of invalid ?? []) {
      unchecked.push({
        fn: slot.fn,
        key: `${slot.fn} ${slot.variant} ${slot.name} ${label} unchecked`,
        reason: `the form's type does not compile: ${errors.join("; ")}`,
      });
    }
    const results = first.results.get(slot) ?? new Map();
    const judged: (WideningFinding | undefined)[] = [];
    const order = ["boolean", "union", "mixed", "base"];
    for (const label of order) {
      if (label === "mixed") {
        const own = mixed.get(slot)?.find((form) => form.label === "mixed");
        const ownResults = second.results.get(slot);
        if (own !== undefined && ownResults !== undefined) {
          forms.push(own);
          judged.push(judge(slot, own, ownResults, second.checker));
        }
        continue;
      }
      const form = forms.find((candidate) => candidate.label === label);
      if (form !== undefined) judged.push(judge(slot, form, results, first.checker));
    }
    findings.push(...judged.filter((finding) => finding !== undefined));
    checked.push({
      fn: slot.fn,
      variant: slot.variant,
      slot: slot.name,
      forms: forms.filter((form) => invalid?.has(form.label) !== true).map((form) => form.label),
    });
  }
  for (const { slot, form, handling } of handled) {
    const errors = first.invalid.get(slot)?.get(form.label);
    if (errors !== undefined) {
      unchecked.push({
        fn: slot.fn,
        key: omittedKey(slot),
        reason: `the form's type does not compile: ${errors.join("; ")}`,
      });
      continue;
    }
    const widened = first.results.get(slot)?.get(form.label);
    const finding = judgeOmitted(slot, form, handling, widened, first.raw, first.checker);
    if (finding !== undefined) findings.push(finding);
    checked.push({
      fn: slot.fn,
      variant: slot.variant,
      slot: String(slot.index),
      forms: [OMITTED],
    });
  }
  return { findings, checked, unchecked };
}

const ECS_NAMESPACE = "ecs";
// The components of the fixture's `Ent` a name slot's base call holds, and the
// patterns a pattern slot is checked with: one requiring two components, one
// requiring none.
const ECS_NAMES = ["position", "velocity"] as const;
const ECS_PATTERNS = ["position&velocity", "velocity|frozen"] as const;
const UNWRAP_FILTER = "__filterOf";
const CAPTURING_DEF = "onAdd(e) { __capture(e); }";

function isFilterAlias(type: ts.Type): boolean {
  return type.aliasSymbol?.name === "Filter";
}

// `direct` for a function that returns a filter, `result` for one that returns
// it under `filter` in one member of a result union.
function filterReturn(returned: ts.Type, checker: ts.TypeChecker): "direct" | "result" | undefined {
  if (isFilterAlias(returned)) return "direct";
  const held = (returned.isUnion() ? returned.types : [returned]).some((member) => {
    const property = checker.getPropertyOfType(member, "filter");
    return property !== undefined && isFilterAlias(checker.getTypeOfSymbol(property));
  });
  return held ? "result" : undefined;
}

function isSystemFactory(returned: ts.Type): boolean {
  const name = returned.aliasSymbol?.name ?? returned.getSymbol()?.name ?? "";
  return name.endsWith("SystemFactory");
}

// The definition a system over a filter takes, with each property it requires
// set: `onAdd` captures the entity it receives.
function capturingDefinition(factory: ts.Type, checker: ts.TypeChecker): string {
  const filtered = factory
    .getCallSignatures()
    .find((signature) => signature.getParameters().length === 2);
  const def = filtered?.getParameters()[1];
  const required =
    def === undefined
      ? []
      : checker
          .getPropertiesOfType(checker.getTypeOfSymbol(def))
          .filter((property) => (property.flags & ts.SymbolFlags.Optional) === 0)
          .map((property) => `, ${property.name}: undefined as never`);
  return `{ ${CAPTURING_DEF}${required.join("")} }`;
}

// The filter constructors of the `ecs` namespace that the program's root, the
// ECS fixture, exports beside its entity type `Ent`. Each constructor builds
// the filter of a system over `Ent` once per system factory of the namespace,
// so each factory's callbacks are judged on the entity each filter form lets
// through; the system captures the entity its callback receives. A factory's
// only argument picks a cached system, so it is no slot. A name slot is
// checked with `Ent`'s keys, a pattern slot with `ECS_PATTERNS`.
export function ecsSurface(program: ts.Program): WideningSurface {
  const checker = program.getTypeChecker();
  const [root] = program.getRootFileNames();
  const source = root === undefined ? undefined : program.getSourceFile(root);
  const fixture = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (root === undefined || fixture === undefined) {
    throw new Error("api-probe: the ECS program's root is not a module");
  }
  const exported = new Map(checker.getExportsOfModule(fixture).map((s) => [s.name, s] as const));
  const ent = exported.get("Ent");
  const namespace = exported.get(ECS_NAMESPACE);
  if (ent === undefined || namespace === undefined) {
    throw new Error(`api-probe: ${root} exports no Ent or ${ECS_NAMESPACE}`);
  }
  const names = checker
    .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(ent))
    .map((property) => property.name);
  const functions = new Map<string, ts.Symbol>();
  const calls: BaseCall[] = [];
  const unwitnessed: Unwitnessed[] = [];
  const literals = new Map<string, readonly string[]>();
  const exports = checker.getExportsOfModule(checker.getAliasedSymbol(namespace));
  const factories: { readonly name: string; readonly definition: string }[] = [];
  for (const symbol of exports) {
    const [signature] = checker.getTypeOfSymbol(symbol).getCallSignatures();
    const returned = signature?.getReturnType();
    if (returned === undefined || !isSystemFactory(returned)) continue;
    factories.push({
      name: `${ECS_NAMESPACE}.${symbol.name}`,
      definition: capturingDefinition(returned, checker),
    });
  }
  for (const symbol of exports) {
    const fn = `${ECS_NAMESPACE}.${symbol.name}`;
    const [signature] = checker.getTypeOfSymbol(symbol).getCallSignatures();
    if (signature === undefined) continue;
    const built = filterReturn(signature.getReturnType(), checker);
    if (built === undefined) continue;
    functions.set(fn, symbol);
    const params = signature.getParameters();
    const [param] = params;
    const argument = argumentType(signature, 0, checker);
    const rest = restIndex(signature) === 0;
    const pattern =
      !rest && argument !== undefined && (constrained(argument).flags & ts.TypeFlags.String) !== 0;
    if (param === undefined || params.length !== 1 || !(rest || pattern)) {
      unwitnessed.push({
        name: fn,
        reason: "a filter constructor the gate calls takes a rest of names or one pattern",
      });
      continue;
    }
    if (factories.length === 0) {
      unwitnessed.push({ name: fn, reason: "no system factory to build a system with" });
      continue;
    }
    literals.set(`${fn} ${param.name}`, rest ? names : ECS_PATTERNS);
    const args = rest
      ? ECS_NAMES.map((name) => JSON.stringify(name)).join(", ")
      : JSON.stringify(ECS_PATTERNS[0]);
    const filterText = built === "direct" ? `${fn}(${args})` : `${UNWRAP_FILTER}(${fn}(${args}))`;
    for (const factory of factories) {
      calls.push({
        name: fn,
        variant: factory.name,
        call: `${factory.name}<Ent>()(${filterText}, ${factory.definition})`,
      });
    }
  }
  const specifier = `./${basename(root).replace(/\.ts$/, "")}`;
  return {
    functions,
    calls,
    unwitnessed,
    literals,
    prelude: [
      `import { type Ent, ${ECS_NAMESPACE} } from ${JSON.stringify(specifier)};`,
      `declare function ${UNWRAP_FILTER}<R>(result: R): R extends { readonly ok: true; readonly filter: infer F } ? F : never;`,
    ],
  };
}
