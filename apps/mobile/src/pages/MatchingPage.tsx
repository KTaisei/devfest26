import { useEffect, useState } from "react";
import { IonButton } from "@ionic/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, ErrorNotice } from "../components/Layout";
import {
  useMatches,
  useRequests,
  useMatchAction,
} from "../features/useSimulation";
import { useAppStore } from "../stores/useAppStore";
import { getSession } from "../services/auth";
import { api } from "../services/api";
import { supportLabel } from "./SupportPage";
import type { Match, MatchStatus } from "../types/domain";

const statusLabel = (status: MatchStatus, en: boolean) =>
  en
    ? status
    : {
        waiting: "候補を探しています",
        offered: "支援者に依頼中",
        accepted: "支援者が承諾しました",
        meeting: "合流中",
        assisting: "支援中",
        completed: "支援が完了しました",
        rejected: "支援者が辞退しました",
        cancelled: "取り消しました",
        expired: "有効期限切れ",
      }[status];
export function MatchCards({ helper = false }: { helper?: boolean }) {
  const matches = useMatches(),
    action = useMatchAction(),
    session = useQuery({ queryKey: ["identity"], queryFn: getSession });
  const en = useAppStore((s) => s.language) === "en";
  const items = matches.data?.filter((m) =>
    helper
      ? m.helperId === session.data?.uid
      : m.requesterId === session.data?.uid,
  );
  // Countdown is advisory; only the server may confirm expiry, including clock skew.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <ErrorNotice error={matches.error} />
      <ErrorNotice error={action.error} />
      {items?.map((m) => (
        <article className="match-card" key={m.id}>
          <span className={`match-status ${m.status}`}>
            {statusLabel(m.status, en)}
          </span>
          <h3>{helper ? m.requesterName : m.helperName}</h3>
          <p>
            {supportLabel(m.supportType, en)} · {en ? "Approx." : "到着目安"}{" "}
            {Math.ceil(m.estimatedSeconds / 60)} {en ? "min" : "分"}
          </p>
          {m.meetingPoint &&
            ["accepted", "meeting", "assisting", "completed"].includes(
              m.status,
            ) && (
              <div className="notice">
                <strong>
                  {en ? "Fictional meeting point" : "模擬合流地点"}
                </strong>
                ：
                {m.meetingPoint.name ??
                  `${en ? "Node" : "地点"} ${m.meetingPoint.nodeId}`}
                <span className="muted">
                  {" "}
                  ({en ? "helper" : "支援者"} {en ? "approx." : "約"}
                  {Math.ceil(m.meetingPoint.helperSeconds / 60)}
                  {en ? " min" : "分"} · {en ? "requester" : "依頼者"}{" "}
                  {en ? "approx." : "約"}
                  {Math.ceil(m.meetingPoint.requesterSeconds / 60)}
                  {en ? " min" : "分"})
                </span>
                <p className="muted">
                  {en
                    ? "Calculated when accepted using fictional roads. If conditions change, cancel and request again. Do not use for real evacuation."
                    : "承諾時の架空道路で計算した地点です。道路条件が変わった場合は中止して再依頼してください。実際の避難には使えません。"}
                </p>
              </div>
            )}
          <p className="muted">
            {en
              ? "Anonymous participant · identity not verified"
              : "匿名ユーザー・本人確認は行われていません"}
          </p>
          {m.status === "offered" && m.expiresAt && (
            <p className="muted">
              {en ? "Accept by" : "承諾期限"}{" "}
              {new Date(m.expiresAt).toLocaleTimeString()}
              {" · "}
              {Math.max(
                0,
                Math.ceil((Date.parse(m.expiresAt) - nowMs) / 1000),
              ) > 0
                ? en
                  ? `${Math.ceil((Date.parse(m.expiresAt) - nowMs) / 1000)} seconds remaining`
                  : `あと${Math.ceil((Date.parse(m.expiresAt) - nowMs) / 1000)}秒`
                : en
                  ? "Checking server status…"
                  : "サーバーの状態を確認中…"}
            </p>
          )}
          {m.status === "expired" && (
            <div className="notice">
              {helper
                ? en
                  ? "This offer expired. It can no longer be accepted."
                  : "承諾期限が過ぎたため、この依頼は承諾できません。"
                : en
                  ? "No response before the deadline. Find another helper from your request. Keep evacuating while waiting."
                  : "期限までに応答がありませんでした。依頼から別の候補を探せます。待つ間も避難を優先してください。"}
            </div>
          )}
          <div className="form-actions">
            {helper && m.status === "offered" && (
              <>
                <IonButton
                  disabled={action.isPending}
                  onClick={() => action.mutate({ id: m.id, action: "accept" })}
                >
                  {en ? "Agree and accept" : "同意して承諾"}
                </IonButton>
                <IonButton
                  fill="outline"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ id: m.id, action: "reject" })}
                >
                  {en ? "Decline" : "辞退する"}
                </IonButton>
              </>
            )}
            {m.status === "accepted" && (
              <IonButton
                disabled={action.isPending}
                onClick={() => action.mutate({ id: m.id, action: "meeting" })}
              >
                {en ? "Start meeting" : "合流へ進む"}
              </IonButton>
            )}
            {m.status === "meeting" && (
              <IonButton
                disabled={action.isPending}
                onClick={() => action.mutate({ id: m.id, action: "assisting" })}
              >
                {en ? "Met, start helping" : "合流した・支援開始"}
              </IonButton>
            )}
            {m.status === "assisting" && (
              <IonButton
                disabled={action.isPending}
                onClick={() => action.mutate({ id: m.id, action: "complete" })}
              >
                {en ? "Complete" : "支援を完了"}
              </IonButton>
            )}
            {["offered", "accepted", "meeting", "assisting"].includes(
              m.status,
            ) && (
              <IonButton
                fill="clear"
                color="danger"
                disabled={action.isPending}
                onClick={() => action.mutate({ id: m.id, action: "cancel" })}
              >
                {en ? "Stop assistance" : "支援を中止"}
              </IonButton>
            )}
          </div>
          <small>
            {en ? "Updated" : "更新"}{" "}
            {new Date(m.updatedAt).toLocaleTimeString()}
          </small>
        </article>
      ))}
      {items?.length === 0 && (
        <div className="empty-state">
          {en ? "No matching activity yet." : "まだマッチングはありません。"}
        </div>
      )}
    </>
  );
}
export function MatchingPage() {
  const en = useAppStore((s) => s.language) === "en",
    requests = useRequests(),
    matches = useMatches(),
    client = useQueryClient();
  const recommend = useMutation({
    mutationFn: async (id: string) =>
      (await api.post<Match[]>("/matches/recommend", { requestId: id })).data,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["matches"] });
      void client.invalidateQueries({ queryKey: ["requests"] });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/support-requests/${id}/cancel`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["requests"] });
      void client.invalidateQueries({ queryKey: ["matches"] });
    },
  });
  return (
    <Layout
      title={en ? "Your support requests" : "支援の状況"}
      eyebrow="CONNECTED, AT YOUR PACE"
    >
      <p className="intro">
        {en
          ? "Updates every 3 seconds. Continue your evacuation."
          : "3秒ごとに状況を更新します。待つ間も、避難を優先してください。"}
      </p>
      <div className="two-columns">
        <section>
          <h2>{en ? "Your requests" : "あなたの依頼"}</h2>
          <ErrorNotice error={requests.error} />
          <ErrorNotice error={recommend.error} />
          <ErrorNotice error={cancel.error} />
          {requests.data?.map((r) => (
            <div className="match-card" key={r.id}>
              <h3>{supportLabel(r.supportType, en)}</h3>
              <p>{statusLabel(r.status, en)}</p>
              {r.status === "waiting" && (
                <IonButton
                  disabled={recommend.isPending}
                  onClick={() => recommend.mutate(r.id)}
                >
                  {matches.data?.some(
                    (m) => m.requestId === r.id && m.status === "expired",
                  )
                    ? en
                      ? "Find another helper"
                      : "別の候補を探す"
                    : en
                      ? "Find a helper"
                      : "候補を探す"}
                </IonButton>
              )}
              {[
                "waiting",
                "offered",
                "accepted",
                "meeting",
                "assisting",
              ].includes(r.status) && (
                <IonButton
                  fill="clear"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(r.id)}
                >
                  {en ? "Cancel request" : "依頼を取り消す"}
                </IonButton>
              )}
            </div>
          ))}
          {requests.data?.length === 0 && (
            <p>{en ? "No requests yet." : "依頼はまだありません。"}</p>
          )}
          {recommend.isSuccess && recommend.data.length === 0 && (
            <div className="notice">
              {en
                ? "No eligible helper is currently available. Continue evacuating and try again later."
                : "条件に合う支援者が見つかりません。避難を続けながら、改めて確認してください。"}
            </div>
          )}
          <IonButton fill="outline" routerLink="/support">
            {en ? "New request" : "新しく依頼する"}
          </IonButton>
        </section>
        <section>
          <h2>{en ? "Matches" : "マッチング"}</h2>
          <MatchCards />
        </section>
      </div>
    </Layout>
  );
}
