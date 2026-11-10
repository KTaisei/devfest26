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
  const [consent, setConsent] = useState(false),
    [shaking, setShaking] = useState(false),
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
          ? "Report what you can actually observe. AI does not determine safety or issue evacuation instructions."
          : "自分で確認できた状況を選んでください。AIによる安全判定や避難指示ではありません。"}
      </p>
      <label>
        <input
          type="checkbox"
          checked={shaking}
          onChange={(e) => setShaking(e.target.checked)}
        />
        {en ? "Shaking now" : "現在、揺れを感じる"}
      </label>
      <label>
        <input
          type="checkbox"
          checked={blocked}
          onChange={(e) => setBlocked(e.target.checked)}
        />
        {en ? "Obstruction observed" : "通行障害を確認した"}
      </label>
      <label className="navigation-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {en
          ? "I agree to send these reported conditions, local notice availability/count, and assistance status to Gemini through TASUKU. No GPS coordinates or identity are sent to Gemini."
          : "申告内容・地域の地震情報の取得状態と件数・自分の支援進行状態をTASUKU経由でGeminiへ送ることに同意します。GeminiへGPS座標・個人の識別情報は送りません。"}
      </label>
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
      {advice.data?.signature === signature && (
        <DecisionNotice value={advice.data.value} en={en} />
      )}
    </details>
  );
}
