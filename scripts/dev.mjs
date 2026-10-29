import { spawn } from "node:child_process";
// Accept standard preview-runner flags while keeping Next's own CLI syntax.
const args = process.argv
  .slice(2)
  .filter((arg) => arg !== "--strictPort")
  .map((arg) =>
    arg === "--host" ? "--hostname" : arg.replace(/^--host=/, "--hostname="),
  );
if (!args.some((arg) => arg === "--hostname" || arg.startsWith("--hostname=")))
  args.push("--hostname", "127.0.0.1");
if (!args.some((arg) => arg === "--port" || arg.startsWith("--port=")))
  args.push("--port", "5174");
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack", ...args],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
