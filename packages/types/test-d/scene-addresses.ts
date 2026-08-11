/// <reference path="../index.d.ts" />

// The scene-derived address aliases are *suggestion carriers*: a generator
// augments the open interfaces with the ids it found in the project's scenes,
// and the alias keeps accepting every other string. Nothing here may ever
// become a compile error for a project that computes its addresses at runtime.

declare global {
  interface SceneGameObjectAddresses {
    "/player": true;
  }
  interface SceneComponentAddresses {
    "#sprite": true;
  }
}

const dynamic: string = ["/enemy", String(1)].join("");

// Never rejects: an arbitrary string assigns to every alias…
const asGameObject: SceneGameObjectAddress = dynamic;
const asComponent: SceneComponentAddress = dynamic;
const asEither: SceneAddress = dynamic;

// …and every alias assigns back to a plain string.
const backFromGameObject: string = asGameObject;
const backFromComponent: string = asComponent;
const backFromEither: string = asEither;

void backFromGameObject;
void backFromComponent;
void backFromEither;

// The interface keys really drive the union. Both directions are asserted:
// assigning the literal *into* `Extract<…>` is what catches an alias that
// regressed to a bare `string` (`Extract<string, "/player">` is `never`, and a
// one-way assignment out of `never` would stay green).
const extractedGameObject: Extract<SceneGameObjectAddress, "/player"> = "/player";
const narrowedGameObject: "/player" = extractedGameObject;

const extractedComponent: Extract<SceneComponentAddress, "#sprite"> = "#sprite";
const narrowedComponent: "#sprite" = extractedComponent;

// `SceneAddress` extracts from both halves.
const extractedEitherGameObject: Extract<SceneAddress, "/player"> = "/player";
const narrowedEitherGameObject: "/player" = extractedEitherGameObject;

const extractedEitherComponent: Extract<SceneAddress, "#sprite"> = "#sprite";
const narrowedEitherComponent: "#sprite" = extractedEitherComponent;

void narrowedGameObject;
void narrowedComponent;
void narrowedEitherGameObject;
void narrowedEitherComponent;

// The two interfaces stay separate rather than collapsing into one flat union:
// a component id is not a game-object address.
// @ts-expect-error `Extract<SceneGameObjectAddress, "#sprite">` is `never`
const _notAGameObject: Extract<SceneGameObjectAddress, "#sprite"> = "#sprite";

// Call-site compatibility: the retyped slots stay invisible to existing code.
go.get_position(dynamic);
go.get_position(hash("/enemy"));
go.get_position("/player");

const posted: Url = msg.url();
msg.post(msg.url(), "hello");
msg.post(dynamic, "hello");
void posted;

export {};
