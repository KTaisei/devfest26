import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export async function getCurrentLocation() {
  // Web uses the browser API directly. A delayed Capacitor web-chunk import
  // could point to a removed asset after a deployment in a long-lived tab.
  const position = Capacitor.isNativePlatform()
    ? await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      })
    : await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(
            new Error(
              "このブラウザでは現在地を取得できません。 / Geolocation unavailable.",
            ),
          );
          return;
        }
        navigator.geolocation.getCurrentPosition(
          resolve,
          (error) =>
            reject(
              new Error(
                error.code === 1
                  ? "位置情報の許可が必要です。ブラウザのサイト設定を確認してください。 / Location permission required."
                  : error.code === 3
                    ? "現在地の取得が時間切れになりました。再度試してください。 / Location request timed out."
                    : "現在地を取得できません。端末の位置情報設定を確認してください。 / Location unavailable.",
              ),
            ),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
      });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

/** A watch belongs to the app-wide, consented foreground location session. */
export async function watchLocation(
  onFix: (fix: import("../navigation/progress").Fix) => void,
  onError: (message: string) => void,
): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    const id = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      (position, error) => {
        if (error || !position)
          onError("GPSを更新できません。 / GPS update unavailable.");
        else
          onFix({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          });
      },
    );
    return () => {
      void Geolocation.clearWatch({ id });
    };
  }
  if (!navigator.geolocation) throw new Error("Geolocation unavailable");
  const id = navigator.geolocation.watchPosition(
    (position) =>
      onFix({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      }),
    () =>
      onError(
        "GPSの許可・受信状態を確認してください。 / Check GPS permission and reception.",
      ),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
