interface HelpFlag {
  readonly flag: string;
  readonly desc: string;
}

interface HelpCommand {
  readonly name: string;
  readonly summary: string;
  readonly usage: string;
  readonly flags: readonly HelpFlag[];
}

const BANNER = "Usage: defold-typescript <command> [options]";

const COMMANDS: readonly HelpCommand[] = [
  {
    name: "init",
    summary: "Add TypeScript scaffolding to an existing Defold project.",
    usage: "defold-typescript init [path]",
    flags: [
      { flag: "--force", desc: "overwrite existing scaffolding files" },
      { flag: "--template <name>", desc: "scaffold from a named template" },
      { flag: "--suppress-install-reminder", desc: "skip the post-init install hint" },
    ],
  },
  {
    name: "init-agents",
    summary: "Write the AGENTS.md and CLAUDE.md agent guides.",
    usage: "defold-typescript init-agents [path]",
    flags: [{ flag: "--force", desc: "overwrite existing agent guides" }],
  },
  {
    name: "build",
    summary: "Transpile TypeScript under src/ to Lua once.",
    usage: "defold-typescript build [path]",
    flags: [
      { flag: "--defold-version <v>", desc: "override the resolved Defold version" },
      { flag: "--channel <c>", desc: "override the resolved Defold channel" },
      { flag: "--force", desc: "rebuild even when outputs look current" },
    ],
  },
  {
    name: "watch",
    summary: "Rebuild incrementally on every save.",
    usage: "defold-typescript watch [path]",
    flags: [{ flag: "--defold-version <v>", desc: "override the resolved Defold version" }],
  },
  {
    name: "wall",
    summary: "Manage generated-file walls in target directories.",
    usage: "defold-typescript wall [dir...]",
    flags: [
      { flag: "--list", desc: "list existing walls instead of writing" },
      { flag: "--remove", desc: "remove walls instead of writing" },
    ],
  },
  {
    name: "setup-debug",
    summary: "Configure editor debugging support.",
    usage: "defold-typescript setup-debug [path]",
    flags: [],
  },
  {
    name: "resolve",
    summary: "Download and cache native-extension type surfaces.",
    usage: "defold-typescript resolve [path]",
    flags: [
      { flag: "--defold-version <v>", desc: "override the resolved Defold version" },
      { flag: "--channel <c>", desc: "override the resolved Defold channel" },
      { flag: "--frozen", desc: "fail instead of fetching when the cache misses" },
    ],
  },
  {
    name: "defold",
    summary: "Run headless Defold (bob.jar) resolve/build/bundle commands.",
    usage: "defold-typescript defold <resolve|build|bundle> [path]",
    flags: [
      { flag: "--defold-version <v>", desc: "override the resolved Defold version" },
      { flag: "--java <path>", desc: "path to the Java runtime used for bob.jar" },
      { flag: "--build-server <url>", desc: "native-extension build-server URL" },
    ],
  },
];

const GLOBAL_FLAGS: readonly HelpFlag[] = [
  { flag: "--json", desc: "emit machine-readable JSON output" },
  { flag: "-v, --version", desc: "print the CLI version and exit" },
  { flag: "-h, --help", desc: "print this help and exit" },
];

export const COMMAND_NAMES: ReadonlySet<string> = new Set(COMMANDS.map((c) => c.name));

function findCommand(subject: string | null): HelpCommand | undefined {
  return subject === null ? undefined : COMMANDS.find((c) => c.name === subject);
}

function flagLines(flags: readonly HelpFlag[]): string[] {
  const width = Math.max(0, ...flags.map((f) => f.flag.length));
  return flags.map((f) => `  ${f.flag.padEnd(width)}  ${f.desc}`);
}

export function renderHelp(subject: string | null): string {
  const command = findCommand(subject);
  if (command === undefined) {
    const width = Math.max(...COMMANDS.map((c) => c.name.length));
    const lines = [
      BANNER,
      "",
      "Commands:",
      ...COMMANDS.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`),
      "",
      "Global flags:",
      ...flagLines(GLOBAL_FLAGS),
      "",
      "Run `defold-typescript <command> --help` for command-specific help.",
    ];
    return `${lines.join("\n")}\n`;
  }
  const lines = [`Usage: ${command.usage}`, "", command.summary];
  if (command.flags.length > 0) {
    lines.push("", "Flags:", ...flagLines(command.flags));
  }
  return `${lines.join("\n")}\n`;
}

export function renderHelpJson(subject: string | null): string {
  const command = findCommand(subject);
  if (command === undefined) {
    return `${JSON.stringify({
      command: "help",
      ok: true,
      commands: COMMANDS.map((c) => ({ name: c.name, summary: c.summary })),
      flags: GLOBAL_FLAGS,
    })}\n`;
  }
  return `${JSON.stringify({
    command: "help",
    ok: true,
    subject: command.name,
    usage: command.usage,
    flags: command.flags,
  })}\n`;
}
