import { LocationPreferences } from "../components/LocationPreferences";
import { useEffect, useState } from "react";
import {
  IonButton,
  IonCheckbox,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonToggle,
} from "@ionic/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, ErrorNotice } from "../components/Layout";
import { api } from "../services/api";
import { useAppStore } from "../stores/useAppStore";
import {
  defaultProfile,
  type Profile,
  type SupportType,
} from "../types/domain";
import { supportLabel } from "./SupportPage";

export function ProfilePage() {
  const { language, setProfile, setLanguage } = useAppStore();
  const en = language === "en";
  const [draft, setDraft] = useState<Profile>(defaultProfile);
  const query = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<Profile | null>("/profile")).data,
  });
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: async () => (await api.put<Profile>("/profile", draft)).data,
    onSuccess: (profile) => {
      setProfile(profile);
      setLanguage(profile.preferredLanguage);
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });
  return (
    <Layout
      dataMode="real_preview"
      title={en ? "Your profile" : "プロフィール"}
      eyebrow="YOUR PREFERENCES"
    >
      <LocationPreferences en={en} />
      <div className="form-card">
        <p className="notice">
          {en
            ? "Real walking routes use language and a time estimate. Stair avoidance and wheelchair access are not verified."
            : "実道路の案内には言語と移動時間の目安を反映します。階段回避・車いす対応の経路検証は未対応です。"}
        </p>
        <h2>
          {en ? "Tell us what works for you." : "あなたに合った案内のために。"}
        </h2>
        <p>
          {en
            ? "No medical history or diagnosis is collected. Anonymous users are not identity-verified helpers."
            : "障害名や医療情報は収集しません。匿名認証では支援者の本人確認は行われません。"}
        </p>
        <ErrorNotice error={query.error} />
        <ErrorNotice error={save.error} />
        <IonInput
          label={en ? "Nickname" : "ニックネーム"}
          labelPlacement="stacked"
          fill="outline"
          maxlength={40}
          value={draft.displayName}
          onIonInput={(e) =>
            setDraft({ ...draft, displayName: e.detail.value || "" })
          }
        />
        <IonSelect
          label={en ? "Language" : "使用言語"}
          labelPlacement="stacked"
          value={draft.preferredLanguage}
          onIonChange={(e) =>
            setDraft({ ...draft, preferredLanguage: e.detail.value })
          }
        >
          <IonSelectOption value="ja">日本語</IonSelectOption>
          <IonSelectOption value="en">English</IonSelectOption>
        </IonSelect>
        <IonSelect
          label={en ? "Mobility" : "移動について"}
          labelPlacement="stacked"
          value={draft.mobilityType}
          onIonChange={(e) =>
            setDraft({ ...draft, mobilityType: e.detail.value })
          }
        >
          {[
            ["normal", en ? "Standard walking" : "通常の歩行"],
            ["slow_walk", en ? "Slower walking" : "ゆっくり歩く"],
            ["wheelchair", en ? "Wheelchair" : "車いす"],
            [
              "assistance_required",
              en ? "Assistance needed" : "移動に支援が必要",
            ],
          ].map(([value, label]) => (
            <IonSelectOption key={value} value={value}>
              {label}
            </IonSelectOption>
          ))}
        </IonSelect>
        <div className="field-row">
          <IonToggle
            checked={draft.avoidStairs}
            onIonChange={(e) =>
              setDraft({ ...draft, avoidStairs: e.detail.checked })
            }
          >
            {en ? "Avoid stairs" : "階段を避ける"}
          </IonToggle>
        </div>
        <h3>{en ? "Support you can offer" : "協力できること"}</h3>
        <div className="checkbox-grid">
          {(
            [
              "navigation",
              "translation",
              "information",
              "walking_companion",
            ] as SupportType[]
          ).map((type) => (
            <IonCheckbox
              key={type}
              checked={draft.supportCapabilities.includes(type)}
              onIonChange={(e) =>
                setDraft({
                  ...draft,
                  supportCapabilities: e.detail.checked
                    ? [...draft.supportCapabilities, type]
                    : draft.supportCapabilities.filter((t) => t !== type),
                })
              }
            >
              {supportLabel(type, en)}
            </IonCheckbox>
          ))}
        </div>
        <div className="field-row">
          <IonToggle
            checked={draft.isAvailableToHelp}
            onIonChange={(e) =>
              setDraft({ ...draft, isAvailableToHelp: e.detail.checked })
            }
          >
            {en ? "Available to help" : "支援に協力できる"}
          </IonToggle>
        </div>
        <div className="field-row">
          <IonToggle
            checked={draft.locationSharingEnabled}
            onIonChange={(e) =>
              setDraft({ ...draft, locationSharingEnabled: e.detail.checked })
            }
          >
            {en
              ? "Consent to location sharing"
              : "支援のための位置共有に同意する"}
          </IonToggle>
        </div>
        <p className="muted">
          {en
            ? "Locations expire after 30 minutes. Disabling sharing deletes your stored location. Cancel active requests before revoking consent."
            : "位置情報は30分で失効します。共有を無効にすると保存済み位置を削除します。有効な支援は先に取り消してください。"}
        </p>
        <IonButton
          onClick={() => save.mutate()}
          disabled={save.isPending || !draft.displayName.trim()}
        >
          {en ? "Save profile" : "プロフィールを保存"}
        </IonButton>
        {save.isSuccess && (
          <div className="success-notice" role="status">
            {en ? "Saved." : "保存しました。"}{" "}
            <IonButton fill="clear" routerLink="/home">
              {en ? "Open map" : "マップへ"}
            </IonButton>
          </div>
        )}
      </div>
    </Layout>
  );
}
