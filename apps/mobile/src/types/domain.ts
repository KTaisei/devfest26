import type { components } from "./api.generated";
export type Language = "ja" | "en";
export type SupportType =
  "navigation" | "translation" | "information" | "walking_companion";
export type Location = components["schemas"]["Location"];
export type Profile = Required<components["schemas"]["Profile"]> & {
  uid?: string;
};
export interface Shelter extends Location {
  id: string;
  name: string;
  nodeId: string;
  disasterTypes: string[];
  accessible: boolean;
  capacity: number;
  kind: string;
}
export interface Road {
  id: string;
  fromNode: string;
  toNode: string;
  roadStatus: "open" | "restricted" | "closed" | "unknown";
  hasStairs: boolean;
  distance: number;
}
export interface Scenario {
  id: string;
  name: string;
  description: string;
  nodes: (Location & { id: string })[];
  edges: Road[];
}
export type EvacuationRoute = components["schemas"]["EvacuationRoute"];
export type RouteResult = components["schemas"]["RouteOutput"];
export type Match = components["schemas"]["MatchOutput"];
export type MatchStatus = Match["status"];
export type SupportRequest = components["schemas"]["RequestOutput"];
export const defaultProfile: Profile = {
  displayName: "",
  preferredLanguage: "ja",
  mobilityType: "normal",
  avoidStairs: false,
  supportCapabilities: [],
  isAvailableToHelp: false,
  locationSharingEnabled: false,
};
