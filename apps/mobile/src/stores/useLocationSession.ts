import { create } from "zustand";
import {
  readConsent,
  saveConsent,
  type LocationConsent,
} from "../services/locationConsent";
import type { Fix } from "../navigation/progress";
interface State {
  consent: LocationConsent;
  fix?: Fix;
  error: string;
  storageFailed: boolean;
  retry: number;
  setConsent: (key: "services" | "ai" | "assistance", enabled: boolean) => void;
  reloadConsent: () => void;
  retryGPS: () => void;
}
export const useLocationSession = create<State>((set, get) => ({
  consent: readConsent(),
  error: "",
  storageFailed: false,
  retry: 0,
  setConsent: (key, enabled) => {
    const consent = { ...get().consent, [key]: enabled };
    set({
      consent,
      storageFailed: !saveConsent(consent),
      ...(key === "services" && !enabled ? { fix: undefined, error: "" } : {}),
    });
  },
  reloadConsent: () =>
    set({ consent: readConsent(), fix: undefined, error: "" }),
  retryGPS: () => set({ retry: get().retry + 1 }),
}));
