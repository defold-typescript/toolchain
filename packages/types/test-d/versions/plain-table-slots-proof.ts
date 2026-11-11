export {};

// A parameter the engine checks for a table takes a value typed by an interface
// on every surface, and still rejects engine values, functions and numbers.

interface ProofSave {
  level: number;
  name: string;
}
declare const proofSave: ProofSave;

sys.save("/save.dat", proofSave);
sys.serialize(proofSave);
json.encode(proofSave);
factory.create("#factory", undefined, undefined, proofSave);
collectionfactory.create("#collectionfactory", undefined, undefined, { "/go": proofSave });

// @ts-expect-error a Vector3 is not a table
sys.save("/save.dat", vmath.vector3());
// @ts-expect-error a Hash is not a table
sys.save("/save.dat", hash("x"));
// @ts-expect-error a Url is not a table
sys.save("/save.dat", msg.url());
// @ts-expect-error a function is not a table
sys.save("/save.dat", () => 1);
// @ts-expect-error a number is not a table
sys.save("/save.dat", 42);
