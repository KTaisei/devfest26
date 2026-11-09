import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import { useAppStore } from "../stores/useAppStore";
import type {
  Match,
  RouteResult,
  Scenario,
  Shelter,
  SupportRequest,
} from "../types/domain";

export const useScenarios = () =>
  useQuery({
    queryKey: ["scenarios"],
    queryFn: async () =>
      (await api.get<Scenario[]>("/simulation/scenarios")).data,
    refetchInterval: 5000,
  });
export const useShelters = () =>
  useQuery({
    queryKey: ["shelters"],
    queryFn: async () => (await api.get<Shelter[]>("/shelters")).data,
  });
export const useMatches = () =>
  useQuery({
    queryKey: ["matches"],
    queryFn: async () => (await api.get<Match[]>("/matches/me")).data,
    refetchInterval: 3000,
  });
export const useRequests = () =>
  useQuery({
    queryKey: ["requests"],
    queryFn: async () =>
      (await api.get<SupportRequest[]>("/support-requests/me")).data,
    refetchInterval: 3000,
  });
export function useConstraints() {
  const profile = useAppStore((s) => s.profile);
  return {
    avoidStairs: profile?.avoidStairs || profile?.mobilityType === "wheelchair",
    wheelchair: profile?.mobilityType === "wheelchair",
    walkingSpeedMetersPerSecond: profile?.mobilityType === "normal" ? 1 : 0.7,
  };
}
export function useRoutes() {
  const { location, disasterType } = useAppStore();
  const constraints = useConstraints();
  const scenario = useScenarios();
  return useQuery({
    queryKey: [
      "routes",
      location,
      disasterType,
      constraints,
      scenario.data?.[0]?.edges,
    ],
    queryFn: async () =>
      (
        await api.post<RouteResult>("/routes/calculate", {
          origin: location,
          disasterType,
          mobilityConstraints: constraints,
          scenarioId: "demo_001",
        })
      ).data,
    enabled: Boolean(scenario.data),
    retry: false,
    staleTime: 4000,
  });
}
export function useMatchAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      if (action === "meeting" || action === "assisting")
        return api.post(`/matches/${id}/progress`, { status: action });
      return api.post(`/matches/${id}/${action}`);
    },
    // A rejected late acceptance can still expire the offer on the server.
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["matches"] });
      void client.invalidateQueries({ queryKey: ["requests"] });
    },
  });
}
