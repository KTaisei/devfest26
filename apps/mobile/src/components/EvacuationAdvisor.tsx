import { Link } from "react-router-dom";
import { useLocationSession } from "../stores/useLocationSession";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { IonButton } from "@ionic/react";
import { realData } from "../services/realData";
import { DecisionNotice } from "./DecisionNotice";
import { ErrorNotice } from "./Layout";
import type { Location } from "../types/domain";
export function EvacuationAdvisor({
  origin,
  en,
}: {
  origin: Location;
  en: boolean;
}) {
  const consent = useLocationSession((s) => s.consent.ai);
  const [shaking, setShaking] = useState(false),
    [blocked, setBlocked] = useState(false);
  const signature = JSON.stringify({ origin, shaking, blocked });
  const advice = useMutation({
    mutationFn: async () => ({
      signature,
      value: await realData.advice({
        origin,
        locationUseConsent: true,
        aiUseConsent: consent,
        shaking,
        blocked,
      }),
    }),
  });
  return (
    <details className="evacuation-advisor">
      <summary>
        {en ? "Gemini situation review" : "Geminiで状況を整理する"}
      </summary>
      <p>
        {en
          ? "Select what you observe. AI does not assess safety."
          : "確認できた状況を選択。AIは安全性を判定しません。"}
      </p>
      <div className="observation-choices">
        <button aria-pressed={shaking} onClick={() => setShaking(!shaking)}>
          {en ? "Shaking now" : "揺れを感じる"}
        </button>
        <button aria-pressed={blocked} onClick={() => setBlocked(!blocked)}>
          {en ? "Obstruction" : "通行障害がある"}
        </button>
      </div>
      {!consent && (
        <p>
          <Link to="/profile">
            {en
              ? "Enable Gemini in Profile →"
              : "プロフィールでGeminiを有効にする →"}
          </Link>
        </p>
      )}
      <IonButton
        disabled={!consent || advice.isPending}
        onClick={() => advice.mutate()}
      >
        {advice.isPending
          ? en
            ? "Reviewing…"
            : "整理中…"
          : en
            ? "Review next checks"
            : "次に確認することを整理"}
      </IonButton>
      <ErrorNotice error={advice.error} />
      {consent && advice.data?.signature === signature && (
        <DecisionNotice value={advice.data.value} en={en} />
      )}
    </details>
  );
}
