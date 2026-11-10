/** Persist preferences only. Coordinates, identities and tokens never enter storage. */
export const CONSENT_KEY = "tasuku.location-consent.v1";
export type LocationConsent = {
  version: 1;
  services: boolean;
  ai: boolean;
  assistance: boolean;
};
export const emptyConsent: LocationConsent = {
  version: 1,
  services: false,
  ai: false,
  assistance: false,
};
export function parseConsent(raw: string | null): LocationConsent {
  try {
    const value = JSON.parse(raw || "null");
    if (value?.version !== 1) return { ...emptyConsent };
    return {
      version: 1,
      services: value.services === true,
      ai: value.ai === true,
      assistance: value.assistance === true,
    };
  } catch {
    return { ...emptyConsent };
  }
}
export function readConsent(): LocationConsent {
  try {
    return parseConsent(localStorage.getItem(CONSENT_KEY));
  } catch {
    return { ...emptyConsent };
  }
}
export function saveConsent(value: LocationConsent): boolean {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
