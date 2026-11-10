import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFile } from "node:fs/promises";
// Transpile only the pure domain module, without browser/React dependencies.
const source = await readFile(
  new URL("../apps/mobile/src/navigation/progress.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const { advance, prepareRoute, meters } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const p = (latitude, longitude) => ({ latitude, longitude });
const route = {
  geometry: {
    coordinates: [
      [139, 35],
      [139, 35.001],
      [139.001, 35.001],
      [139.001, 35.002],
    ],
  },
  steps: [
    { start: p(35, 139), instruction: "north" },
    { start: p(35.001, 139), instruction: "right" },
    { start: p(35.001, 139.001), instruction: "left" },
  ],
};
const model = prepareRoute(route);
const fix = (point, accuracy = 5, timestamp = 100000) => ({
  ...point,
  accuracy,
  timestamp,
});
const run = (point, previous = 0, elapsed = 1) =>
  advance(model, fix(point), previous, elapsed, 100000);
test("approach turn and progress do not advance early or jump from GPS jitter", () => {
  const approaching = run(p(35.0009, 139), 80, 8);
  assert.equal(approaching.step, 0);
  assert.ok(approaching.turnDistance < 15);
  const after = run(p(35.001, 139.0002), approaching.progress, 8);
  assert.equal(after.step, 1);
  const jitter = run(p(35.001, 139.00018), after.progress);
  assert.equal(jitter.progress, after.progress);
});
test("poor, stale and future fixes cannot advance or announce turns", () => {
  for (const value of [
    fix(p(35.001, 139), 50),
    fix(p(35.001, 139), 5, 80000),
    fix(p(35.001, 139), 5, 103000),
  ]) {
    const result = advance(model, value, 25, 1, 100000);
    assert.equal(result.progress, 25);
    assert.ok(["stale", "poor_gps"].includes(result.status));
  }
});
test("off-route and teleport fixes do not skip to later steps", () => {
  assert.equal(run(p(35.001, 139.004), 50).status, "off_route");
  const teleport = run(p(35.002, 139.001));
  assert.equal(teleport.status, "off_route");
  assert.equal(teleport.progress, 0);
});
test("destination proximity alone does not imply arrival on a loop", () => {
  const loop = prepareRoute({
    ...route,
    geometry: {
      coordinates: [
        [139, 35],
        [139, 35.001],
        [139.001, 35.001],
        [139.001, 35],
        [139.00005, 35],
      ],
    },
  });
  assert.equal(
    advance(loop, fix(p(35, 139.00005)), 0, 1, 100000).status,
    "tracking",
  );
});
test("arrival requires route progress AND proximity, zero route supported", () => {
  const total = model.total;
  assert.equal(run(p(35.002, 139.001), total - 10).status, "arrived");
  const zero = prepareRoute({
    geometry: {
      coordinates: [
        [139, 35],
        [139, 35],
      ],
    },
    steps: [],
  });
  assert.equal(advance(zero, fix(p(35, 139)), 0, 1, 100000).status, "arrived");
  assert.ok(meters(p(35, 139), p(35.001, 139)) > 100);
});
