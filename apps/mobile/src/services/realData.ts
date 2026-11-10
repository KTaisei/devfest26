/** Typed API boundary for actual-position features. UI never calls providers directly. */
import { api } from "./api";
import type { components } from "../types/api.generated";
type Schema = components["schemas"];
export const realData = {
  async walking(input: Schema["RealRouteInput"]) {
    return (
      await api.post<Schema["RealRouteOutput"]>(
        "/routes/walking-preview",
        input,
      )
    ).data;
  },
  async recommend(input: Schema["LocalDataInput"]) {
    return (
      await api.post<Schema["ShelterRecommendation"]>(
        "/shelters/recommend",
        input,
        { timeout: 60000 },
      )
    ).data;
  },
  async mine() {
    return (await api.get<Schema["AssistanceOutput"][]>("/assistance/mine"))
      .data;
  },
  async create(input: Schema["AssistanceInput"]) {
    return (
      await api.post<Schema["AssistanceOutput"]>("/assistance/requests", input)
    ).data;
  },
  async discover(input: Schema["LocalDataInput"]) {
    return (
      await api.post<Schema["AssistanceCandidate"][]>(
        "/assistance/nearby",
        input,
      )
    ).data;
  },
  async accept(id: string, input: Schema["AssistanceConsentInput"]) {
    return (
      await api.post<Schema["AssistanceOutput"]>(
        `/assistance/${id}/accept`,
        input,
        { timeout: 60000 },
      )
    ).data;
  },
  async directions(id: string, input: Schema["LocalDataInput"]) {
    return (
      await api.post<Schema["RealRouteOutput"]>(
        `/assistance/${id}/route`,
        input,
      )
    ).data;
  },
  async updatePosition(id: string, input: Schema["LocalDataInput"]) {
    return (
      await api.post<Schema["AssistanceOutput"]>(
        `/assistance/${id}/location`,
        input,
      )
    ).data;
  },
  async progress(id: string, input: Schema["AssistanceProgress"]) {
    return (
      await api.post<Schema["AssistanceOutput"]>(
        `/assistance/${id}/progress`,
        input,
      )
    ).data;
  },
};
