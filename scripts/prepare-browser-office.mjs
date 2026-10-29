import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
} from "node:fs";
import path from "node:path";
const root = process.cwd(),
  commit = "e975654679d2cc3ef61d67d93fdce2839327676c";
const target = path.join(root, "public/office"),
  marker = path.join(target, "maildesk-source.json");
if (
  existsSync(marker) &&
  JSON.parse(readFileSync(marker, "utf8")).commit === commit &&
  JSON.parse(readFileSync(marker, "utf8")).integration === 2
)
  process.exit(0);
const source = path.join(root, ".cache/browser-office");
mkdirSync(path.dirname(source), { recursive: true });
function run(cmd, args, cwd = source) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
  if (r.status !== 0)
    throw Error(`Browser Office build failed: ${cmd} (${r.status})`);
}
if (!existsSync(path.join(source, ".git"))) {
  mkdirSync(source, { recursive: true });
  run("git", ["init"]);
  run("git", [
    "remote",
    "add",
    "origin",
    "https://github.com/ranuts/document.git",
  ]);
}
run("git", ["fetch", "--depth", "1", "origin", commit]);
run("git", ["checkout", "--detach", commit]);
run("npx", [
  "--yes",
  "pnpm@11.4.0",
  "install",
  "--frozen-lockfile",
  "--ignore-scripts",
]);
run("npx", ["--yes", "pnpm@11.4.0", "run", "build"]);
rmSync(target, { recursive: true, force: true });
cpSync(path.join(source, "dist"), target, { recursive: true });
// Embed only: restrict the host's optional AI/remote fetch integrations. MailDesk's
// separate AI Studio remains explicit and never receives the open document.
const html = path.join(target, "editor.html");
let content = readFileSync(html, "utf8");
content = content.replace(
  "connect-src 'self' https: http: blob: data:",
  "connect-src 'self' blob: data:",
);
writeFileSync(html, content);
cpSync(
  path.join(root, "third_party/hunspell-en-us"),
  path.join(target, "dictionaries/en_US"),
  { recursive: true },
);
cpSync(
  path.join(root, "third_party/browser-office/SOURCE.md"),
  path.join(target, "SOURCE.md"),
);
writeFileSync(
  marker,
  JSON.stringify({
    commit,
    integration: 2,
    source: "https://github.com/ranuts/document",
    license: "AGPL-3.0",
    integrationSource: "https://github.com/Harshkhurdi/maildesk",
  }),
);
