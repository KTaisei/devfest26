import { useEffect, useRef, useState } from "react";
import { IonButton, IonSelect, IonSelectOption } from "@ionic/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { TurnByTurnNavigator } from "../components/TurnByTurnNavigator";
import { DecisionNotice } from "../components/DecisionNotice";
import { Layout, ErrorNotice } from "../components/Layout";
import { RoadPreviewMap } from "../components/RoadPreviewMap";
import { useLocationSession } from "../stores/useLocationSession";
import { LocationPreferences } from "../components/LocationPreferences";
import { realData } from "../services/realData";
import { useAppStore } from "../stores/useAppStore";
import { supportLabel } from "./SupportPage";
import type { SupportType } from "../types/domain";
import type { components } from "../types/api.generated";

type Assistance = components["schemas"]["AssistanceOutput"];
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
  const { fix, consent: permissions } = useLocationSession();
  const point = permissions.services ? fix : undefined;
  const acquiredAt = point?.timestamp || 0;
  const consent = permissions.services && permissions.assistance;
  const aiConsent = permissions.ai;
  const [metConfirmed, setMetConfirmed] = useState(false);
  const [supportType, setSupportType] = useState<SupportType>("navigation");
  const [now, setNow] = useState(Date.now());
  const active = useLocation().pathname === (helper ? "/helper" : "/support");
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  const [lastStatus, setLastStatus] = useState("");
  const mine = useQuery({
    queryKey: ["real-assistance"],
    queryFn: realData.mine,
    refetchInterval: 3000,
    enabled: active,
    gcTime: 0,
  });
  const current = mine.data?.[0];
  const ready = Boolean(
    point &&
    consent &&
    now - acquiredAt < 10000 &&
    profile?.locationSharingEnabled,
  );
  const latest = useRef({ point, ready, current, active });
  latest.current = { point, ready, current, active };
  const [positionError, setPositionError] = useState<unknown>();
  useEffect(() => {
    if (
      !active ||
      !consent ||
      current?.role !== "requester" ||
      current.status !== "waiting"
    )
      return;
    let live = true,
      busy = false;
    const update = () => {
      const value = latest.current;
      if (
        busy ||
        !value.active ||
        !value.ready ||
        !value.point ||
        document.hidden ||
        value.current?.status !== "waiting"
      )
        return;
      busy = true;
      void realData
        .updatePosition(value.current.id, {
          origin: value.point,
          locationUseConsent: true,
        })
        .then(() => {
          if (live) setPositionError(undefined);
        })
        .catch((error) => {
          if (live) setPositionError(error);
        })
        .finally(() => {
          busy = false;
        });
    };
    update();
    const id = window.setInterval(update, 30000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [active, consent, current?.id, current?.role, current?.status]);
  async function refresh() {
    setMetConfirmed(false);
    await client.invalidateQueries({ queryKey: ["real-assistance"] });
    await client.invalidateQueries({ queryKey: ["nearby-real-assistance"] });
  }
  const create = useMutation({
    mutationFn: () =>
      realData.create({
        origin: point!,
        locationUseConsent: consent,
        locationSharingConsent: consent,
        supportType,
        aiUseConsent: aiConsent,
      }),
    onSuccess: refresh,
  });
  const search = useQuery({
    queryKey: ["nearby-real-assistance"],
    enabled:
      active &&
      helper &&
      ready &&
      Boolean(profile?.isAvailableToHelp) &&
      !current,
    queryFn: () =>
      realData.discover({ origin: point!, locationUseConsent: true }),
    refetchInterval: 5000,
    gcTime: 0,
    retry: false,
  });
  const candidates = ready && !current ? (search.data ?? []) : [];
  const searched = search.data !== undefined;
  const accept = useMutation({
    mutationFn: (id: string) =>
      realData.accept(id, {
        origin: point!,
        locationUseConsent: consent,
        locationSharingConsent: consent,
        aiUseConsent: aiConsent,
      }),
    onSuccess: refresh,
  });
  const directions = useMutation({
    mutationFn: async () => ({
      id: current!.id,
      route: await realData.directions(current!.id, {
        origin: point!,
        locationUseConsent: consent,
      }),
    }),
  });
  const ownRoute =
    consent && directions.data?.id === current?.id
      ? directions.data?.route
      : undefined;
  const progress = useMutation({
    mutationFn: async (action: "arrive" | "cancel" | "complete") => {
      // Arrival is a deliberate visual confirmation plus a fresh location reading,
      // not a claim that GPS alone proves that two people actually met.
      const live = useLocationSession.getState();
      if (
        action === "arrive" &&
        (!live.consent.services ||
          !live.consent.assistance ||
          !live.fix ||
          Date.now() - live.fix.timestamp > 10000)
      )
        throw new Error("新しいGPSが必要です。 / Fresh GPS required.");
      const origin = action === "arrive" ? live.fix : undefined;
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
      <LocationPreferences en={en} />
      <ErrorNotice error={mine.error} />
      <ErrorNotice error={consent ? positionError : undefined} />
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
              {current.decision && (
                <DecisionNotice value={current.decision} en={en} />
              )}
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
                  ? "Nearby public meeting candidates are checked with both walking approaches. With both consents, Gemini compares aggregate travel times; otherwise fixed rules select the point. It is not a verified entrance or a safest/shortest evacuation route."
                  : "周辺の公開候補について双方の通常徒歩経路を確認しています。双方が同意した場合はGeminiが匿名の所要時間で比較し、同意がない場合は固定ルールで選びます。入口や最短・安全な避難経路を保証するものではありません。"}
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
                  {active && ready && (
                    <TurnByTurnNavigator
                      route={ownRoute}
                      destination={current.meetingPoint}
                      en={en}
                      recalculate={(point) =>
                        realData.directions(current.id, {
                          origin: point,
                          locationUseConsent: true,
                        })
                      }
                    />
                  )}
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
                      ? "I have met the other person at this site. The confirmation uses fresh automatically updated GPS."
                      : "この地点で実際に相手と会えたことを確認しました。確認には自動更新した新しいGPSを使用します。"}
                  </label>
                  <IonButton
                    disabled={!metConfirmed || !ready || progress.isPending}
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
              <p role="status">
                {!ready
                  ? en
                    ? "Agree and acquire fresh GPS to start automatic updates."
                    : "GPS取得と同意後、自動で更新します。"
                  : search.isFetching && !searched
                    ? en
                      ? "Checking nearby requests…"
                      : "周辺の依頼を取得中…"
                    : en
                      ? "Automatically updates every 5 seconds. No page reload needed."
                      : "5秒ごとに自動更新中。ページの再読み込みは不要です。"}
              </p>
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
                    disabled={
                      !ready || accept.isPending || Boolean(search.error)
                    }
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
