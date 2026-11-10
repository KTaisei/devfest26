import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { Location } from "../types/domain";
import type { components } from "../types/api.generated";

export function useRealEnvironment(origin?: Location, active = true) {
  // Coordinates live only in memory; no URL parameters, analytics or persistence.
  const body = { origin, locationUseConsent: true };
  const earthquake = useQuery({
    queryKey: ["local-earthquakes", origin],
    enabled: Boolean(origin) && active,
    queryFn: async () =>
      (
        await api.post<components["schemas"]["LocalEarthquakeFeed"]>(
          "/earthquakes/local",
          body,
          { timeout: 45000 },
        )
      ).data,
    retry: false,
    refetchInterval: 15000,
    gcTime: 0,
  });
  const shelters = useQuery({
    queryKey: ["real-shelters", origin],
    enabled: Boolean(origin) && active,
    queryFn: async () =>
      (
        await api.post<components["schemas"]["RealShelterFeed"]>(
          "/shelters/nearby",
          body,
          { timeout: 60000 },
        )
      ).data,
    retry: false,
    staleTime: 300000,
    gcTime: 0,
  });
  return { earthquake, shelters };
}
