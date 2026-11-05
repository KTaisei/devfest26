// Local-only Firebase entrypoint: no login, cloud project creation, or deployment.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2];
if (!["start", "test", "dev"].includes(mode))
  throw new Error("Expected start, test or dev");
const env = { ...process.env };
const candidates = [
  env.JAVA_HOME,
  "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
  "/opt/homebrew/opt/openjdk@23/libexec/openjdk.jdk/Contents/Home",
].filter(Boolean);
const defaultVersion = spawnSync("java", ["-version"], { encoding: "utf8" });
const javaMajor = (text) => Number(text.match(/version "(\d+)/)?.[1] || 0);
if (javaMajor(defaultVersion.stderr || "") < 21) {
  const available = candidates.find((home) => {
    const binary = path.join(
      home,
      "bin",
      process.platform === "win32" ? "java.exe" : "java",
    );
    return (
      existsSync(binary) &&
      javaMajor(
        spawnSync(binary, ["-version"], { encoding: "utf8" }).stderr || "",
      ) >= 21
    );
  });
  if (!available)
    throw new Error(
      "Firebase emulator requires Java 21+. Install a JDK and set JAVA_HOME (see docs/FIREBASE_LOCAL.md).",
    );
  env.JAVA_HOME = available;
  env.PATH = `${path.join(available, "bin")}${path.delimiter}${env.PATH}`;
}
env.FIREBASE_EMULATORS_PATH ||= path.resolve(".cache/firebase/emulators");
mkdirSync(env.FIREBASE_EMULATORS_PATH, { recursive: true });
const args = [
  path.resolve("node_modules/firebase-tools/lib/bin/firebase.js"),
  mode === "start" ? "emulators:start" : "emulators:exec",
  "--project",
  "demo-tasuku",
  "--only",
  "auth,firestore",
  "--non-interactive",
];
// Keep local development accounts across normal shutdowns; tests always start empty.
if (mode !== "test") {
  const dataDirectory = path.resolve(".cache/firebase/data");
  if (existsSync(path.join(dataDirectory, "firebase-export-metadata.json")))
    args.push("--import", dataDirectory);
  args.push("--export-on-exit", dataDirectory);
}
if (mode !== "start")
  args.push(
    mode === "test"
      ? "node scripts/test_firebase.mjs"
      : "node scripts/dev_firebase.mjs",
  );
const child = spawn(process.execPath, args, { stdio: "inherit", env });
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code || 0));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
