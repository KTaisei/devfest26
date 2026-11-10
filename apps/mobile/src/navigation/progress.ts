/** Pure, conservative route progress. No network, GPS access, or safety decisions. */
export type Point = { latitude: number; longitude: number };
export type Fix = Point & { accuracy: number; timestamp: number };
export type RouteShape = {
  geometry: { coordinates: number[][] };
  steps: { instruction: string; start: Point; distanceMeters: number }[];
};
const radians = Math.PI / 180;
export function meters(a: Point, b: Point) {
  const x =
    (b.longitude - a.longitude) *
    radians *
    Math.cos(((a.latitude + b.latitude) / 2) * radians);
  const y = (b.latitude - a.latitude) * radians;
  return Math.hypot(x, y) * 6371000;
}
export function prepareRoute(route: RouteShape) {
  const points = route.geometry.coordinates.map(([longitude, latitude]) => ({
    latitude,
    longitude,
  }));
  const cumulative = [0];
  for (let i = 1; i < points.length; i++)
    cumulative.push(cumulative[i - 1] + meters(points[i - 1], points[i]));
  function project(point: Point, min = 0, max = Infinity, preferred = min) {
    let best = { distance: Infinity, progress: min };
    for (let i = 1; i < points.length; i++) {
      const from = cumulative[i - 1],
        length = cumulative[i] - from;
      if (!length || cumulative[i] < min || from > max) continue;
      const a = points[i - 1],
        b = points[i];
      const scale = Math.cos(point.latitude * radians);
      const dx = (b.longitude - a.longitude) * scale,
        dy = b.latitude - a.latitude;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((point.longitude - a.longitude) * scale * dx +
            (point.latitude - a.latitude) * dy) /
            (dx * dx + dy * dy),
        ),
      );
      const progress = from + t * length;
      if (progress < min || progress > max) continue;
      const distance = meters(point, {
        latitude: a.latitude + t * dy,
        longitude: a.longitude + t * (b.longitude - a.longitude),
      });
      if (
        distance < best.distance - 2 ||
        (Math.abs(distance - best.distance) <= 2 &&
          Math.abs(progress - preferred) < Math.abs(best.progress - preferred))
      )
        best = { distance, progress };
    }
    return best;
  }
  let last = 0;
  const starts = route.steps.map((step) => {
    const match = project(step.start, last);
    last = Number.isFinite(match.distance) ? match.progress : last;
    return last;
  });
  return { points, cumulative, starts, project, total: cumulative.at(-1) ?? 0 };
}
export type Progress = {
  progress: number;
  step: number;
  remaining: number;
  turnDistance: number;
  status: "tracking" | "poor_gps" | "stale" | "off_route" | "arrived";
};
export function advance(
  model: ReturnType<typeof prepareRoute>,
  fix: Fix,
  previous = 0,
  elapsed = 1,
  now = Date.now(),
): Progress {
  const base = {
    progress: previous,
    step: 0,
    remaining: Math.max(0, model.total - previous),
    turnDistance: 0,
  };
  if (now - fix.timestamp > 10000 || fix.timestamp > now + 2000)
    return { ...base, status: "stale" };
  if (!Number.isFinite(fix.accuracy) || fix.accuracy > 35 || fix.accuracy < 0)
    return { ...base, status: "poor_gps" };
  if (
    model.total === 0 &&
    model.points[0] &&
    meters(fix, model.points[0]) <= 20
  )
    return { ...base, status: "arrived" };
  const match = model.project(
    fix,
    Math.max(0, previous - 15),
    previous + Math.min(120, Math.max(60, elapsed * 3 + fix.accuracy)),
    previous,
  );
  if (match.distance > 40) return { ...base, status: "off_route" };
  const progress = Math.max(previous, match.progress);
  let step = 0;
  // Passing a junction by 8m avoids advancing early from normal GPS jitter.
  while (
    step + 1 < model.starts.length &&
    progress >= model.starts[step + 1] + 8
  )
    step++;
  const next = model.starts[step + 1] ?? model.total;
  const remaining = Math.max(0, model.total - progress);
  const end = model.points.at(-1);
  return {
    progress,
    step,
    remaining,
    turnDistance: Math.max(0, next - progress),
    status:
      end && remaining <= 20 && meters(fix, end) <= 20 ? "arrived" : "tracking",
  };
}
