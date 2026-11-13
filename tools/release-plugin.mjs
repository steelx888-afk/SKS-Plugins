#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import archiver from "archiver";
import { packager } from "@electron/packager";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const catalogFile = path.join(repoRoot, "catalog.json");
const repoSlug = "steelx888-afk/SKS-Plugins";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}
function shellFor(command) {
  return process.platform === "win32" && /\.cmd$/i.test(command);
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: shellFor(command),
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
}
function capture(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: shellFor(command),
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return String(result.stdout || "").trim();
}
function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}
const appDir = path.resolve(arg("app-dir"));
if (!arg("app-dir")) {
  console.error("Usage: node tools/release-plugin.mjs --app-dir <plugin source> [--notes text] [--dry-run] [--no-push] [--skip-build]");
  process.exit(2);
}
const configFile = path.join(appDir, "plugin-release.json");
const config = existsSync(configFile) ? readJson(configFile) : {};
const sourcePackage = readJson(path.join(appDir, "package.json"));
const id = String(config.id || sourcePackage.sks?.pluginId || "").trim();
const label = String(config.label || sourcePackage.productName || sourcePackage.name || id).trim();
const version = String(sourcePackage.version || "").trim();
if (!id || !label || !version) throw new Error("plugin-release.json/package.json must provide id, label, and version.");
const products = Array.isArray(config.products) ? config.products : ["lab", "proz", "designz"];
const appPath = path.resolve(appDir, config.appDir || ".");
const buildCwd = path.resolve(appDir, config.buildCwd || ".");
const packageJson = readJson(path.join(appPath, "package.json"));
const executable = String(config.executable || `${label}.exe`);
const releaseRoot = path.join(repoRoot, "dist");
const outRoot = path.join(releaseRoot, `${id}-${version}`);
const tag = `${id}-v${version}`;
const filename = `${label.replace(/[^\w.-]+/g, "-")}-${version}-win-x64.zip`;
const zipPath = path.join(releaseRoot, filename);
const notes = arg("notes", `SKS ${label} ${version}`);

const defaultIgnore = [
  /[/\\]\.git([/\\]|$)/,
  /[/\\]source([/\\]|$)/,
  /[/\\]scripts([/\\]|$)/,
  /[/\\]release([/\\]|$)/,
  /[/\\]dist[/\\].*\.map$/,
  /[/\\]node_modules[/\\]\.cache([/\\]|$)/,
  /[/\\]__pycache__([/\\]|$)/,
  /\.pyc$/,
];
const extraIgnore = (config.extraIgnore || []).map((pattern) => new RegExp(pattern));

console.log(JSON.stringify({ id, label, version, products, appPath, buildCwd, executable, tag, filename }, null, 2));
if (flag("dry-run")) process.exit(0);

if (!flag("skip-build")) {
  const buildArgs = Array.isArray(config.buildCommand) ? config.buildCommand : ["run", "build"];
  run(process.platform === "win32" ? "npm.cmd" : "npm", buildArgs, buildCwd);
}

await rm(outRoot, { recursive: true, force: true });
await mkdir(outRoot, { recursive: true });
const electronVersion = String(
  config.electronVersion ||
  packageJson.devDependencies?.electron ||
  packageJson.dependencies?.electron ||
  "",
).replace(/^[^\d]*/, "");
const iconFile = config.icon ? path.resolve(appPath, config.icon) : "";
let packagedDir = "";
if (config.builder === "electron-builder") {
  const builderCli = path.join(appPath, "node_modules", "electron-builder", "cli.js");
  if (!existsSync(builderCli)) throw new Error(`electron-builder is not installed in ${appPath}`);
  const builderConfig = path.resolve(appDir, config.builderConfig || "sks-electron-builder.json");
  run(process.execPath, [builderCli, "--config", builderConfig, "--win", "--x64"], appPath);
  packagedDir = path.resolve(appPath, config.outputDir || "release-sks", "win-unpacked");
} else {
  const paths = await packager({
    dir: appPath,
    name: label,
    platform: "win32",
    arch: "x64",
    out: outRoot,
    overwrite: true,
    asar: true,
    prune: true,
    appVersion: version,
    electronVersion: electronVersion || undefined,
    icon: iconFile && existsSync(iconFile) ? iconFile : undefined,
    ignore: [...defaultIgnore, ...extraIgnore],
    win32metadata: {
      CompanyName: "SKS",
      FileDescription: label,
      ProductName: label,
      InternalName: id,
    },
  });
  packagedDir = paths[0];
}
if (!packagedDir || !existsSync(path.join(packagedDir, executable))) {
  throw new Error(`Packaged app did not produce ${executable} in ${packagedDir || "an output folder"}.`);
}

await rm(zipPath, { force: true });
await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
  archive.pipe(output);
  archive.directory(packagedDir, false);
  archive.finalize();
});

const hash = createHash("sha256");
for await (const chunk of createReadStream(zipPath)) hash.update(chunk);
const sha256 = hash.digest("hex");
const size = statSync(zipPath).size;
const assetUrl = `https://github.com/${repoSlug}/releases/download/${tag}/${filename}`;

if (flag("package-only")) {
  console.log(JSON.stringify({ ok: true, packageOnly: true, id, version, filename, zipPath, sha256, size }, null, 2));
  process.exit(0);
}

run("gh", ["release", "create", tag, zipPath, "--repo", repoSlug, "--title", `${label} ${version}`, "--notes", notes], repoRoot);

const catalog = readJson(catalogFile);
const plugins = Array.isArray(catalog.plugins) ? catalog.plugins : [];
const existing = plugins.find((item) => String(item.id) === id) || { id, label };
const next = {
  ...existing,
  id,
  label,
  note: String(config.note || existing.note || ""),
  products,
  version,
  publishedAt: new Date().toISOString(),
  releaseNotes: notes,
  platforms: {
    ...(existing.platforms || {}),
    "win32-x64": { url: assetUrl, sha256, size, executable },
  },
};
const nextPlugins = plugins.filter((item) => String(item.id) !== id).concat(next).sort((a, b) => String(a.id).localeCompare(String(b.id)));
catalog.schemaVersion = 1;
catalog.generatedAt = new Date().toISOString();
catalog.plugins = nextPlugins;
writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

run("git", ["add", "catalog.json"], repoRoot);
const status = capture("git", ["status", "--porcelain", "--", "catalog.json"], repoRoot);
if (status) {
  run("git", ["-c", "user.name=SKS Release", "-c", "user.email=steelx888-afk@users.noreply.github.com", "commit", "-m", `catalog: ${id} ${version}`], repoRoot);
  if (!flag("no-push")) run("git", ["push", "origin", "HEAD:main"], repoRoot);
}

console.log(JSON.stringify({ ok: true, id, version, tag, assetUrl, sha256, size, zipPath }, null, 2));

