import { useState } from "react";
import { IonButton, IonIcon, IonSelect, IonSelectOption } from "@ionic/react";
import {
  alertCircleOutline,
  locateOutline,
  arrowForwardOutline,
  heartOutline,
  peopleOutline,
  timeOutline,
  accessibilityOutline,
  refreshOutline,
} from "ionicons/icons";
import { useMutation } from "@tanstack/react-query";
import { Layout, ErrorNotice } from "../components/Layout";
import { MapView } from "../components/MapView";
import {
  useRoutes,
  useScenarios,
  useShelters,
} from "../features/useSimulation";
import { useAppStore } from "../stores/useAppStore";
import { getCurrentLocation } from "../services/location";
import { api } from "../services/api";

export function HomePage() {
  const {
    language,
    locationLabel,
    setLocation,
    profile,
    disasterType,
    setDisasterType,
  } = useAppStore();
  const en = language === "en";
  const scenario = useScenarios(),
    shelters = useShelters(),
    routes = useRoutes();
  const [selected, setSelected] = useState<string>();
  const [consent, setConsent] = useState(false);
  const route =
    routes.data?.routes.find((r) => r.shelterId === selected) ??
    routes.data?.routes[0];
  const gps = useMutation({
    mutationFn: async () => {
      const loc = await getCurrentLocation();
      setLocation(loc, en ? "GPS position" : "GPS現在地");
      if (profile?.locationSharingEnabled) await api.put("/location", loc);
    },
  });
  const translation = useMutation({
    mutationFn: async () =>
      (
        await api.post<{
          text: string;
          provider: string;
          sourceText: string;
          requiresReview: boolean;
        }>("/translations/generate", { eventId: "event_001", language })
      ).data,
  });
  return (
    <Layout
      title={en ? "Find your next step." : "安心できる、次の一歩を。"}
      eyebrow="EVACUATION MAP"
    >
      <p className="intro">
        {en
          ? "Know where to go. Connect with someone nearby."
          : "避難先を確かめる。近くの誰かと、つながる。"}
      </p>
      {!profile && (
        <div className="setup-banner">
          {en
            ? "Start by setting your language and mobility needs."
            : "最初に、使用言語や移動のしやすさを登録しましょう。"}
          <IonButton size="small" routerLink="/profile">
            {en ? "Set up profile" : "プロフィールを登録"}
            <IonIcon slot="end" icon={arrowForwardOutline} />
          </IonButton>
        </div>
      )}
      <div className="disaster-banner">
        <IonIcon icon={alertCircleOutline} />
        <div>
          <strong>
            {en ? "Earthquake evacuation drill" : "地震を想定した避難訓練"}
          </strong>
          <p>
            {en
              ? "Check surroundings. Prioritize evacuation while waiting for help."
              : "周囲の状況を確認し、落下物・通行不可の道路を避けてください。"}
          </p>
          <small>
            TASUKU {en ? "simulation bulletin" : "模擬情報"} · 2026/11/05 09:00
            JST
          </small>
        </div>
        <button
          className="text-button"
          onClick={() => translation.mutate()}
          disabled={translation.isPending}
        >
          {en ? "Read guidance" : "案内を読む"} →
        </button>
      </div>
      {translation.data && (
        <div className="notice">
          <strong>
            {translation.data.provider === "gemini"
              ? "Gemini · AI翻訳（要確認）"
              : "定型案内 / Template"}
          </strong>
          <p>{translation.data.text}</p>
          {translation.data.requiresReview && (
            <small>原文 / Source: {translation.data.sourceText}</small>
          )}
        </div>
      )}
      <ErrorNotice error={translation.error} />
      <div className="map-workspace">
        <section className="map-card">
          <div className="map-toolbar">
            <div>
              <span className="status-dot blue-dot" />
              <strong>{locationLabel}</strong>
              <small>{en ? "Start point" : "出発点"}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Refresh routes"
              onClick={() => void routes.refetch()}
            >
              <IonIcon icon={refreshOutline} />
            </button>
          </div>
          <MapView
            scenario={scenario.data?.[0]}
            shelters={shelters.data ?? []}
            route={route}
            selected={route?.shelterId}
            onSelect={setSelected}
          />
          <div className="map-bottom">
            <span>
              ◎{" "}
              {en
                ? "Fictional locations and roads"
                : "避難場所・道路はすべて架空です"}
            </span>
            <button
              className="text-button"
              onClick={() => setConsent(!consent)}
            >
              <IonIcon icon={locateOutline} /> {en ? "Use GPS" : "現在地を取得"}
            </button>
          </div>
          {consent && (
            <div className="notice">
              {en
                ? "GPS is used for routing. It is sent to the server for calculation; saved for 30 minutes only when sharing is enabled."
                : "位置情報は経路計算でサーバーへ送信します。共有を有効にした場合のみ保存し、30分で失効します。"}
              <IonButton
                size="small"
                onClick={() => gps.mutate()}
                disabled={gps.isPending}
              >
                {en ? "Allow and get GPS" : "同意して取得"}
              </IonButton>
            </div>
          )}
          <div className="manual-location">
            <label>
              {en ? "Choose a demo start point" : "出発点を手動指定"}
              <IonSelect
                aria-label="Demo start point"
                value={
                  scenario.data?.[0]?.nodes.find(
                    (n) =>
                      n.latitude === useAppStore.getState().location.latitude &&
                      n.longitude === useAppStore.getState().location.longitude,
                  )?.id
                }
                onIonChange={(e) => {
                  const n = scenario.data?.[0]?.nodes.find(
                    (n) => n.id === e.detail.value,
                  );
                  if (n)
                    setLocation(
                      { latitude: n.latitude, longitude: n.longitude },
                      `${n.id}（模擬）`,
                    );
                }}
              >
                {scenario.data?.[0]?.nodes.map((n) => (
                  <IonSelectOption value={n.id} key={n.id}>
                    {n.id === "station"
                      ? en
                        ? "Station (demo)"
                        : "福山駅前（模擬）"
                      : n.id}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </label>
          </div>
          <ErrorNotice error={gps.error} />
          <ErrorNotice error={scenario.error} />
          <ErrorNotice error={shelters.error} />
        </section>
        <aside className="shelter-panel">
          <div className="section-heading">
            <h2>{en ? "Evacuation candidates" : "周辺の避難先"}</h2>
            <span>
              {routes.data?.routes.length ?? 0} {en ? "places" : "件"}
            </span>
          </div>
          <p className="section-caption">
            {en
              ? "Based on your mobility preferences"
              : "あなたの移動条件に合わせて表示"}
          </p>
          <IonSelect
            className="disaster-select"
            aria-label="Disaster type"
            value={disasterType}
            onIonChange={(e) => setDisasterType(e.detail.value)}
          >
            <IonSelectOption value="earthquake">
              {en ? "Earthquake" : "地震"}
            </IonSelectOption>
            <IonSelectOption value="tsunami">
              {en ? "Tsunami" : "津波"}
            </IonSelectOption>
            <IonSelectOption value="flood">
              {en ? "Flood" : "洪水"}
            </IonSelectOption>
          </IonSelect>
          {routes.isPending && (
            <p role="status">
              {en ? "Calculating routes…" : "経路を計算しています…"}
            </p>
          )}
          <ErrorNotice error={routes.error} />
          {routes.data?.status === "no_route" && (
            <div className="notice">
              {en
                ? "No route can be confirmed for these conditions. Check official guidance."
                : "この条件で経路を確認できません。公式の案内を確認してください。"}
            </div>
          )}
          {routes.data?.routes.map((r, index) => {
            const s = shelters.data?.find((s) => s.id === r.shelterId);
            return (
              <button
                key={r.routeId}
                className={`shelter-card ${route?.routeId === r.routeId ? "selected" : ""}`}
                onClick={() => setSelected(r.shelterId)}
              >
                {index === 0 && (
                  <span className="recommended">
                    {en ? "SHORTEST CANDIDATE" : "移動時間が短い候補"}
                  </span>
                )}
                <div className="shelter-title">
                  <span className="shelter-icon">⌂</span>
                  <strong>{s?.name}</strong>
                </div>
                <p>{s?.kind}</p>
                <div className="route-stats">
                  <strong>
                    {Math.ceil(r.estimatedSeconds / 60)}
                    <small>{en ? " min" : "分"}</small>
                  </strong>
                  <span>{r.distanceMeters} m</span>
                  <span>
                    <IonIcon icon={accessibilityOutline} />
                    {profile?.avoidStairs ||
                    profile?.mobilityType === "wheelchair"
                      ? en
                        ? "No stairs"
                        : "階段回避"
                      : en
                        ? "Demo route"
                        : "模擬経路"}
                  </span>
                </div>
                <div className="shelter-card-bottom">
                  {en ? "View route candidate" : "この経路候補を表示"}
                  <IonIcon icon={arrowForwardOutline} />
                </div>
              </button>
            );
          })}
          {route && (
            <div className="route-footnote">
              <IonIcon icon={timeOutline} />
              <span>
                {en ? "Checked" : "計算時刻"}{" "}
                {new Date(route.checkedAt).toLocaleTimeString(language)}
                <br />
                {en
                  ? "Simulation · safety unverified"
                  : "模擬データ・実際の安全性は未確認"}
              </span>
            </div>
          )}
        </aside>
      </div>
      {route && (
        <details className="route-warning">
          <summary>
            {en
              ? "Route data and limitations"
              : "経路候補の注意事項・データについて"}
          </summary>
          {route.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <p>
            {en
              ? "Capacity and opening status are fictional, not live availability."
              : "収容人数・開設状態は模擬値です。現在の受入状況を示しません。"}
          </p>
        </details>
      )}
      <div className="action-grid">
        <div className="action-card request">
          <span className="action-icon">
            <IonIcon icon={heartOutline} />
          </span>
          <div>
            <h2>{en ? "Need a little help?" : "ひとりで、不安なときは。"}</h2>
            <p>
              {en
                ? "Ask for directions, translation or company."
                : "道案内や通訳、徒歩での同行を依頼できます。"}
            </p>
          </div>
          <IonButton routerLink="/support">
            {en ? "Request support" : "支援を求める"}
            <IonIcon slot="end" icon={arrowForwardOutline} />
          </IonButton>
        </div>
        <div className="action-card">
          <span className="action-icon">
            <IonIcon icon={peopleOutline} />
          </span>
          <div>
            <h2>
              {en ? "A hand when you can." : "できることから、支え合う。"}
            </h2>
            <p>
              {en
                ? "Offer help within your own safety limits."
                : "自分の避難を優先し、無理のない範囲で。"}
            </p>
          </div>
          <IonButton fill="outline" routerLink="/helper">
            {en ? "Offer support" : "支援に協力する"}
            <IonIcon slot="end" icon={arrowForwardOutline} />
          </IonButton>
        </div>
      </div>
      <footer className="content-footer">
        TASUKU{" "}
        <span>
          {en
            ? "You are not alone, even in an unfamiliar city."
            : "知らない街でも、ひとりにしない。"}
        </span>
        <small>SIMULATION ONLY</small>
      </footer>
    </Layout>
  );
}
