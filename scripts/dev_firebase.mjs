// Runs inside emulators:exec. Every service uses the isolated demo-tasuku project.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

for (const key of ["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST"]) {
  if (!/^127\.0\.0\.1:\d+$/.test(process.env[key] || ""))
    throw new Error("Start with npm run dev:firebase");
}
const python =
  process.platform === "win32"
    ? "backend/.venv/Scripts/python.exe"
    : "backend/.venv/bin/python";
if (!existsSync(python))
  throw new Error(
    "Create backend/.venv and install backend/requirements.lock.txt first.",
  );
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
  process.exitCode = code;
}
function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
  return child;
}
const backendEnv = {
  ...process.env,
  DEMO_MODE: "false",
  STORAGE_BACKEND: "firestore",
  FIREBASE_EMULATOR_MODE: "true",
  FIREBASE_PROJECT_ID: "demo-tasuku",
  CORS_ORIGINS: "http://127.0.0.1:5174,http://localhost:5174",
};
start(
  python,
  [
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    "backend",
    "--host",
    "127.0.0.1",
    "--port",
    "8001",
    "--reload",
  ],
  { env: backendEnv },
);
let ready = false;
for (let attempt = 0; attempt < 40 && !stopping; attempt++) {
  try {
    const response = await fetch("http://127.0.0.1:8001/api/v1/health", {
      signal: AbortSignal.timeout(1000),
    });
    const health = await response.json();
    if (health.storage === "firestore" && !health.demoMode) {
      ready = true;
      break;
    }
  } catch {
    /* API imports and starts before the UI is opened. */
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!ready) {
  console.error("Firebase API did not start on port 8001.");
  stop(1);
}
if (!stopping)
  start(
    process.execPath,
    [
      path.resolve("node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5174",
      "--strictPort",
    ],
    {
      cwd: "apps/mobile",
      env: {
        ...process.env,
        VITE_API_BASE_URL: "http://127.0.0.1:8001/api/v1",
        VITE_FIREBASE_API_KEY: "demo-api-key",
        VITE_FIREBASE_AUTH_DOMAIN: "demo-tasuku.firebaseapp.com",
        VITE_FIREBASE_PROJECT_ID: "demo-tasuku",
        VITE_FIREBASE_AUTH_EMULATOR_URL: `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,
      },
    },
  );
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
