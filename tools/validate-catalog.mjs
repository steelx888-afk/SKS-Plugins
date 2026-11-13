#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "..", "catalog.json");
const errors = [];
let catalog;
try {
  catalog = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`catalog.json is not valid JSON: ${error.message}`);
  process.exit(1);
}
if (catalog.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (!Array.isArray(catalog.plugins)) errors.push("plugins must be an array");
const seen = new Set();
for (const [index, plugin] of (catalog.plugins || []).entries()) {
  const at = `plugins[${index}]`;
  if (!plugin || typeof plugin !== "object") { errors.push(`${at} must be an object`); continue; }
  if (!plugin.id) errors.push(`${at}.id is required`);
  if (seen.has(plugin.id)) errors.push(`${at}.id is duplicated: ${plugin.id}`);
  seen.add(plugin.id);
  if (!plugin.label) errors.push(`${at}.label is required`);
  if (!plugin.version) errors.push(`${at}.version is required`);
  if (!Array.isArray(plugin.products) || !plugin.products.length) errors.push(`${at}.products must be a non-empty array`);
  for (const product of plugin.products || []) {
    if (!["lab", "proz", "designz"].includes(product)) errors.push(`${at}.products has unknown product: ${product}`);
  }
  if (!plugin.platforms || typeof plugin.platforms !== "object") { errors.push(`${at}.platforms is required`); continue; }
  for (const [platform, asset] of Object.entries(plugin.platforms)) {
    const where = `${at}.platforms.${platform}`;
    if (!/^(win32-x64|darwin-arm64|darwin-x64|linux-x64)$/.test(platform)) errors.push(`${where} is not a supported platform key`);
    if (!asset || typeof asset !== "object") { errors.push(`${where} must be an object`); continue; }
    if (!/^https:\/\//.test(String(asset.url || ""))) errors.push(`${where}.url must use HTTPS`);
    if (!/^[a-f0-9]{64}$/i.test(String(asset.sha256 || ""))) errors.push(`${where}.sha256 must be 64 hex characters`);
    if (!Number.isInteger(asset.size) || asset.size <= 0) errors.push(`${where}.size must be a positive integer`);
    if (!asset.executable) errors.push(`${where}.executable is required`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`catalog.json ok: ${catalog.plugins.length} plugin(s)`);
