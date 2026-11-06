import type { EngineSink } from "./view-run";

// The tutorial's Lua run draws from this Park-Miller generator and seed, so the page and the
// lessons see the same night.
const RANDOM_MODULUS = 2147483647;
const RANDOM_MULTIPLIER = 16807;
const RANDOM_SEED = 12345;

interface Vector {
  x: number;
  y: number;
  z: number;
  w?: number;
}

function isVector(value: unknown): value is Vector {
  return typeof value === "object" && value !== null && "x" in value;
}

function vector3(...args: unknown[]): Vector {
  const [x, y, z] = args;
  if (isVector(x)) {
    return { x: x.x, y: x.y, z: x.z };
  }
  if (args.length === 1 && typeof x === "number") {
    return { x, y: x, z: x };
  }
  return { x: Number(x ?? 0), y: Number(y ?? 0), z: Number(z ?? 0) };
}

function vector4(...args: unknown[]): Vector {
  const [x, y, z, w] = args;
  if (isVector(x)) {
    return { x: x.x, y: x.y, z: x.z, w: x.w ?? 0 };
  }
  if (args.length === 1 && typeof x === "number") {
    return { x, y: x, z: x, w: x };
  }
  return { x: Number(x ?? 0), y: Number(y ?? 0), z: Number(z ?? 0), w: Number(w ?? 0) };
}

function frexp(x: number): [number, number] {
  if (x === 0 || !Number.isFinite(x)) {
    return [x, 0];
  }
  let mantissa = x;
  let exponent = 0;
  while (Math.abs(mantissa) >= 1) {
    mantissa /= 2;
    exponent++;
  }
  while (Math.abs(mantissa) < 0.5) {
    mantissa *= 2;
    exponent--;
  }
  return [mantissa, exponent];
}

function luaMath(): Record<string, unknown> {
  let seed = RANDOM_SEED;
  return {
    abs: Math.abs,
    acos: Math.acos,
    asin: Math.asin,
    atan: Math.atan,
    atan2: Math.atan2,
    ceil: Math.ceil,
    cos: Math.cos,
    cosh: Math.cosh,
    deg: (x: number) => (x * 180) / Math.PI,
    exp: Math.exp,
    floor: Math.floor,
    // C's fmod keeps the dividend's sign, as `%` does.
    fmod: (x: number, y: number) => x % y,
    frexp,
    huge: Number.POSITIVE_INFINITY,
    ldexp: (m: number, e: number) => m * 2 ** e,
    log: Math.log,
    log10: Math.log10,
    max: Math.max,
    min: Math.min,
    modf: (x: number): [number, number] => {
      const whole = Math.trunc(x);
      return [whole, x === whole ? 0 : x - whole];
    },
    pi: Math.PI,
    pow: Math.pow,
    rad: (x: number) => (x * Math.PI) / 180,
    random: (m?: number, n?: number) => {
      seed = (seed * RANDOM_MULTIPLIER) % RANDOM_MODULUS;
      const r = (seed - 1) / (RANDOM_MODULUS - 1);
      if (m === undefined) {
        return r;
      }
      const [low, high] = n === undefined ? [1, m] : [m, n];
      return low + Math.floor(r * (high - low + 1));
    },
    randomseed: (x: number) => {
      const next = Math.trunc(Number(x)) % RANDOM_MODULUS;
      seed = next > 0 ? next : next + RANDOM_MODULUS - 1;
    },
    sin: Math.sin,
    sinh: Math.sinh,
    sqrt: Math.sqrt,
    tan: Math.tan,
    tanh: Math.tanh,
  };
}

/**
 * The engine values a world built the tutorial's way reads, as builtins for a project runner.
 * Each call returns fresh state, so a Restart reseeds `math.random` and renumbers factory
 * instances. A namespace holds only the members listed; the runner stubs the rest.
 */
export function viewBuiltins(emit: EngineSink): Record<string, unknown> {
  let instances = 0;
  return {
    math: luaMath(),
    os: { clock: () => performance.now() / 1000 },
    vmath: { vector3, vector4 },
    factory: {
      // Nothing spawns, so the create is logged as a stub's call would be.
      create: (...args: unknown[]) => {
        emit({ kind: "engine", api: "factory.create", args });
        instances++;
        return `hash: [instance ${instances}]`;
      },
    },
    msg: { url: () => ({}) },
    go: {
      get_position: () => vector3(),
      get_world_position: () => vector3(),
    },
    sys: {
      get_config_string: (_key: string, defaultValue?: string) => defaultValue ?? "",
      get_engine_info: () => ({ is_debug: true }),
    },
  };
}
