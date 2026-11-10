// Cross-platform production build: never embed the local API URL or emulator.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, cpSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, loadEnv } from "vite";

const root = "apps/mobile";
const settings = loadEnv("cloud", root, "VITE_");
for (const key of [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
]) {
  if (!settings[key])
    throw new Error(`Missing ${key} in apps/mobile/.env.cloud`);
}
if (settings.VITE_FIREBASE_PROJECT_ID !== "tasuku-77c63") {
  throw new Error(
    "Hosting build must use the team Firebase project tasuku-77c63",
  );
}
// process.env takes precedence over dotenv values inside Vite.
process.env.VITE_API_BASE_URL = "/api/v1";
process.env.VITE_FIREBASE_AUTH_EMULATOR_URL = "";
const check = spawnSync(
  process.execPath,
  [
    "node_modules/typescript/bin/tsc",
    "--noEmit",
    "-p",
    `${root}/tsconfig.json`,
  ],
  { stdio: "inherit" },
);
if (check.status !== 0) process.exit(check.status || 1);
// Retain the previous release's hashed assets for tabs still running that build.
// Only retain one preceding build; the HTML recovery handler covers older tabs.
const backup = mkdtempSync(join(tmpdir(), "tasuku-assets-"));
const assets = `${root}/dist/assets`;
const previous = existsSync(assets)
  ? readdirSync(assets).filter((name) => /\.(js|css)$/.test(name))
  : [];
// The manifest records this build's files, so retained assets don't accumulate.
const { readFileSync, writeFileSync } = await import("node:fs");
const manifestPath = `${root}/dist/release-assets.json`;
const retained = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : previous;
for (const name of retained) {
  if (previous.includes(name)) cpSync(join(assets, name), join(backup, name));
}
try {
  await build({ root, mode: "cloud" });
  const current = readdirSync(assets);
  for (const name of readdirSync(backup)) {
    if (!current.includes(name)) cpSync(join(backup, name), join(assets, name));
  }
  writeFileSync(manifestPath, JSON.stringify(current));
} finally {
  rmSync(backup, { recursive: true, force: true });
}
