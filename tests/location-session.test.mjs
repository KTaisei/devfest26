import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFile } from "node:fs/promises";
async function load(name) {
  const source = await readFile(
    new URL(`../apps/mobile/src/services/${name}.ts`, import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );
}
const { parseConsent, saveConsent, readConsent, CONSENT_KEY } =
  await load("locationConsent");
const { startForegroundLocation } = await load("foregroundLocation");
function harness() {
  let visible = true,
    allowed = false,
    now = 100000;
  const watches = [],
    published = [];
  const session = startForegroundLocation({
    visible: () => visible,
    permitted: () => allowed,
    now: () => now,
    publish: (fix, error) => published.push({ fix, error }),
    watch: (fix, error) =>
      new Promise((resolve) =>
        watches.push({
          fix,
          error,
          stopped: false,
          resolve() {
            resolve(() => {
              this.stopped = true;
            });
          },
        }),
      ),
  });
  return {
    session,
    watches,
    published,
    allow(value = true) {
      allowed = value;
    },
    visible(value) {
      visible = value;
    },
    time(value) {
      now = value;
    },
    fix: { latitude: 35, longitude: 139, accuracy: 8, timestamp: now },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("consent is strict, versioned and coordinates are never persisted", () => {
  for (const raw of [
    null,
    "oops",
    '{"version":2,"services":true}',
    '{"version":1,"services":"true"}',
  ])
    assert.equal(parseConsent(raw).services, false);
  let stored;
  globalThis.localStorage = {
    getItem: () => stored,
    setItem: (key, value) => {
      assert.equal(key, CONSENT_KEY);
      stored = value;
    },
  };
  const value = parseConsent(
    '{"version":1,"services":true,"ai":true,"latitude":35,"longitude":139}',
  );
  assert.equal(saveConsent(value), true);
  assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), [
    "ai",
    "assistance",
    "services",
    "version",
  ]);
  assert.equal(readConsent().services, true);
  globalThis.localStorage = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  };
  assert.equal(readConsent().services, false);
  assert.equal(saveConsent(value), false);
  delete globalThis.localStorage;
});
test("no watch before consent; foreground resumes automatically; old callbacks cannot publish", async () => {
  const h = harness();
  assert.equal(h.watches.length, 0);
  h.allow();
  h.session.refresh();
  assert.equal(h.watches.length, 1);
  const old = h.watches[0];
  old.resolve();
  await flush();
  old.fix(h.fix);
  assert.deepEqual(h.published.at(-1).fix, h.fix);
  h.visible(false);
  h.session.refresh();
  assert.equal(old.stopped, true);
  old.fix(h.fix);
  assert.equal(h.published.at(-1).fix, undefined);
  h.visible(true);
  h.session.refresh();
  assert.equal(h.watches.length, 2);
  h.watches[1].resolve();
  await flush();
  h.allow(false);
  h.session.refresh();
  assert.equal(h.watches[1].stopped, true);
  h.watches[1].fix(h.fix);
  assert.equal(h.published.at(-1).fix, undefined);
  h.session.dispose();
});
test("a delayed native watch is disposed after unmount (including StrictMode remount)", async () => {
  const h = harness();
  h.allow();
  h.session.refresh();
  const old = h.watches[0];
  h.session.dispose();
  old.resolve();
  await flush();
  assert.equal(old.stopped, true);
  old.fix(h.fix);
  assert.equal(h.published.at(-1).fix, undefined);
});
test("stale, invalid, future and out-of-order fixes cannot become current; timeout clears memory", async () => {
  const h = harness();
  h.allow();
  h.session.refresh();
  const w = h.watches[0];
  w.resolve();
  await flush();
  for (const fix of [
    { ...h.fix, timestamp: 1 },
    { ...h.fix, timestamp: 103000 },
    { ...h.fix, latitude: 91 },
    { ...h.fix, accuracy: NaN },
  ])
    w.fix(fix);
  assert.equal(h.published.at(-1).fix, undefined);
  w.fix(h.fix);
  w.fix({ ...h.fix, timestamp: 99999 });
  assert.equal(h.published.at(-1).fix.timestamp, 100000);
  h.time(110001);
  h.session.expire();
  assert.equal(h.published.at(-1).fix, undefined);
  assert.match(h.published.at(-1).error, /GPS/);
  w.error("denied");
  assert.equal(h.published.at(-1).error, "denied");
  h.session.dispose();
});
