import { create } from "zustand";
import type { Language, Location, Profile } from "../types/domain";

// Exact coordinates and bearer tokens are deliberately not persisted in localStorage.
interface AppState {
  language: Language;
  profile: Profile | null;
  location: Location;
  locationLabel: string;
  disasterType: "earthquake" | "tsunami" | "flood";
  setLanguage: (language: Language) => void;
  setProfile: (profile: Profile) => void;
  setLocation: (location: Location, locationLabel: string) => void;
  setDisasterType: (value: AppState["disasterType"]) => void;
}
export const useAppStore = create<AppState>((set) => ({
  language: "ja",
  profile: null,
  location: { latitude: 34.4884, longitude: 133.3614 },
  locationLabel: "福山駅前（模擬）",
  disasterType: "earthquake",
  setLanguage: (language) => {
    document.documentElement.lang = language;
    set({ language });
  },
  setProfile: (profile) => set({ profile }),
  setLocation: (location, locationLabel) => set({ location, locationLabel }),
  setDisasterType: (disasterType) => set({ disasterType }),
}));
