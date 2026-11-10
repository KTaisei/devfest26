import type { Fix } from "../navigation/progress";

/** Injectable lifecycle: test without obtaining anybody's actual coordinates. */
export function startForegroundLocation(deps: {
  visible: () => boolean;
  permitted: () => boolean;
  watch: (
    fix: (value: Fix) => void,
    error: (message: string) => void,
  ) => Promise<() => void>;
  publish: (fix: Fix | undefined, error: string) => void;
  now: () => number;
}) {
  let generation = 0;
  let stop: (() => void) | undefined;
  let latestAt = 0;
  function refresh() {
    const own = ++generation;
    stop?.();
    stop = undefined;
    latestAt = 0;
    deps.publish(undefined, "");
    if (!deps.permitted() || !deps.visible()) return;
    const active = () =>
      generation === own && deps.permitted() && deps.visible();
    void deps
      .watch(
        (fix) => {
          if (!active()) return;
          if (
            !Number.isFinite(fix.latitude) ||
            !Number.isFinite(fix.longitude) ||
            Math.abs(fix.latitude) > 90 ||
            Math.abs(fix.longitude) > 180 ||
            !Number.isFinite(fix.accuracy) ||
            fix.accuracy < 0 ||
            !Number.isFinite(fix.timestamp) ||
            deps.now() - fix.timestamp > 10000 ||
            fix.timestamp > deps.now() + 2000 ||
            fix.timestamp < latestAt
          )
            return;
          latestAt = fix.timestamp;
          deps.publish(fix, "");
        },
        (error) => {
          if (active()) {
            latestAt = 0;
            deps.publish(undefined, error);
          }
        },
      )
      .then((dispose) => {
        if (active()) stop = dispose;
        else dispose();
      })
      .catch(() => {
        if (active())
          deps.publish(
            undefined,
            "GPSを開始できません。端末の位置設定を確認してください。 / GPS unavailable.",
          );
      });
  }
  refresh();
  return {
    refresh,
    expire: () => {
      if (latestAt && deps.now() - latestAt > 10000) {
        latestAt = 0;
        deps.publish(
          undefined,
          "GPSの更新が遅れています。 / GPS update delayed.",
        );
      }
    },
    dispose: () => {
      generation++;
      stop?.();
      stop = undefined;
      deps.publish(undefined, "");
    },
  };
}
