import { IonButton } from "@ionic/react";
import { useMutation } from "@tanstack/react-query";
import { Layout, ErrorNotice } from "../components/Layout";
import { MatchCards } from "./MatchingPage";
import { useAppStore } from "../stores/useAppStore";
import { api } from "../services/api";
import { supportLabel } from "./SupportPage";

export function HelperPage() {
  const { language, profile, location, locationLabel } = useAppStore();
  const en = language === "en";
  const update = useMutation({
    mutationFn: () => api.put("/location", location),
  });
  return (
    <Layout
      title={en ? "Offer support" : "支援に協力する"}
      eyebrow="A LITTLE HELP GOES A LONG WAY"
    >
      <div className="notice">
        {en
          ? "Your own evacuation comes first. You may stop helping at any time."
          : "自分の避難を最優先にしてください。安全上の理由で、いつでも支援を中止できます。"}
      </div>
      <div className="form-card">
        <h2>{en ? "Your availability" : "あなたの支援設定"}</h2>
        <p>
          {profile?.isAvailableToHelp
            ? en
              ? "Available to help"
              : "支援に協力できる状態です"
            : en
              ? "Not available"
              : "現在は支援受付を停止しています"}
        </p>
        <p>
          {profile?.supportCapabilities
            .map((t) => supportLabel(t, en))
            .join(" / ") ||
            (en ? "No capabilities registered" : "支援内容が未登録です")}
        </p>
        <p className="muted">
          {en ? "Location" : "現在の出発点"}: {locationLabel}
        </p>
        <IonButton routerLink="/profile" fill="outline">
          {en ? "Edit profile" : "プロフィールで変更"}
        </IonButton>
        <IonButton
          disabled={
            !profile?.locationSharingEnabled ||
            !profile?.isAvailableToHelp ||
            update.isPending
          }
          onClick={() => update.mutate()}
        >
          {en
            ? "Share selected location (30 min)"
            : "選択中の位置を共有する（30分）"}
        </IonButton>
        <ErrorNotice error={update.error} />
        {update.isSuccess && (
          <p role="status">
            {en ? "Location updated." : "位置情報を更新しました。"}
          </p>
        )}
        <p className="muted">
          {en
            ? "Only requests meeting capability, route and evacuation constraints will be offered. Open a second browser tab to simulate another participant."
            : "支援能力・道路・避難条件を満たす依頼だけが届きます。別タブを開くと別の利用者としてデモできます。"}
        </p>
      </div>
      <h2>{en ? "Requests for you" : "あなたへの支援依頼"}</h2>
      <MatchCards helper />
    </Layout>
  );
}
