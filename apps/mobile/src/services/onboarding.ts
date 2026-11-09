// Only a boolean "guide seen" flag is stored locally — never coordinates,
// tokens, or profile data (see the persistence note in stores/useAppStore).
const KEY = "tasuku:onboarding-seen";

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Storage may be unavailable (private mode); the guide just shows again.
  }
}
