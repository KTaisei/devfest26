// Cross-platform production build: never embed the local API URL or emulator.
import { spawnSync } from "node:child_process";
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
await build({ root, mode: "cloud" });
