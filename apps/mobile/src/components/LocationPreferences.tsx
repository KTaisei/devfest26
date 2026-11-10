import { useEffect, useState } from "react";
import { IonButton } from "@ionic/react";
import { useLocationSession } from "../stores/useLocationSession";
export function LocationPreferences({ en = false }: { en?: boolean }) {
  const { consent, setConsent, fix, error, storageFailed, retryGPS } =
    useLocationSession();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <section
      className="form-card location-preferences"
      aria-label={en ? "Location and consent settings" : "現在地・同意の設定"}
    >
      <h2>
        {en ? "Automatic GPS & saved consent" : "GPSの自動取得・同意設定"}
      </h2>
      <p>
        {en
          ? "Preferences are saved in this browser. GPS updates automatically while the app is visible and resumes when you return. Closing or locking the app stops updates. Browser permission may be requested again by your OS. Revoke here anytime."
          : "同意をこのブラウザに保存します。アプリ表示中はGPSを自動更新し、戻ると自動で再開します。閉じた時・画面ロック中の取得はできません。端末側の許可は再確認される場合があります。ここでいつでも撤回できます。"}
      </p>
      <label className="navigation-consent">
        <input
          type="checkbox"
          checked={consent.services}
          onChange={(e) => setConsent("services", e.target.checked)}
        />
        {en
          ? "Allow continuous GPS and sending my location/destination to TASUKU, Google (maps, walking routes, comparisons and rerouting), and GSI (area and site lookup). GPS is kept in memory only; no other user receives it."
          : "GPSの継続取得と、現在地・目的地をTASUKU・Google（地図、徒歩経路、候補比較、再計算）・国土地理院（地域・避難場所照会）へ送信することに同意します。GPSは端末内ではメモリだけに保持し、他の利用者へ渡しません。"}
      </label>
      <label className="navigation-consent">
        <input
          type="checkbox"
          checked={consent.ai}
          onChange={(e) => setConsent("ai", e.target.checked)}
        />
        {en
          ? "Allow Gemini to receive reported conditions, notice availability/count, my assistance status and anonymous aggregate walking times. No GPS or identity is sent to Gemini. AI does not assess safety. Both parties must agree for meeting selection. Revocation applies to future actions; cancel a waiting request to revoke the consent already saved with it."
          : "申告状況・地震情報の取得状態と件数・自分の支援状態・匿名の合計／最長徒歩時間をGeminiへ送信することに同意します。GeminiへGPS座標や識別情報は送りません。AIは安全性を判定しません。合流候補の比較には双方の同意が必要です。撤回は今後の操作に適用し、受付中の依頼の同意を取り消す場合は支援を中止してください。"}
      </label>
      <label className="navigation-consent">
        <input
          type="checkbox"
          checked={consent.assistance}
          onChange={(e) => setConsent("assistance", e.target.checked)}
        />
        {en
          ? "Allow GPS for support discovery/matching and Google approaches. After I request support, TASUKU stores my position privately for up to 30 minutes, updating while waiting. Request/accept and profile sharing remain my choices."
          : "GPSによる支援検索・マッチングとGoogleでの合流経路計算に同意します。自分で支援を依頼した後はTASUKUが位置を最大30分非公開で保持し、受付中は更新します。依頼・承諾・プロフィールの位置共有は別途自分で選びます。"}
      </label>
      <p role="status">
        {!consent.services
          ? en
            ? "GPS is off. Enable above once to start automatically."
            : "GPSは停止中です。上の同意を一度有効にすると自動取得が始まります。"
          : error ||
            (!fix
              ? en
                ? "Waiting for GPS…"
                : "GPSを受信しています…"
              : now - fix.timestamp > 10000
                ? en
                  ? "GPS update delayed. Old position is not live."
                  : "GPS更新が遅れています。最後の位置は現在地として保証できません。"
                : `${en ? "GPS auto-updating" : "GPS自動更新中"} · ±${Math.round(fix.accuracy)}m · ${new Date(fix.timestamp).toLocaleTimeString()}`)}
      </p>
      {error && consent.services && (
        <IonButton size="small" onClick={retryGPS}>
          {en
            ? "Retry after checking site permission"
            : "サイトの位置許可を確認して再試行"}
        </IonButton>
      )}
      {storageFailed && (
        <p role="alert">
          {en
            ? "Storage unavailable. Consent lasts only for this session."
            : "設定を保存できません。この起動中だけ同意が有効です。"}
        </p>
      )}
    </section>
  );
}
