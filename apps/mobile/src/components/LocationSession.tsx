import { useEffect } from "react";
import { startForegroundLocation } from "../services/foregroundLocation";
import { watchLocation } from "../services/location";
import { CONSENT_KEY } from "../services/locationConsent";
import { useLocationSession } from "../stores/useLocationSession";
/** One watch across Ionic's cached pages; callbacks from disposed watches are ignored. */
export function LocationSession() {
  const enabled = useLocationSession((s) => s.consent.services);
  const retry = useLocationSession((s) => s.retry);
  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY || event.key === null)
        useLocationSession.getState().reloadConsent();
    };
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  useEffect(() => {
    const session = startForegroundLocation({
      visible: () => !document.hidden,
      permitted: () =>
        enabled && useLocationSession.getState().consent.services,
      watch: watchLocation,
      publish: (fix, error) => useLocationSession.setState({ fix, error }),
      now: Date.now,
    });
    document.addEventListener("visibilitychange", session.refresh);
    const timer = window.setInterval(session.expire, 1000);
    return () => {
      session.dispose();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", session.refresh);
    };
  }, [enabled, retry]);
  return null;
}
