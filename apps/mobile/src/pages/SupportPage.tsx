import { useState } from "react";
import {
  IonButton,
  IonCheckbox,
  IonSelect,
  IonSelectOption,
  IonTextarea,
} from "@ionic/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useHistory } from "react-router-dom";
import { Layout, ErrorNotice } from "../components/Layout";
import { api } from "../services/api";
import { useAppStore } from "../stores/useAppStore";
import { useConstraints, useRequests } from "../features/useSimulation";
import type { SupportRequest, SupportType } from "../types/domain";

export const supportLabel = (type: SupportType, en: boolean) =>
  ({
    navigation: en ? "Directions" : "道案内",
    translation: en ? "Translation" : "通訳",
    information: en ? "Information" : "情報の確認",
    walking_companion: en ? "Walking companion" : "徒歩での同行",
  })[type];
export function SupportPage() {
  const { language, location, locationLabel, disasterType, profile } =
    useAppStore();
  const en = language === "en";
  const [type, setType] = useState<SupportType>("navigation"),
    [message, setMessage] = useState(""),
    [consent, setConsent] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const history = useHistory(),
    client = useQueryClient(),
    constraints = useConstraints(),
    requests = useRequests();
  const create = useMutation({
    mutationFn: async () => {
      const request = (
        await api.post<SupportRequest>("/support-requests", {
          supportType: type,
          language,
          message,
          locationSharingConsent: consent,
          origin: location,
          disasterType,
          mobilityConstraints: constraints,
        })
      ).data;
      return request;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["requests"] });
      history.push("/matching");
    },
  });
  return (
    <Layout
      title={en ? "Request support" : "支援を求める"}
      eyebrow="YOU ARE NOT ALONE"
    >
      <div className="form-card">
        <h2>
          {en ? "What would help right now?" : "どんなお手伝いが必要ですか？"}
        </h2>
        <p>
          {en
            ? "Keep evacuating while waiting for support."
            : "支援が見つかるまで待たず、自分の避難を優先してください。"}
        </p>
        <div className="notice">
          {en
            ? "For urgent rescue or medical emergencies in Japan, call 119."
            : "けが・救助など緊急の場合は、一般支援より119番への通報を優先してください。"}{" "}
          <a href="tel:119">119</a>
        </div>
        {!profile && (
          <IonButton routerLink="/profile">
            {en ? "Set up profile first" : "先にプロフィールを登録"}
          </IonButton>
        )}
        <IonSelect
          label={en ? "Support needed" : "必要な支援"}
          labelPlacement="stacked"
          value={type}
          onIonChange={(e) => {
            setType(e.detail.value);
            setConfirmed(false);
          }}
        >
          {(
            [
              "navigation",
              "translation",
              "information",
              "walking_companion",
            ] as SupportType[]
          ).map((t) => (
            <IonSelectOption key={t} value={t}>
              {supportLabel(t, en)}
            </IonSelectOption>
          ))}
        </IonSelect>
        <IonTextarea
          label={en ? "Message (optional)" : "補足メッセージ（任意）"}
          labelPlacement="stacked"
          fill="outline"
          maxlength={300}
          rows={3}
          value={message}
          onIonInput={(e) => {
            setMessage(e.detail.value || "");
            setConfirmed(false);
          }}
        />
        <p className="muted">
          {en ? "Start point" : "出発点"}: {locationLabel}{" "}
          <a href="/home">{en ? "Change" : "変更"}</a>
        </p>
        <IonCheckbox
          checked={consent}
          onIonChange={(e) => {
            setConsent(e.detail.checked);
            setConfirmed(false);
          }}
        >
          {en
            ? "Share my location for matching"
            : "マッチングのための位置共有に同意します"}
        </IonCheckbox>
        {confirmed && (
          <div className="notice">
            <strong>{en ? "Review request" : "送信内容の確認"}</strong>
            <p>
              {supportLabel(type, en)} · {locationLabel} ·{" "}
              {language.toUpperCase()}
            </p>
            <p>{message || (en ? "No message" : "補足なし")}</p>
            <p>
              {en
                ? "Location is shared with the server for matching."
                : "位置情報をサーバーへ送信し、支援候補の探索に利用します。"}
            </p>
          </div>
        )}
        <div className="form-actions">
          <IonButton
            disabled={
              !profile?.locationSharingEnabled || !consent || create.isPending
            }
            onClick={() => (confirmed ? create.mutate() : setConfirmed(true))}
          >
            {confirmed
              ? en
                ? "Send request"
                : "この内容で依頼する"
              : en
                ? "Review request"
                : "内容を確認する"}
          </IonButton>
          <IonButton fill="outline" routerLink="/matching">
            {en ? "My requests" : "依頼の状況を見る"}
          </IonButton>
        </div>
        {!profile?.locationSharingEnabled && (
          <p className="muted">
            {en
              ? "Enable sharing in your profile to request support."
              : "プロフィールで位置共有を有効にしてください。"}
          </p>
        )}
        <ErrorNotice error={create.error} />
        <ErrorNotice error={requests.error} />
      </div>
    </Layout>
  );
}
