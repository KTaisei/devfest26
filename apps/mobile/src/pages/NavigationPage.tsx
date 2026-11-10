import { useState } from "react";
import { IonButton } from "@ionic/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layout, ErrorNotice } from "../components/Layout";
import { RoadPreviewMap } from "../components/RoadPreviewMap";
import { api } from "../services/api";
import { getCurrentLocation } from "../services/location";
import { useAppStore } from "../stores/useAppStore";
import type { Location } from "../types/domain";
import type { components } from "../types/api.generated";

type Route = components["schemas"]["RealRouteOutput"];
type Feed = components["schemas"]["EarthquakeFeedOutput"];
const streetView = (point: Location) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`;

export function NavigationPage() {
  const { language, profile } = useAppStore();
  const en = language === "en";
  // Separate from the simulation store: actual GPS must never become a demo support position.
  const [origin, setOrigin] = useState<Location>();
  const [destination, setDestination] = useState<Location>();
  const [coordinates, setCoordinates] = useState({
    origin: { latitude: "", longitude: "" },
    destination: { latitude: "", longitude: "" },
  });
  function updatePoint(kind: "origin" | "destination", point: Location) {
    if (kind === "origin") setOrigin(point);
    else setDestination(point);
    setCoordinates((previous) => ({
      ...previous,
      [kind]: {
        latitude: String(point.latitude),
        longitude: String(point.longitude),
      },
    }));
    setConsent(false);
  }
  const [selecting, setSelecting] = useState<"origin" | "destination">(
    "origin",
  );
  const [consent, setConsent] = useState(false);
  const signature = JSON.stringify({ origin, destination, profile, language });
  const gps = useMutation({
    mutationFn: getCurrentLocation,
    onSuccess: (point) => {
      updatePoint("origin", point);
    },
  });
  const route = useMutation({
    mutationFn: async () => {
      const result = (
        await api.post<Route>("/routes/walking-preview", {
          origin,
          destination,
          locationUseConsent: consent,
        })
      ).data;
      return { result, signature };
    },
  });
  const result =
    route.data?.signature === signature ? route.data.result : undefined;
  const feed = useQuery({
    queryKey: ["earthquake-headlines"],
    queryFn: async () => (await api.get<Feed>("/earthquakes/recent")).data,
    refetchInterval: 60000,
    retry: false,
  });
  const choosePoint = (point: Location) => {
    updatePoint(selecting, point);
  };

  return (
    <Layout
      title={en ? "Real road preview" : "実道路の案内（試験）"}
      eyebrow="REAL ROAD PREVIEW"
      dataMode="real_preview"
    >
      <p>
        {en
          ? "Choose your own destination on the map. This is an ordinary walking preview, not a verified evacuation route."
          : "地図で出発地と目的地を選び、実際の道路を使う徒歩案内を試せます。災害時の避難経路として検証したものではありません。"}
      </p>
      <section className="notice">
        <h2>{en ? "Earthquake information" : "地震に関する公開情報"}</h2>
        <strong>
          {en
            ? "Earthquake Early Warning: NOT CONNECTED"
            : "緊急地震速報：未接続"}
        </strong>
        <p>
          {en
            ? "JMA public headlines may be delayed or interrupted. These are not early warnings or proof that no earthquake occurred. No automatic route changes or warning sounds are triggered."
            : "以下は気象庁の公開情報です。緊急地震速報ではなく、停止・遅延もあります。情報がないことは地震がないことを意味しません。経路の自動変更や警報音は行いません。"}
        </p>
        {feed.isPending && (
          <p role="status">
            {en ? "Loading public notices…" : "公開情報を取得しています…"}
          </p>
        )}
        {(feed.error || feed.data?.status === "unavailable") && (
          <p role="alert">
            {en
              ? "Public information unavailable."
              : "公開情報を取得できません。"}
          </p>
        )}
        {feed.data?.fetchedAt && (
          <small>
            {en ? "Retrieved" : "取得時刻"}{" "}
            {new Date(feed.data.fetchedAt).toLocaleString(language)}
          </small>
        )}
        <ul>
          {feed.data?.notices.map((n) => (
            <li key={`${n.sourceUrl}-${n.publishedAt}`}>
              <a href={n.sourceUrl} target="_blank" rel="noreferrer">
                {n.title} · {n.publishedAt}
              </a>
            </li>
          ))}
        </ul>
        {feed.data?.status === "available" &&
          feed.data.notices.length === 0 && (
            <p>
              {en
                ? "No earthquake headlines in this feed window."
                : "取得したフィード内に表示対象の地震情報はありません。"}
            </p>
          )}
        <a href="https://www.jma.go.jp/bosai/" target="_blank" rel="noreferrer">
          {en ? "JMA official information ↗" : "気象庁の公式情報を開く ↗"}
        </a>
      </section>
      <section className="map-card navigation-card">
        <h2>{en ? "Choose start and destination" : "出発地と目的地を選ぶ"}</h2>
        <p>
          {en
            ? "Selected map points are sent to Google to display this map. Sending them to TASUKU for route calculation requires the separate consent below."
            : "地図に指定した地点は、地図表示のためGoogleへ送信されます。TASUKUでの経路計算への送信には、下の別の同意が必要です。"}
        </p>
        <div className="form-actions">
          <IonButton
            fill={selecting === "origin" ? "solid" : "outline"}
            onClick={() => setSelecting("origin")}
          >
            {en ? "Select start on map" : "地図で出発地を選ぶ"}
          </IonButton>
          <IonButton
            fill={selecting === "destination" ? "solid" : "outline"}
            onClick={() => setSelecting("destination")}
          >
            {en ? "Select destination on map" : "地図で目的地を選ぶ"}
          </IonButton>
        </div>
        <p role="status">
          {selecting === "origin"
            ? en
              ? "Tap the map to choose your start."
              : "地図をタップして出発地を選んでください。"
            : en
              ? "Tap the map to choose your destination."
              : "地図をタップして目的地を選んでください。"}
        </p>
        <RoadPreviewMap
          origin={origin}
          destination={destination}
          geometry={
            result?.geometry as { coordinates?: number[][] } | undefined
          }
          onSelect={choosePoint}
          en={en}
        />
        <details>
          <summary>
            {en ? "Enter coordinates instead" : "座標を指定する"}
          </summary>
          {(["origin", "destination"] as const).map((kind) => (
            <fieldset key={kind}>
              <legend>
                {kind === "origin"
                  ? en
                    ? "Start"
                    : "出発地"
                  : en
                    ? "Destination"
                    : "目的地"}
              </legend>
              {(["latitude", "longitude"] as const).map((axis) => (
                <label key={axis}>
                  {axis === "latitude"
                    ? en
                      ? "Latitude"
                      : "緯度"
                    : en
                      ? "Longitude"
                      : "経度"}
                  <input
                    type="number"
                    step="any"
                    min={axis === "latitude" ? -90 : -180}
                    max={axis === "latitude" ? 90 : 180}
                    aria-label={`${kind} ${axis}`}
                    value={coordinates[kind][axis]}
                    onChange={(event) => {
                      const value = event.target.value;
                      const fields = { ...coordinates[kind], [axis]: value };
                      setCoordinates((previous) => ({
                        ...previous,
                        [kind]: fields,
                      }));
                      const latitude = Number(fields.latitude),
                        longitude = Number(fields.longitude);
                      const next =
                        fields.latitude !== "" &&
                        fields.longitude !== "" &&
                        Number.isFinite(latitude) &&
                        Number.isFinite(longitude) &&
                        Math.abs(latitude) <= 90 &&
                        Math.abs(longitude) <= 180
                          ? { latitude, longitude }
                          : undefined;
                      if (kind === "origin") setOrigin(next);
                      else setDestination(next);
                      setConsent(false);
                    }}
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </details>
        <p>
          {en
            ? "If you agree below, your GPS position is read and sent to Google to show it on this map. It is not saved as a shared support position."
            : "下のボタンで同意するとGPS位置を取得し、地図表示のためGoogleへ送信します。支援用の共有位置として保存しません。"}
        </p>
        <IonButton
          fill="outline"
          disabled={gps.isPending}
          onClick={() => gps.mutate()}
        >
          {en ? "Agree and read current location" : "同意して現在地を取得"}
        </IonButton>
        <ErrorNotice error={gps.error} />
        <p>
          {en
            ? "Your profile controls language and a conservative distance/speed time estimate. Stairs, gradients, wheelchair access and disaster closures are NOT verified."
            : "プロフィールの言語と移動速度で案内・時間目安を調整します。階段・勾配・車いす対応・災害による閉塞は未確認です。"}
        </p>
        {!profile && (
          <IonButton routerLink="/profile" fill="outline">
            {en ? "Save your profile first" : "先にプロフィールを登録"}
          </IonButton>
        )}
        <label className="navigation-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          {en
            ? "I agree to send these two points to TASUKU and Google for this route calculation. These points will not be saved in TASUKU."
            : "この2地点を今回の経路計算のためTASUKUとGoogleへ送信することに同意します。TASUKUには保存しません。"}
        </label>
        <IonButton
          disabled={
            !origin || !destination || !consent || !profile || route.isPending
          }
          onClick={() => route.mutate()}
        >
          {en ? "Preview walking route" : "徒歩経路を表示"}
        </IonButton>
        <ErrorNotice error={route.error} />
      </section>
      {result && (
        <section className="match-card">
          <h2>
            {en
              ? "Ordinary walking route · accessibility unverified"
              : "通常の徒歩経路・移動条件への対応は未確認"}
          </h2>
          <p>
            {result.distanceMeters} m ·{" "}
            {en ? "Your time estimate" : "あなたの移動時間目安"}{" "}
            {Math.ceil(result.personalEstimatedSeconds / 60)}
            {en ? " min" : "分"} ({result.walkingSpeedMetersPerSecond} m/s)
          </p>
          <p>
            {en ? "Google estimate" : "Googleの時間目安"}{" "}
            {Math.ceil(result.providerSeconds / 60)}
            {en ? " min" : "分"} ·{" "}
            {new Date(result.checkedAt).toLocaleString(language)}
          </p>
          {result.warnings.map((warning, i) => (
            <p className="notice" key={i}>
              {warning}
            </p>
          ))}
          <p>
            {en
              ? "Street View shows past imagery, not current conditions or AR. Stop walking before viewing. Google receives the selected viewpoint when opened."
              : "ストリートビューは過去の撮影画像で、現在の状況やARではありません。立ち止まって確認してください。開くと選んだ地点がGoogleへ送信されます。"}
          </p>
          <ol className="walking-steps">
            {result.steps.map((step, index) => (
              <li key={index}>
                <p>
                  {step.instruction} · {step.distanceMeters} m
                </p>
                <a
                  href={streetView(step.start)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {en
                    ? "Check this point in Google Street View ↗"
                    : "この地点をGoogleストリートビューで確認 ↗"}
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Layout>
  );
}
