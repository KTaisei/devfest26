// One entrypoint for PowerShell, cmd.exe, macOS and Linux; no venv activation needed.
import { spawnSync } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import path from "node:path";

const python = path.resolve(
  "backend/.venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const env = { ...process.env, PYTHONUTF8: "1" };
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const tasks = {
  dev: [
    "-m",
    "uvicorn",
    "app.main:app",
    "--reload",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
  ],
  test: ["-m", "pytest", "-c", "backend/pytest.ini", "backend/tests", "-q"],
  lint: [
    "-m",
    "ruff",
    "check",
    "backend/app",
    "backend/tests",
    "backend/integration_tests",
    "scripts",
  ],
  format: [
    "-m",
    "ruff",
    "format",
    "backend/app",
    "backend/tests",
    "backend/integration_tests",
    "scripts",
  ],
  "check-format": [
    "-m",
    "ruff",
    "format",
    "--check",
    "backend/app",
    "backend/tests",
    "backend/integration_tests",
    "scripts",
  ],
  export: ["scripts/export_openapi.py"],
};
// Explicit cloud mode keeps the normal demo command usable before ADC is ready.
tasks["dev-cloud"] = [...tasks.dev, "--env-file", ".env.cloud"];
tasks["verify-cloud"] = ["scripts/verify_cloud.py", ...process.argv.slice(3)];
const task = process.argv[2];
if (task === "setup") {
  if (!existsSync(python)) {
    const candidates =
      process.platform === "win32"
        ? [
            ["py", ["-3.14"]],
            ["python", []],
          ]
        : [
            ["python3.14", []],
            ["python3", []],
          ];
    const found = candidates.find(
      ([command, args]) =>
        spawnSync(command, [
          ...args,
          "-c",
          "import sys; sys.exit(sys.version_info[:2] != (3, 14))",
        ]).status === 0,
    );
    if (!found)
      throw new Error(
        "Install Python 3.14, then reopen your terminal (see docs/WINDOWS.md).",
      );
    run(found[0], [...found[1], "-m", "venv", "backend/.venv"]);
  }
  run(python, ["-c", "import sys; sys.exit(sys.version_info[:2] != (3, 14))"]);
  run(python, ["-m", "pip", "install", "-r", "backend/requirements.lock.txt"]);
  // Preserve each developer's existing cloud/local settings.
  for (const directory of ["backend", "apps/mobile"]) {
    const target = path.join(directory, ".env");
    if (!existsSync(target))
      copyFileSync(path.join(directory, ".env.example"), target);
  }
} else {
  if (!tasks[task])
    throw new Error(
      "Expected setup, dev, dev-cloud, test, lint, format, check-format, verify-cloud or export",
    );
  if (!existsSync(python)) throw new Error("Run npm run setup:backend first.");
  run(python, tasks[task], task.startsWith("dev") ? { cwd: "backend" } : {});
}
