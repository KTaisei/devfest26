import axios from "axios";
import { getSession, demoAdminToken } from "./auth";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  timeout: 20000,
});
api.interceptors.request.use(async (config) => {
  const session = await getSession();
  config.headers.Authorization = `Bearer ${config.url?.startsWith("/simulation/roads/") ? demoAdminToken() || session.token : session.token}`;
  return config;
});
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
      return detail.map((d: { msg: string }) => d.msg).join(" / ");
    return "APIに接続できません。サーバーとネットワークを確認してください。 / API unavailable.";
  }
  return error instanceof Error
    ? error.message
    : "操作に失敗しました。 / Operation failed.";
}
