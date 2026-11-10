import { useState } from "react";
import { IonButton, IonSelect, IonSelectOption } from "@ionic/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, ErrorNotice } from "../components/Layout";
import { RoadPreviewMap } from "../components/RoadPreviewMap";
import { getCurrentLocation } from "../services/location";
import { realData } from "../services/realData";
import { useAppStore } from "../stores/useAppStore";
import { supportLabel } from "./SupportPage";
import type { Location, SupportType } from "../types/domain";
import type { components } from "../types/api.generated";

type Assistance = components["schemas"]["AssistanceOutput"];
type Candidate = components["schemas"]["AssistanceCandidate"];
const statusLabel = (status: Assistance["status"], en: boolean) =>
  ({
    waiting: en ? "Waiting for a volunteer" : "支援者の承諾待ち",
    accepted: en ? "Meeting point agreed" : "承諾済み・合流へ移動",
    met: en ? "Both confirmed meeting" : "双方が合流を確認",
    completed: en ? "Completed" : "完了",
    cancelled: en ? "Cancelled" : "中止",
    expired: en ? "Expired" : "期限切れ",
  })[status];

export function AssistancePage({ helper = false }: { helper?: boolean }) {
  const { language, profile } = useAppStore(),
    en = language === "en";
  const client = useQueryClient();
  const [point, setPoint] = useState<Location>();
  const [acquiredAt, setAcquiredAt] = useState<number>(0);
  const [consent, setConsent] = useState(false);
  const [metConfirmed, setMetConfirmed] = useState(false);
  const [supportType, setSupportType] = useState<SupportType>("navigation");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [lastStatus, setLastStatus] = useState("");
  const mine = useQuery({
    queryKey: ["real-assistance"],
    queryFn: realData.mine,
    refetchInterval: 5000,
  });
  const current = mine.data?.[0];
  const gps = useMutation({
    mutationFn: getCurrentLocation,
    onSuccess: async (value) => {
      setPoint(value);
      setAcquiredAt(Date.now());
      setConsent(false);
      setCandidates([]);
      setSearched(false);
      if (current?.status === "waiting" && current.role === "requester") {
        await realData.updatePosition(current.id, {
          origin: value,
          locationUseConsent: true,
        });
      }
    },
  });
  const ready = Boolean(
    point &&
    consent &&
    Date.now() - acquiredAt < 300000 &&
    profile?.locationSharingEnabled,
  );
  async function refresh() {
    setCandidates([]);
    setSearched(false);
    setMetConfirmed(false);
    await client.invalidateQueries({ queryKey: ["real-assistance"] });
  }
  const create = useMutation({
    mutationFn: () =>
      realData.create({
        origin: point!,
        locationUseConsent: consent,
        locationSharingConsent: consent,
        supportType,
      }),
    onSuccess: refresh,
  });
  const search = useMutation({
    mutationFn: () =>
      realData.discover({ origin: point!, locationUseConsent: consent }),
    onSuccess: (values) => {
      setCandidates(values);
      setSearched(true);
    },
  });
  const accept = useMutation({
    mutationFn: (id: string) =>
      realData.accept(id, {
        origin: point!,
        locationUseConsent: consent,
        locationSharingConsent: consent,
      }),
    onSuccess: refresh,
  });
  const directions = useMutation({
    mutationFn: async () => ({
      id: current!.id,
      point,
      route: await realData.directions(current!.id, {
        origin: point!,
        locationUseConsent: consent,
      }),
    }),
  });
  const ownRoute =
    directions.data?.id === current?.id && directions.data?.point === point
      ? directions.data?.route
      : undefined;
  const progress = useMutation({
    mutationFn: async (action: "arrive" | "cancel" | "complete") => {
      // Arrival is a deliberate visual confirmation plus a fresh location reading,
      // not a claim that GPS alone proves that two people actually met.
      const origin =
        action === "arrive" ? await getCurrentLocation() : undefined;
      return realData.progress(current!.id, {
        action,
        origin,
        locationUseConsent: action === "arrive",
      });
    },
    onSuccess: async (value) => {
      setLastStatus(statusLabel(value.status, en));
      await refresh();
    },
  });
  return (
    <Layout
      title={
        helper
          ? en
            ? "Nearby assistance"
            : "近くの支援に協力"
          : en
            ? "Request nearby assistance"
            : "近くの人に支援を依頼"
      }
      dataMode="real_preview"
    >
      <div className="notice">
        {en
          ? "Real-position trial. Only people who explicitly request support are discoverable; the app does not infer who needs help. Use emergency services for rescue. Road damage and accessibility are unverified."
          : "実位置を使う訓練・試験機能です。本人が支援を依頼した場合だけ検索対象になります。アプリが支援の必要性を推測することはありません。救助が必要な場合は119番へ。道路の被災・移動条件への対応は未確認です。"}
      </div>
      {!profile?.locationSharingEnabled && (
        <p className="notice">
          {en
            ? "Enable location sharing in your profile. Volunteers also need availability and support capabilities."
            : "プロフィールで位置共有を有効にしてください。支援者は受付状態と対応できる支援内容も設定してください。"}{" "}
          <IonButton routerLink="/profile">
            {en ? "Profile" : "設定する"}
          </IonButton>
        </p>
      )}
      <section className="form-card">
        <h2>{en ? "Your actual location" : "あなたの実際の現在地"}</h2>
        <p>
          {en
            ? "Agree to read GPS and display it with Google. While your request is waiting, refreshing also updates its shared position. Requesting support stores your location privately in TASUKU for up to 30 minutes. No other user receives your GPS. With the consent below, Google computes approaches to a shared public meeting site."
            : "同意してGPSを取得し、Googleの地図へ表示します。依頼が受付中の場合は共有位置も更新します。支援を依頼するとTASUKUが最大30分、位置を非公開で保持します。他の利用者にGPS座標は渡しません。下の同意後、Googleが双方から公開合流地点への経路を計算します。"}
        </p>
        <IonButton disabled={gps.isPending} onClick={() => gps.mutate()}>
          {en ? "Agree & refresh GPS" : "同意してGPS現在地を取得・更新"}
        </IonButton>
        <ErrorNotice error={gps.error} />
        <p role="status">
          {point
            ? `${en ? "GPS acquired" : "GPS取得済み"} · ${new Date(acquiredAt).toLocaleTimeString(language)}`
            : en
              ? "Current location not acquired. No simulation point is used."
              : "現在地は未取得です。模擬地点は使用しません。"}
        </p>
        <label className="navigation-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          {en
            ? "I agree to use this GPS position to find/match support and send both approaches to Google. The public site is not a verified entrance or safe site."
            : "このGPS位置での支援検索・マッチングと、双方の合流経路をGoogleへ送信して計算することに同意します。公開地点の入口・安全性は未確認です。"}
        </label>
        {helper && !profile?.isAvailableToHelp && (
          <p>
            {en
              ? "Turn on availability in your profile."
              : "プロフィールの支援受付を有効にしてください。"}
          </p>
        )}
      </section>
      <ErrorNotice error={mine.error} />
      {lastStatus && <p role="status">{lastStatus}</p>}
      {current ? (
        <section className="form-card">
          <h2>{statusLabel(current.status, en)}</h2>
          <p>
            {supportLabel(current.supportType, en)} ·{" "}
            {en ? "Expires" : "有効期限"}{" "}
            {new Date(current.expiresAt).toLocaleTimeString(language)}
          </p>
          {current.meetingPoint && (
            <>
              <h3>{current.meetingPoint.name}</h3>
              <p>{current.meetingPoint.address}</p>
              {current.meetingPoint.remarks && (
                <p>{current.meetingPoint.remarks}</p>
              )}
              <RoadPreviewMap
                origin={point}
                destination={current.meetingPoint}
                geometry={
                  ownRoute?.geometry as { coordinates?: number[][] } | undefined
                }
                en={en}
              />
              <p>
                {en
                  ? "The point minimises total straight-line approach distance among nearby public earthquake sites; both ordinary walking routes were checked. It is not a verified entrance or a safest/shortest evacuation route."
                  : "周辺の地震対応指定緊急避難場所から、双方の直線移動距離の合計が短い地点を選び、両者の通常徒歩経路を確認しています。入口や最短・安全な避難経路を保証するものではありません。"}
              </p>
              <a
                href="https://maps.gsi.go.jp/development/ichiran.html#skhb"
                target="_blank"
                rel="noreferrer"
              >
                出典：国土地理院・指定緊急避難場所 ↗
              </a>
              <IonButton
                disabled={!ready || directions.isPending}
                onClick={() => directions.mutate()}
              >
                {en
                  ? "Show my route to meeting"
                  : "自分の現在地から合流地点への道順"}
              </IonButton>
              <ErrorNotice error={directions.error} />
              {ownRoute && (
                <>
                  <h3>
                    {ownRoute.distanceMeters}m ·{" "}
                    {Math.ceil(ownRoute.personalEstimatedSeconds / 60)}
                    {en ? " min" : "分"}
                  </h3>
                  {ownRoute.warnings.map((w, i) => (
                    <p className="notice" key={i}>
                      {w}
                    </p>
                  ))}
                  <ol>
                    {ownRoute.steps.map((s, i) => (
                      <li key={i}>
                        {s.instruction} · {s.distanceMeters}m
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <p>
                {en
                  ? "Requester / volunteer arrival confirmations"
                  : "依頼者 / 支援者の合流確認"}
                ：{current.requesterArrived ? "✓" : "—"} /{" "}
                {current.helperArrived ? "✓" : "—"}
              </p>
              {current.status === "accepted" && (
                <>
                  <label className="navigation-consent">
                    <input
                      type="checkbox"
                      checked={metConfirmed}
                      onChange={(e) => setMetConfirmed(e.target.checked)}
                    />
                    {en
                      ? "I have met the other person at this site. I agree to read fresh GPS for the confirmation."
                      : "この地点で実際に相手と会えたことを確認しました。確認のため再度GPSを取得することに同意します。"}
                  </label>
                  <IonButton
                    disabled={!metConfirmed || progress.isPending}
                    onClick={() => progress.mutate("arrive")}
                  >
                    {en ? "Confirm meeting" : "合流を確認"}
                  </IonButton>
                </>
              )}
              {current.status === "met" && (
                <IonButton
                  disabled={progress.isPending}
                  onClick={() => progress.mutate("complete")}
                >
                  {en ? "Complete assistance" : "支援を完了"}
                </IonButton>
              )}
            </>
          )}
          {current.warnings.map((w, i) => (
            <p className="muted" key={i}>
              {w}
            </p>
          ))}
          <IonButton
            fill="outline"
            color="danger"
            disabled={progress.isPending}
            onClick={() => progress.mutate("cancel")}
          >
            {en ? "Cancel assistance" : "支援を中止する"}
          </IonButton>
          <ErrorNotice error={progress.error} />
        </section>
      ) : (
        <section className="form-card">
          {helper ? (
            <>
              <h2>
                {en
                  ? "Opt-in requests within 2 km"
                  : "2km以内で支援を希望する人"}
              </h2>
              <p>
                {en
                  ? "Only requests matching your capabilities/language are listed. Exact positions are private; acceptance shares a public meeting point."
                  : "対応能力・言語が合う依頼を表示します。正確な位置は非公開です。承諾すると共通の公開合流地点を表示します。"}
              </p>
              <IonButton
                disabled={
                  !ready || !profile?.isAvailableToHelp || search.isPending
                }
                onClick={() => search.mutate()}
              >
                {en ? "Find nearby requests" : "近くの依頼を探す"}
              </IonButton>
              <ErrorNotice error={search.error} />
              {searched && !candidates.length && (
                <p>
                  {en
                    ? "No matching opt-in requests nearby."
                    : "近くに条件の合う支援依頼はありません。"}
                </p>
              )}
              {candidates.map((c) => (
                <div className="match-card" key={c.id}>
                  <strong>{supportLabel(c.supportType, en)}</strong>
                  <p>
                    {en ? "Within 2 km" : "2km以内"} ·{" "}
                    {c.language === "ja" ? "日本語" : "English"}
                  </p>
                  <IonButton
                    disabled={!ready || accept.isPending}
                    onClick={() => accept.mutate(c.id)}
                  >
                    {accept.isPending
                      ? en
                        ? "Checking real routes…"
                        : "実道路で合流地点を確認中…"
                      : en
                        ? "Accept & choose meeting point"
                        : "承諾して合流地点を決める"}
                  </IonButton>
                </div>
              ))}
              <ErrorNotice error={accept.error} />
            </>
          ) : (
            <>
              <h2>{en ? "What support do you need?" : "必要な支援を選ぶ"}</h2>
              <IonSelect
                aria-label={en ? "Support type" : "支援内容"}
                value={supportType}
                onIonChange={(e) => setSupportType(e.detail.value)}
              >
                {(
                  [
                    "navigation",
                    "translation",
                    "information",
                    "walking_companion",
                  ] as const
                ).map((t) => (
                  <IonSelectOption key={t} value={t}>
                    {supportLabel(t, en)}
                  </IonSelectOption>
                ))}
              </IonSelect>
              <p>
                {en
                  ? "A volunteer nearby can accept. The app then selects a public meeting site accessible by ordinary walking routes from both locations. It does not send anyone to your private GPS point."
                  : "近くの支援者が承諾すると、双方から通常の徒歩経路がある公開合流地点を選びます。相手があなたのGPS地点へ直接向かう方式ではありません。"}
              </p>
              <IonButton
                disabled={!ready || create.isPending}
                onClick={() => create.mutate()}
              >
                {en
                  ? "Request support with this GPS"
                  : "このGPS現在地で支援を依頼"}
              </IonButton>
              <ErrorNotice error={create.error} />
            </>
          )}
        </section>
      )}
    </Layout>
  );
}
