# SKS Plugins

Portable plugin applications and version metadata for SKS LAB, SKS PROZ, and SKS DESIGNZ.

This repository is release-only. Plugin source code stays private. Host applications read `catalog.json` and download the Windows x64 portable ZIP listed for each plugin.

## Catalog

- `catalog.json` is the single source of truth for plugin versions.
- Raw URL: `https://raw.githubusercontent.com/steelx888-afk/SKS-Plugins/main/catalog.json`
- Each plugin has one entry with `products`, `version`, and `platforms`.
- Tabiix is published for `lab` and `proz` only. SKS DESIGNZ does not list it.
- Windows x64 is published first. macOS and Linux can be added under `platforms` later.

## Release a plugin

1. Bump the plugin's `package.json` version in its private source repo.
2. Run from this repository:

```bash
node tools/release-plugin.mjs --app-dir "C:\Users\vinsx\OneDrive\Desktop\SLIDEX Source" --notes "What changed"
```

The tool builds the app, packages a portable Windows x64 folder, creates `<id>-v<version>` on this repo, uploads the ZIP, and updates `catalog.json`.

Useful flags:

- `--skip-build` reuse an existing build
- `--dry-run` print the plan without uploading or committing
- `--no-push` write and commit the catalog locally but do not push

## Validate

```bash
npm ci
npm run validate
```

The validation workflow runs on every change to `catalog.json` or the tools.

## Security

- Every ZIP is verified by SHA-256 before a host installs it.
- Packages are currently unsigned. Windows SmartScreen may warn.
- Hosts never execute plugin code inside their own process.
