import { useCallback, useEffect, useRef, useState } from "react";
import { IonButton } from "@ionic/react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { Layout, ErrorNotice } from "../components/Layout";
import { TurnByTurnNavigator } from "../components/TurnByTurnNavigator";
import { EvacuationAdvisor } from "../components/EvacuationAdvisor";
import { RoadPreviewMap } from "../components/RoadPreviewMap";
import { realData } from "../services/realData";
import { useLocationSession } from "../stores/useLocationSession";
import { LocationPreferences } from "../components/LocationPreferences";
import { meters } from "../navigation/progress";
import { useRealEnvironment } from "../features/useRealEnvironment";
import { useAppStore } from "../stores/useAppStore";
import type { Location } from "../types/domain";
import type { components } from "../types/api.generated";

type Route = components["schemas"]["RealRouteOutput"];
const EMPTY_SITES: never[] = [];
const streetView = (point: Location) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`;
const intensity = (value: number) =>
  ({
    10: "1",
    20: "2",
    30: "3",
    40: "4",
    45: "5弱",
    46: "5弱以上",
    50: "5強",
    55: "6弱",
    60: "6強",
    70: "7",
    99: "程度以上",
  })[value] || "不明";

export function NavigationPage() {
  const { language, profile } = useAppStore();
  const en = language === "en";
  // Never read the simulation's default Fukuyama coordinate as this user's GPS.
  const [origin, setOrigin] = useState<Location>();
  const [originTime, setOriginTime] = useState<Date>();
  const [destination, setDestination] = useState<Location>();
  const [destinationName, setDestinationName] = useState("");
  const { consent: permissions, fix } = useLocationSession();
  const consent = permissions.services,
    compareConsent = consent;
  const [recommended, setRecommended] = useState<{
    signature: string;
    point: Location;
    site: string;
    route: Route;
    compared: number;
  }>();
  const [expanded, setExpanded] = useState(!permissions.services);
  const [tab, setTab] = useState<"sites" | "earthquakes" | "route">("sites");
  const [manual, setManual] = useState({ latitude: "", longitude: "" });
  const [originSource, setOriginSource] = useState<"gps" | "manual">("gps");
  const active = useLocation().pathname === "/home";
  const [areaOrigin, setAreaOrigin] = useState<Location>();
  useEffect(() => {
    if (!permissions.services) {
      setOrigin(undefined);
      setOriginTime(undefined);
      setAreaOrigin(undefined);
      return;
    }
    if (originSource === "manual") {
      setAreaOrigin(origin);
      return;
    }
    if (!fix || Date.now() - fix.timestamp > 10000) {
      setAreaOrigin(undefined);
      return;
    }
    setOriginTime(new Date(fix.timestamp));
    // Keep the planned route stable. The live marker/watch continues independently.
    setOrigin((previous) => previous || fix);
    setAreaOrigin((previous) =>
      !previous || meters(previous, fix) >= 250 ? fix : previous,
    );
  }, [fix, permissions.services, originSource, origin]);
  const liveGPS = Boolean(fix && Date.now() - fix.timestamp <= 10000);
  const usable = consent && (originSource === "manual" || liveGPS);
  const { earthquake, shelters } = useRealEnvironment(
    areaOrigin,
    active && usable,
  );

  const chooseDestination = useCallback(
    (point: Location) => {
      if (originSource === "gps" && fix) setOrigin(fix);
      setDestination(point);
      setDestinationName("");
      setTab("route");
      setExpanded(true);
    },
    [fix, originSource],
  );
  const chooseSite = useCallback(
    (id: string) => {
      const site = shelters.data?.sites.find((s) => s.id === id);
      if (site) {
        if (originSource === "gps" && fix) setOrigin(fix);
        setDestination(site);
        setDestinationName(site.name);
        setTab("route");
        setExpanded(true);
      }
    },
    [shelters.data, fix, originSource],
  );
  function setStart(point: Location, source: "gps" | "manual") {
    setOrigin(point);
    setOriginTime(new Date());
    setOriginSource(source);
  }
  const signature = JSON.stringify({ origin, destination, profile, language });
  const route = useMutation({
    mutationFn: async (start: Location) => ({
      result: await realData.walking({
        origin: start,
        destination: destination!,
        locationUseConsent: consent,
      }),
      signature: JSON.stringify({
        origin: start,
        destination,
        profile,
        language,
      }),
    }),
    onSuccess: () => setExpanded(true),
  });
  const recommendationSignature = JSON.stringify({ origin, profile, language });
  const latestContext = useRef(recommendationSignature);
  latestContext.current = recommendationSignature;
  const compare = useMutation({
    mutationFn: async (start: Location) => ({
      value: await realData.recommend({
        origin: start,
        locationUseConsent: compareConsent,
      }),
      signature: JSON.stringify({ origin: start, profile, language }),
    }),
    onSuccess: ({ value, signature: originalSignature }) => {
      if (originalSignature !== latestContext.current) return;
      setDestination(value.site);
      setDestinationName(value.site.name);
      setTab("route");
      setRecommended({
        signature: originalSignature,
        point: value.site,
        site: value.site.name,
        route: value.route,
        compared: value.comparedSites,
      });
      setExpanded(true);
    },
  });
  const recommendedResult =
    recommended?.signature === recommendationSignature &&
    destination?.latitude === recommended.point.latitude &&
    destination?.longitude === recommended.point.longitude
      ? recommended
      : undefined;
  const result =
    consent && route.data?.signature === signature
      ? route.data.result
      : consent
        ? recommendedResult?.route
        : undefined;
  const localNotices =
    usable && !earthquake.error && earthquake.data?.status === "available"
      ? earthquake.data.notices
      : [];
  const alert = localNotices.find((n) => n.code === 556) || localNotices[0];
  return (
    <Layout
      title={en ? "Your map" : "現在地のマップ"}
      dataMode="real_preview"
      mapMode
    >
      <div className="live-map-stage">
        <RoadPreviewMap
          origin={originSource === "gps" ? (consent ? fix : undefined) : origin}
          destination={destination}
          geometry={
            result?.geometry as { coordinates?: number[][] } | undefined
          }
          sites={
            usable && !shelters.error && shelters.data?.status === "available"
              ? shelters.data.sites
              : EMPTY_SITES
          }
          onSiteSelect={chooseSite}
          onSelect={chooseDestination}
          en={en}
        />
        <div className="map-top-controls">
          <Link to="/home" className="map-brand">
            T. <span>TASUKU</span>
          </Link>
          <Link to="/profile" className="map-profile">
            {en ? "Profile" : "プロフィール"}
          </Link>
        </div>
        <div className="map-training">
          {en
            ? "TRAINING / Real data · route safety unverified"
            : "訓練・実データ表示 / 経路の安全性は未確認"}
        </div>
        {alert && (
          <button
            className="local-quake-alert"
            onClick={() => {
              setTab("earthquakes");
              setExpanded(true);
            }}
          >
            {alert.title} · {alert.area} ·{" "}
            {en ? "Intensity" : "対象地域の最大震度"} {intensity(alert.scale)}
          </button>
        )}
        <section
          className={`map-sheet ${expanded ? "expanded" : "collapsed"}`}
          aria-label={en ? "Map controls" : "地図の操作"}
        >
          <button
            className="sheet-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <span className="sheet-handle" />
            {expanded
              ? en
                ? "Show more map ↓"
                : "地図を広げる ↓"
              : en
                ? "Show controls ↑"
                : "操作パネルを開く ↑"}
          </button>
          <div className="map-location-row">
            <div>
              <strong>
                {origin
                  ? originSource === "gps"
                    ? en
                      ? liveGPS
                        ? "GPS auto-updating"
                        : "Waiting for GPS"
                      : liveGPS
                        ? "GPS自動更新中"
                        : "GPS受信待ち"
                    : en
                      ? "Manually selected start"
                      : "手動で指定した出発地"
                  : en
                    ? "Start with your current location"
                    : "あなたの現在地から始める"}
              </strong>
              <small>
                {originTime
                  ? `${originTime.toLocaleTimeString(language)} · ${en ? "Automatic GPS updates" : "GPS自動更新"}`
                  : en
                    ? "No default or fictional location"
                    : "架空の現在地は設定していません"}
              </small>
            </div>
            <IonButton
              size="small"
              onClick={() => {
                setOriginSource("gps");
                setOrigin(fix);
                setExpanded(true);
              }}
            >
              {en ? "GPS settings" : "GPS・同意設定"}
            </IonButton>
          </div>
          {!expanded && (
            <p className="map-compact-privacy">
              {en
                ? "GPS is sent to TASUKU, Google and GSI only after you agree. No sharing with other users."
                : "同意後に現在地をTASUKU・Google・国土地理院へ送信します。他の利用者には共有しません。"}
            </p>
          )}
          {result && !expanded && (
            <button
              className="map-route-summary"
              onClick={() => {
                setTab("route");
                setExpanded(true);
              }}
            >
              {destinationName || (en ? "Your route" : "選択した目的地")} ·{" "}
              {result.distanceMeters}m ·{" "}
              {Math.ceil(result.personalEstimatedSeconds / 60)}
              {en
                ? " min · Safety unverified · Details ↑"
                : "分 / 通行可否は未確認・道順を開く ↑"}
            </button>
          )}
          {expanded && (
            <div className="map-sheet-content">
              <LocationPreferences en={en} />
              {areaOrigin && usable && (
                <EvacuationAdvisor origin={areaOrigin} en={en} />
              )}
              <p className="map-privacy">
                {en
                  ? "GPS updates automatically after saved consent. P2PQuake receives no GPS. You can revoke processing consent here or in Profile."
                  : "保存した同意に基づきGPSを自動更新します。P2P地震情報へGPSは送りません。この設定またはプロフィールで同意を撤回できます。"}
              </p>
              <div
                className="map-tabs"
                role="tablist"
                aria-label="Map information"
              >
                {(
                  [
                    ["sites", en ? "Nearby sites" : "近くの避難場所"],
                    ["earthquakes", en ? "Local quakes" : "地域の地震"],
                    ["route", en ? "Directions" : "道順"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    role="tab"
                    aria-selected={tab === key}
                    key={key}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!origin && (
                <p className="notice">
                  {en
                    ? "Acquire your location to load actual nearby sites and your area's earthquake information."
                    : "現在地を取得すると、周辺の実在する避難場所と対象地域の地震情報を読み込みます。"}
                </p>
              )}
              {tab === "sites" && (
                <>
                  <p>
                    {en
                      ? "Earthquake-designated emergency sites within 5 km · straight-line distance"
                      : "周辺5kmの地震対応・指定緊急避難場所 / 距離は直線距離"}
                  </p>
                  <p className="muted">
                    {en
                      ? "An emergency site differs from an accommodation shelter. Data may be missing or out of date; check the municipality. Opening, capacity, entrances, accessibility and disaster road conditions are unverified."
                      : "指定緊急避難場所と滞在する指定避難所は異なります。未掲載・古い情報があるため自治体へ確認してください。開設・定員・入口・段差・道路の被災状況は未確認です。"}
                  </p>
                  {origin && shelters.isPending && (
                    <p role="status">
                      {en
                        ? "Loading actual sites…"
                        : "実在する避難場所を取得中…"}
                    </p>
                  )}
                  {(shelters.error ||
                    shelters.data?.status === "unavailable") && (
                    <p role="alert">
                      {en
                        ? "Site source unavailable. No fictional sites substituted."
                        : "避難場所データを取得できません。架空の場所への置換は行いません。"}
                    </p>
                  )}
                  {shelters.data?.status === "available" &&
                    !shelters.data.sites.length && (
                      <p>
                        {en
                          ? "No published earthquake-designated site found in this 5 km search."
                          : "今回の5km検索では、公開された地震対応の指定緊急避難場所が見つかりません。"}
                      </p>
                    )}
                  {!profile && (
                    <IonButton routerLink="/profile" fill="outline">
                      {en
                        ? "Save your profile to compare routes"
                        : "経路を比較する前にプロフィールを登録"}
                    </IonButton>
                  )}
                  <IonButton
                    disabled={
                      !usable ||
                      !origin ||
                      !profile ||
                      !compareConsent ||
                      compare.isPending ||
                      shelters.data?.status !== "available"
                    }
                    onClick={() => {
                      const start = originSource === "gps" ? fix! : origin!;
                      setOrigin(start);
                      compare.mutate(start);
                    }}
                  >
                    {compare.isPending
                      ? en
                        ? "Comparing routes…"
                        : "徒歩経路を比較中…"
                      : en
                        ? "Compare up to 3 nearby walking routes"
                        : "近くの3候補の徒歩経路を比較"}
                  </IonButton>
                  <ErrorNotice error={compare.error} />
                  <div className="real-site-list">
                    {(usable ? shelters.data?.sites : [])?.map((site) => (
                      <button key={site.id} onClick={() => chooseSite(site.id)}>
                        <span className="site-symbol">避</span>
                        <span>
                          <strong>{site.name}</strong>
                          <small>{site.address}</small>
                          {site.remarks && <small>{site.remarks}</small>}
                        </span>
                        <span>{site.distanceMeters}m →</span>
                      </button>
                    ))}
                  </div>
                  <a
                    href="https://maps.gsi.go.jp/development/ichiran.html#skhb"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {en
                      ? "Source: GSI designated emergency evacuation sites ↗"
                      : "出典：国土地理院・指定緊急避難場所 ↗"}
                  </a>
                  {shelters.data?.fetchedAt && (
                    <small className="source-time">
                      {en ? "Retrieved" : "取得"}{" "}
                      {new Date(shelters.data.fetchedAt).toLocaleString(
                        language,
                      )}
                    </small>
                  )}
                </>
              )}
              {tab === "earthquakes" && (
                <>
                  <strong>
                    {earthquake.data?.area ||
                      (en ? "Area not determined" : "対象地域は未判定")}
                  </strong>
                  <p>
                    {en
                      ? "P2PQuake (JMA information) · refreshes every 15 seconds while visible. Only reports affecting your seismic area within the last 10 minutes are shown; distant epicentres may still affect this area."
                      : "P2P地震情報（気象庁発表） / 表示中は15秒ごとに更新。直近10分のうち、現在地の震度・警報対象地域に該当する情報だけ表示します。震源が遠くても対象地域なら表示します。"}
                  </p>
                  <p className="notice">
                    {en
                      ? "Trial display. Delivery can be delayed, interrupted or missing. This does not guarantee an early warning. Mobile background operation and push notifications are not available."
                      : "試験表示です。配信の遅延・停止・欠落があり、緊急地震速報の受信を保証しません。スマホのバックグラウンド受信・プッシュ通知は未対応です。"}
                  </p>
                  {origin && earthquake.isPending && (
                    <p role="status">
                      {en ? "Checking area…" : "対象地域を確認中…"}
                    </p>
                  )}
                  {(earthquake.error ||
                    earthquake.data?.status === "unavailable") && (
                    <p role="alert">
                      {en
                        ? "Earthquake source unavailable; this does not mean no earthquake."
                        : "地震情報を取得できません。地震がないことを意味しません。"}
                    </p>
                  )}
                  {earthquake.data?.status === "area_unknown" && (
                    <p role="alert">
                      {en
                        ? "Unable to map this position to a seismic area. No local alerts can be determined."
                        : "この地点を地震の対象地域へ対応づけられません。地域の地震を判定できません。"}
                    </p>
                  )}
                  {earthquake.data?.status === "available" &&
                    !localNotices.length && (
                      <p role="status">
                        {en
                          ? "No matching reports in the retrieved time window. This is not an all-clear."
                          : "取得した範囲に対象地域の情報はありません。安全を示すものではありません。"}
                      </p>
                    )}
                  {localNotices.map((n) => (
                    <article className="local-quake-card" key={n.id}>
                      <strong>
                        {n.title} · {n.area}
                      </strong>
                      <p>
                        {en ? "Local maximum intensity" : "対象地域の最大震度"}{" "}
                        {intensity(n.scale)} · {n.hypocenter}
                      </p>
                      <small>
                        {new Date(n.issuedAt).toLocaleString(language)}
                      </small>
                    </article>
                  ))}
                  <a
                    href="https://www.p2pquake.net/develop/json_api_v2/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    P2P地震情報 / 気象庁 発表情報 ↗
                  </a>
                  {earthquake.data?.fetchedAt && (
                    <small className="source-time">
                      {en ? "Retrieved" : "取得"}{" "}
                      {new Date(earthquake.data.fetchedAt).toLocaleString(
                        language,
                      )}
                    </small>
                  )}
                </>
              )}
              {tab === "route" && (
                <>
                  {recommendedResult && (
                    <p className="notice">
                      {en
                        ? `Shortest returned walking distance among ${recommendedResult.compared} nearby candidates. Not a globally shortest or verified safe route.`
                        : `近くの${recommendedResult.compared}候補のうち、取得できた徒歩経路の距離が最短の地点です。地域全体の最短経路や安全性を保証するものではありません。`}
                    </p>
                  )}
                  <strong>
                    {destinationName ||
                      (destination
                        ? en
                          ? "Map-selected destination"
                          : "地図で指定した目的地"
                        : en
                          ? "Choose a destination"
                          : "目的地を選んでください")}
                  </strong>
                  <p>
                    {en
                      ? "Tap a site marker or choose a destination on the map."
                      : "避難場所のマーカー、一覧、または地図上をタップして目的地を選べます。"}
                  </p>
                  <p className="notice">
                    {en
                      ? "Ordinary walking routes. Your profile adjusts language and estimated time. Stairs, wheelchair access, disaster damage and the safest/shortest evacuation route are NOT verified."
                      : "通常の徒歩経路です。プロフィールの言語・移動速度で案内と時間を調整します。階段・車いす対応・被災状況は未確認のため「最短かつ安全な避難経路」とは判定していません。"}
                  </p>
                  {!profile && (
                    <IonButton routerLink="/profile">
                      {en ? "Set up profile" : "プロフィールを登録"}
                    </IonButton>
                  )}
                  <IonButton
                    disabled={
                      !usable ||
                      !origin ||
                      !destination ||
                      !consent ||
                      !profile ||
                      route.isPending
                    }
                    onClick={() => {
                      const start = originSource === "gps" ? fix! : origin!;
                      setOrigin(start);
                      route.mutate(start);
                    }}
                  >
                    {route.isPending
                      ? en
                        ? "Calculating…"
                        : "計算中…"
                      : en
                        ? "Show walking directions"
                        : "徒歩の道順を表示"}
                  </IonButton>
                  <ErrorNotice error={route.error} />
                  {result && (
                    <div className="real-route-result">
                      {active && usable && destination && (
                        <TurnByTurnNavigator
                          route={result}
                          destination={destination}
                          en={en}
                          recalculate={(point) =>
                            realData.walking({
                              origin: point,
                              destination,
                              locationUseConsent: true,
                            })
                          }
                        />
                      )}
                      <h2>
                        {result.distanceMeters} m ·{" "}
                        {Math.ceil(result.personalEstimatedSeconds / 60)}
                        {en ? " min" : "分"}
                      </h2>
                      <small>
                        {en
                          ? "Your estimate / Google"
                          : "あなたの時間目安 / Google"}{" "}
                        {Math.ceil(result.providerSeconds / 60)}
                        {en ? " min" : "分"}
                      </small>
                      {result.warnings.map((w, i) => (
                        <p className="notice" key={i}>
                          {w}
                        </p>
                      ))}
                      <p>
                        {en
                          ? "Street View is past imagery, not live conditions or AR. Stop before viewing; Google receives the viewpoint."
                          : "ストリートビューは過去の画像で、現在の状況やARではありません。立ち止まって確認してください。開くとGoogleへ地点を送信します。"}
                      </p>
                      <ol className="walking-steps">
                        {result.steps.map((s, i) => (
                          <li key={i}>
                            <p>
                              {s.instruction} · {s.distanceMeters}m
                            </p>
                            <a
                              href={streetView(s.start)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {en ? "Street View ↗" : "ストリートビュー ↗"}
                            </a>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </>
              )}
              <details className="manual-start">
                <summary>
                  {en
                    ? "Plan from a manually entered real point"
                    : "実在する地点を手動で指定して試す"}
                </summary>
                <p>
                  {en
                    ? "This is not your GPS position. The selected point is sent to the same services listed above."
                    : "GPS現在地としては扱いません。指定地点は上記と同じサービスへ送信します。"}
                </p>
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
                      aria-label={`origin ${axis}`}
                      type="number"
                      step="any"
                      value={manual[axis]}
                      onChange={(e) =>
                        setManual({ ...manual, [axis]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <IonButton
                  fill="outline"
                  disabled={
                    !consent ||
                    manual.latitude === "" ||
                    manual.longitude === "" ||
                    !Number.isFinite(Number(manual.latitude)) ||
                    !Number.isFinite(Number(manual.longitude)) ||
                    Math.abs(Number(manual.latitude)) > 90 ||
                    Math.abs(Number(manual.longitude)) > 180
                  }
                  onClick={() =>
                    setStart(
                      {
                        latitude: Number(manual.latitude),
                        longitude: Number(manual.longitude),
                      },
                      "manual",
                    )
                  }
                >
                  {en ? "Agree & use this start" : "同意してこの出発地を使用"}
                </IonButton>
              </details>
              <p className="muted">
                {en
                  ? "Use Request / Help below to try real-GPS assistance. The earlier fictional demo is separate."
                  : "下の「支援依頼」「支援協力」から実GPSで支援を試せます。過去の架空データのデモは別画面です。"}{" "}
                <Link to="/simulation">
                  {en ? "Open simulation" : "訓練用画面"}
                </Link>
              </p>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
