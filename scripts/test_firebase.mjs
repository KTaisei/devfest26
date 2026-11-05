// firebase emulators:exec supplies loopback emulator addresses to this child.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

for (const key of ["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST"]) {
  if (!/^127\.0\.0\.1:\d+$/.test(process.env[key] || ""))
    throw new Error(`${key} must point to the local emulator`);
}
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(process.execPath, ["--test", "tests/firestore.rules.test.mjs"]);
const localPython =
  process.platform === "win32"
    ? "backend/.venv/Scripts/python.exe"
    : "backend/.venv/bin/python";
run(
  existsSync(localPython) ? localPython : "python",
  [
    "-m",
    "pytest",
    "-c",
    "backend/pytest.ini",
    "backend/integration_tests",
    "-q",
  ],
  {
    ...process.env,
    FIREBASE_PROJECT_ID: "demo-tasuku",
    GOOGLE_CLOUD_PROJECT: "demo-tasuku",
    FIREBASE_EMULATOR_MODE: "true",
    DEMO_MODE: "false",
    STORAGE_BACKEND: "firestore",
    GEMINI_API_KEY: "",
  },
);
