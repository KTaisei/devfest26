import { Link } from "react-router-dom";
import { useLocationSession } from "../stores/useLocationSession";

/** Read-only on task screens. All consent changes belong to ProfilePage. */
export function LocationStatus({
  en = false,
  assistance = false,
  profileReady = true,
}: {
  en?: boolean;
  assistance?: boolean;
  profileReady?: boolean;
}) {
  const { consent, fix, error } = useLocationSession();
  const needsSetup =
    !consent.services || (assistance && (!consent.assistance || !profileReady));
  const needsAttention = needsSetup || Boolean(error);
  const label = needsSetup
    ? en
      ? consent.services
        ? profileReady
          ? "Enable nearby support in Profile"
          : "Set up your support profile"
        : "Set up location to continue"
      : consent.services
        ? profileReady
          ? "支援の利用設定が必要です"
          : "支援のプロフィールを設定してください"
        : "現在地の利用設定が必要です"
    : error
      ? en
        ? "Check GPS permission"
        : "GPSの許可・受信状態を確認"
      : fix
        ? en
          ? "Live location"
          : "現在地を自動更新中"
        : en
          ? "Locating…"
          : "現在地を取得中…";
  return (
    <div
      className={`location-status ${needsAttention ? "needs-attention" : ""}`}
    >
      <span className="location-signal" aria-hidden="true" />
      <div>
        <strong role="status">{label}</strong>
        {!needsAttention && fix && <small>±{Math.round(fix.accuracy)}m</small>}
      </div>
      {needsAttention && (
        <Link to="/profile">{en ? "Profile →" : "プロフィールへ →"}</Link>
      )}
    </div>
  );
}
