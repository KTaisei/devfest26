import { useMutation } from "@tanstack/react-query";
import { IonButton } from "@ionic/react";
import { api } from "../services/api";
import { useAppStore } from "../stores/useAppStore";
import { ErrorNotice } from "./Layout";
import { RoadPreviewMap } from "./RoadPreviewMap";
import type { components } from "../types/api.generated";

export function MeetingRoute({
  matchId,
  en,
}: {
  matchId: string;
  en: boolean;
}) {
  const origin = useAppStore((s) => s.location);
  const profile = useAppStore((s) => s.profile);
  const signature = JSON.stringify({ origin, profile });
  const route = useMutation({
    mutationFn: async () => ({
      result: (
        await api.post<components["schemas"]["MeetingRouteOutput"]>(
          `/matches/${matchId}/route`,
          origin,
        )
      ).data,
      signature,
    }),
  });
  const result =
    route.data?.signature === signature ? route.data.result : undefined;
  return (
    <section>
      <IonButton
        fill="outline"
        disabled={route.isPending}
        onClick={() => route.mutate()}
      >
        {en ? "Show fictional meeting route" : "合流地点までの模擬経路を表示"}
      </IonButton>
      <ErrorNotice error={route.error} />
      {result && (
        <>
          <p>
            {result.distanceMeters} m ·{" "}
            {Math.ceil(result.estimatedSeconds / 60)}
            {en ? " min" : "分"}
          </p>
          {result.warnings.map((w) => (
            <p className="notice" key={w}>
              {w}
            </p>
          ))}
          <RoadPreviewMap
            geometry={result.geometry as { coordinates?: number[][] }}
            en={en}
          />
        </>
      )}
    </section>
  );
}
