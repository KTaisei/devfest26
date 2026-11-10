import { InfoDisclosure } from "./InfoDisclosure";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IonButton } from "@ionic/react";
import { RoadPreviewMap } from "./RoadPreviewMap";
import { useLocationSession } from "../stores/useLocationSession";
import {
  advance,
  prepareRoute,
  type Fix,
  type Point,
  type Progress,
} from "../navigation/progress";
import type { components } from "../types/api.generated";
type Route = components["schemas"]["RealRouteOutput"];

/** Both evacuation and meeting use this same foreground-only navigator. */
export function TurnByTurnNavigator({
  route,
  destination,
  en,
  recalculate,
}: {
  route: Route;
  destination: Point;
  en: boolean;
  recalculate: (origin: Point) => Promise<Route>;
}) {
  const consent = useLocationSession((s) => s.consent.services);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(route);
  const [fix, setFix] = useState<Fix>();
  const [progress, setProgress] = useState<Progress>();
  const [message, setMessage] = useState("");
  const [replanning, setReplanning] = useState(false);
  useEffect(() => {
    if (!consent) setRunning(false);
  }, [consent]);
  const callback = useRef(recalculate);
  callback.current = recalculate;
  const muteRef = useRef(muted);
  muteRef.current = muted;
  const speechAvailable =
    typeof window !== "undefined" && "speechSynthesis" in window;
  function speak(text: string) {
    if (!speechAvailable || muteRef.current) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = en ? "en-US" : "ja-JP";
    utterance.rate = 0.95;
    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") return;
      setMessage(
        en
          ? "Voice unavailable. Read the instruction on screen."
          : "音声を再生できません。画面の案内を確認してください。",
      );
    };
    window.speechSynthesis.speak(utterance);
  }
  useEffect(() => {
    if (muted && speechAvailable) window.speechSynthesis.cancel();
  }, [muted, speechAvailable]);
  useEffect(() => {
    if (!running) return;
    let live = true,
      dispose: (() => void) | undefined;
    let model = prepareRoute(route),
      actualRoute = route,
      travelled = 0,
      lastAt = Date.now();
    let lastFixAt = Date.now(),
      lastReplan = 0,
      offCount = 0,
      arriveCount = 0,
      busy = false;
    let announcement = "";
    let seenTimestamp = 0;
    setCurrentRoute(route);
    setProgress(undefined);
    setFix(undefined);
    setMessage("");
    function tell(key: string, text: string) {
      if (key !== announcement) {
        announcement = key;
        speak(text);
      }
    }
    const onFix = (value: Fix) => {
      if (!live || value.timestamp <= seenTimestamp) return;
      seenTimestamp = value.timestamp;
      const now = Date.now();
      const next = advance(
        model,
        value,
        travelled,
        Math.max(1, (now - lastAt) / 1000),
        now,
      );
      lastAt = now;
      lastFixAt = value.timestamp;
      setFix(value);
      setProgress(next);
      if (next.status === "poor_gps" || next.status === "stale") {
        offCount = 0;
        arriveCount = 0;
        tell(
          "gps",
          en
            ? "Waiting for a reliable GPS signal."
            : "GPSの精度を確認しています。案内を保留します。",
        );
        return;
      }
      setMessage("");
      if (next.status === "off_route") {
        arriveCount = 0;
        offCount++;
        tell(
          "off",
          en
            ? "You may be off route. Stop and check the map."
            : "経路から外れている可能性があります。立ち止まって地図を確認してください。",
        );
        if (offCount >= 3 && !busy && now - lastReplan >= 30000) {
          busy = true;
          lastReplan = now;
          setReplanning(true);
          void callback
            .current(value)
            .then((updated) => {
              if (!live) return;
              actualRoute = updated;
              model = prepareRoute(updated);
              travelled = 0;
              offCount = 0;
              announcement = "";
              setCurrentRoute(updated);
              setProgress(undefined);
              speak(
                en
                  ? "Route updated. Check your surroundings."
                  : "経路を更新しました。周囲の状況を確認してください。",
              );
            })
            .catch(() => {
              if (live)
                setMessage(
                  en
                    ? "Could not update route. Guidance is paused; retry after checking the map."
                    : "経路を更新できません。案内を保留しています。地図を確認し、再試行してください。",
                );
            })
            .finally(() => {
              busy = false;
              if (live) setReplanning(false);
            });
        }
        return;
      }
      offCount = 0;
      travelled = next.progress;
      if (next.status === "arrived") {
        if (++arriveCount >= 2) {
          tell(
            "arrived",
            en
              ? "Near the destination. Check the actual entrance. Meeting still requires both people to confirm."
              : "目的地の付近です。実際の入口を確認してください。合流の確認は双方で別途行ってください。",
          );
          setRunning(false);
        }
        return;
      }
      arriveCount = 0;
      const nextStep = actualRoute.steps[next.step + 1];
      const instruction =
        nextStep?.instruction ||
        (en ? "Continue to the destination" : "目的地へ進みます");
      const band =
        next.turnDistance <= 15
          ? "now"
          : next.turnDistance <= 50
            ? "near"
            : "far";
      if (band !== "far")
        tell(
          `${next.step}:${band}`,
          en
            ? `In ${Math.round(next.turnDistance)} meters, ${instruction}`
            : `およそ${Math.round(next.turnDistance)}メートル先、${instruction}`,
        );
      else
        tell(
          `${next.step}:far`,
          actualRoute.steps[next.step]?.instruction || instruction,
        );
    };
    // Subscribe to the app's sole watch; never create another native/browser watcher.
    dispose = useLocationSession.subscribe((state) => {
      if (!state.consent.services || state.error) {
        setRunning(false);
        return;
      }
      if (state.fix) onFix(state.fix);
    });
    const initial = useLocationSession.getState().fix;
    if (initial) onFix(initial);
    const timer = window.setInterval(() => {
      if (Date.now() - lastFixAt > 10000) {
        setProgress((p) => (p ? { ...p, status: "stale" } : p));
        announcement = "";
        arriveCount = 0;
        offCount = 0;
        if (speechAvailable) window.speechSynthesis.cancel();
        setMessage(
          en
            ? "GPS update delayed. Guidance paused."
            : "GPSの更新が遅れています。案内を保留しています。",
        );
      }
    }, 1000);
    const hidden = () => {
      if (document.hidden) {
        setMessage(
          en
            ? "Navigation stopped when the app went into the background. Restart to continue."
            : "画面が背景になったため案内を停止しました。再開する場合はもう一度開始してください。",
        );
        setRunning(false);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      live = false;
      dispose?.();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      if (speechAvailable) window.speechSynthesis.cancel();
    };
    // A session captures its route. Updated route geometry stays inside it;
    // parent rerenders must never create another GPS watcher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, route, en, consent]);
  const status = progress?.status;
  const instruction =
    progress && status === "tracking"
      ? `${Math.round(progress.turnDistance)}m · ${currentRoute.steps[progress.step + 1]?.instruction || (en ? "Destination ahead" : "この先に目的地")}`
      : status === "arrived"
        ? en
          ? "Near destination · verify entrance"
          : "目的地付近・入口を確認"
        : status === "off_route"
          ? en
            ? "Off route · stop and check"
            : "経路外の可能性・立ち止まって確認"
          : en
            ? "Waiting for reliable GPS…"
            : "GPSの更新・精度を確認中…";
  return (
    <section className="navigation-start">
      <h3>{en ? "In-app voice navigation" : "音声で道案内"}</h3>
      <p className="muted">
        {en
          ? "Foreground only · Ordinary walking route, safety unverified."
          : "表示中のみ案内 · 通常の徒歩経路・安全性は未確認"}
      </p>
      <InfoDisclosure title={en ? "Guidance details" : "案内について"}>
        <p>
          {en
            ? "Uses saved GPS/Google consent. Start enables browser voice. Navigation stops in the background; GPS resumes automatically when you return."
            : "保存したGPS・Google送信の同意を利用します。開始するとブラウザ音声を有効にします。背景では案内を停止し、戻るとGPS取得は自動再開します。"}
        </p>
        <p className="muted">
          {en
            ? "Training only. GPS/voice may be delayed. Ordinary walking routes do not verify disaster safety or accessibility."
            : "訓練・試験案内です。GPS・音声は遅れる場合があります。通常徒歩経路であり、被災状況や移動条件への対応は未確認です。"}
        </p>
      </InfoDisclosure>
      {!speechAvailable && (
        <p role="status">
          {en
            ? "Voice unavailable on this browser; visual guidance is available."
            : "このブラウザは音声未対応です。画面で案内します。"}
        </p>
      )}
      <IonButton
        disabled={!consent || running}
        onClick={() => {
          speak(
            en
              ? "Starting training navigation."
              : "訓練用の経路案内を開始します。",
          );
          setRunning(true);
        }}
      >
        {en ? "Start GPS & voice guidance" : "案内を開始"}
      </IonButton>
      {message && <p role="status">{message}</p>}
      {status === "arrived" && !running && <p role="status">{instruction}</p>}
      {running &&
        createPortal(
          <div
            className="turn-navigation"
            role="dialog"
            aria-label={en ? "Live navigation" : "リアルタイム経路案内"}
          >
            <RoadPreviewMap
              origin={fix}
              destination={destination}
              geometry={currentRoute.geometry}
              followPosition
              en={en}
            />
            <div className="turn-instruction">
              <small>
                {en
                  ? "TRAINING · safety unverified"
                  : "訓練・試験 / 安全性未確認"}
              </small>
              <h2 aria-live="polite">{instruction}</h2>
              <p>
                {progress
                  ? `${Math.round(progress.remaining)}m · ${Math.ceil(progress.remaining / currentRoute.walkingSpeedMetersPerSecond / 60)}${en ? " min remaining" : "分（目安）"}`
                  : ""}
                {fix ? ` · GPS ±${Math.round(fix.accuracy)}m` : ""}
              </p>
              {replanning && (
                <p role="status">{en ? "Recalculating…" : "経路を再計算中…"}</p>
              )}
              {message && <p role="alert">{message}</p>}
            </div>
            <div className="turn-controls">
              <IonButton onClick={() => setMuted(!muted)}>
                {muted ? (en ? "Unmute" : "音声オン") : en ? "Mute" : "消音"}
              </IonButton>
              <IonButton onClick={() => speak(instruction)}>
                {en ? "Repeat" : "もう一度案内"}
              </IonButton>
              <IonButton color="danger" onClick={() => setRunning(false)}>
                {en ? "Stop navigation" : "案内を終了"}
              </IonButton>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
