import ts from "typescript";
import { comparedNamespaces } from "../../types/scripts/engine-binding-diff";
import { declaredMembers } from "../../types/scripts/lua-kind";
import type { ApiTarget } from "../../types/scripts/regen";
import { type CheckedCall, checkCalls } from "./call-check";
import { baseCalls, isTypeApplication, type ProbeCall, probeTarget } from "./witness";

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
  // primitive of an open domain, or arguments that must agree.
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
  readonly agreeing: boolean;
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

// The type parameter `type` is, or is a member of when it is a union.
function typeParameterOf(type: ts.Type | undefined): ts.Type | undefined {
  if (type === undefined) return undefined;
  if (type.flags & ts.TypeFlags.TypeParameter) return type;
  return type.isUnion()
    ? type.types.find((member) => member.flags & ts.TypeFlags.TypeParameter)
    : undefined;
}

// Whether argument `index` is typed by a type parameter, alone or in a union,
// that types another parameter of the same signature too, so the two must agree.
function isAgreeing(signature: ts.Signature, index: number, checker: ts.TypeChecker): boolean {
  const own = typeParameterOf(argumentType(signature, index, checker));
  if (own === undefined) return false;
  return signature
    .getParameters()
    .some(
      (_, other) =>
        other !== index && typeParameterOf(argumentType(signature, other, checker)) === own,
    );
}

function replaced(text: string, start: number, end: number, value: string): string {
  return `${text.slice(0, start)}${value}${text.slice(end)}`;
}

// Each argument of `call` and each property of a table argument, with the
// call text that puts a widened value there.
function slotsOf(
  call: ProbeCall,
  signatures: readonly ts.Signature[],
  checker: ts.TypeChecker,
): Slot[] {
  const source = ts.createSourceFile("base.ts", call.call, ts.ScriptTarget.Latest, true);
  const [statement] = source.statements;
  if (
    statement === undefined ||
    !ts.isExpressionStatement(statement) ||
    !ts.isCallExpression(statement.expression)
  ) {
    return [];
  }
  const overload = /^overload(\d+)-/.exec(call.variant)?.[1];
  const own = signatures[overload === undefined ? 0 : Number(overload) - 1];
  if (own === undefined) return [];
  const text = call.call;
  const slots: Slot[] = [];
  statement.expression.arguments.forEach((argument, index) => {
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
      agreeing: isAgreeing(own, index, checker),
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
        agreeing: false,
      });
    }
  });
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

interface Checked {
  readonly checker: ts.TypeChecker;
  // Each slot's forms, by label, with the call the checker made of it.
  readonly results: ReadonlyMap<Slot, ReadonlyMap<string, CheckedCall>>;
  // Each form whose type text the checker rejects, with its errors.
  readonly invalid: ReadonlyMap<Slot, ReadonlyMap<string, readonly string[]>>;
}

function check(program: ts.Program, plan: ReadonlyMap<Slot, readonly Form[]>): Checked {
  if (plan.size === 0) {
    return { checker: program.getTypeChecker(), results: new Map(), invalid: new Map() };
  }
  const bindings = new Map<string, string>();
  const calls: string[] = [];
  const placed: [Slot, Form][] = [];
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
  const checked = checkCalls(program, calls, declarations);
  const declarationErrors = new Map(
    texts.map((text, i) => [text, checked.declarations[i] ?? []] as const),
  );
  const results = new Map<Slot, Map<string, CheckedCall>>();
  const invalid = new Map<Slot, Map<string, readonly string[]>>();
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
  return { checker: checked.checker, results, invalid };
}

function typeText(type: ts.Type, checker: ts.TypeChecker): string {
  return readable(checker.typeToString(type, undefined, TYPE_TEXT));
}

// Where the widened call resolves to a return or callback parameter type a
// member call's does not fit, a sentence naming it.
function uncovered(
  member: string,
  own: ts.Signature,
  widened: ts.Signature,
  checker: ts.TypeChecker,
): string | undefined {
  const returned = own.getReturnType();
  const widenedReturn = widened.getReturnType();
  if (!checker.isTypeAssignableTo(returned, widenedReturn)) {
    return `returns ${typeText(widenedReturn, checker)}, but member ${member} returns ${typeText(returned, checker)}`;
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
        return `callback ${param.name} parameter ${received.name} is typed ${typeText(declared, checker)}, but member ${member} passes ${typeText(passed, checker)}`;
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
  if (widened === undefined || form.members.length < 2) return undefined;
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
    verdictable: (open && rule === "sound") || slot.agreeing,
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
    const detail = uncovered(label, result.signature as ts.Signature, widened.signature, checker);
    if (detail !== undefined) return finding("sound", detail);
  }
  return undefined;
}

// Every function on `program`'s surface that branches on an argument's type,
// called with each member of each argument's domain and with widened forms of
// it, judged against the member calls.
export function wideningFindings(program: ts.Program, target: ApiTarget = probeTarget()): Widening {
  const checker = program.getTypeChecker();
  const declared = declaredMembers(program, comparedNamespaces(target));
  const base = baseCalls(target, program);
  const callsByName = new Map<string, ProbeCall[]>();
  for (const call of base.calls) {
    const own = callsByName.get(call.name) ?? [];
    own.push(call);
    callsByName.set(call.name, own);
  }
  const unchecked: UncheckedEntry[] = [];
  const slots: Slot[] = [];
  for (const [fqn, symbol] of declared.functions) {
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
      const reasons = base.unwitnessed
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
      for (const slot of slotsOf(call, signatures, checker)) {
        if (templates.has(slot.template)) continue;
        templates.add(slot.template);
        const { members, open } = slot.domain;
        if (members.length >= 2 || open.size > 0) slots.push(slot);
      }
    }
  }
  const plan = new Map(slots.map((slot) => [slot, formsOf(slot.domain)] as const));
  const first = check(program, plan);
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
  const second = check(program, mixed);
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
  return { findings, checked, unchecked };
}
