import { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { IonContent, IonIcon, IonPage } from "@ionic/react";
import {
  compassOutline,
  heartOutline,
  peopleOutline,
  personOutline,
  optionsOutline,
  informationCircleOutline,
  languageOutline,
  arrowForwardOutline,
  shieldCheckmarkOutline,
} from "ionicons/icons";
import { useAppStore } from "../stores/useAppStore";
import { errorMessage } from "../services/api";

export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div className="error-notice" role="alert">
      {errorMessage(error)}
    </div>
  ) : null;
}
export function Layout({
  children,
  title,
  eyebrow,
  dataMode = "simulation",
  mapMode = false,
}: {
  children: ReactNode;
  title: string;
  eyebrow?: string;
  dataMode?: "simulation" | "real_preview";
  mapMode?: boolean;
}) {
  const { language, setLanguage } = useAppStore();
  const en = language === "en";
  const pathname = useLocation().pathname;
  const training = pathname.startsWith("/simulation") || pathname === "/admin";
  const links = [
    {
      to: training ? "/simulation" : "/home",
      label: en ? "Evacuation map" : "避難マップ",
      mobileLabel: en ? "Map" : "マップ",
      icon: compassOutline,
    },
    {
      to: training ? "/simulation-support" : "/support",
      label: en ? "Request support" : "支援を求める",
      mobileLabel: en ? "Request" : "支援依頼",
      icon: heartOutline,
    },
    {
      to: training ? "/simulation-helper" : "/helper",
      label: en ? "Offer support" : "支援に協力する",
      mobileLabel: en ? "Help" : "支援協力",
      icon: peopleOutline,
    },
    {
      to: "/profile",
      label: en ? "Your profile" : "プロフィール",
      mobileLabel: en ? "Profile" : "プロフィール",
      icon: personOutline,
    },
  ];
  return (
    <IonPage>
      <IonContent>
        <div className={`app-shell ${mapMode ? "map-shell" : ""}`}>
          <aside className="sidebar">
            <NavLink className="brand" to="/home">
              <span className="brand-symbol">
                T<span>●</span>
              </span>
              <span>
                TASUKU<small>EVACUATION & COMMUNITY</small>
              </span>
            </NavLink>
            <div className="workspace-label">
              {en ? "YOUR SAFETY COMPANION" : "あなたの避難に、つながりを。"}
            </div>
            <nav aria-label="Main navigation">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} activeClassName="active">
                  <IonIcon icon={l.icon} />
                  <span>{l.label}</span>
                  <IonIcon className="nav-arrow" icon={arrowForwardOutline} />
                </NavLink>
              ))}
            </nav>
            <div className="sidebar-note">
              <IonIcon icon={shieldCheckmarkOutline} />
              <strong>
                {en ? "Your evacuation comes first" : "まずは、自分の避難を。"}
              </strong>
              <p>
                {en
                  ? "Helping starts with your own safety. Keep moving while waiting for support."
                  : "支援を待つ間も、避難を続けてください。無理のない範囲でつながりましょう。"}
              </p>
            </div>
            <NavLink className="admin-link" to="/welcome">
              <IonIcon icon={informationCircleOutline} />
              {en ? "How TASUKU works" : "使い方・はじめに"}
            </NavLink>
            <NavLink className="admin-link" to="/admin">
              <IonIcon icon={optionsOutline} />
              {en ? "Simulation settings" : "デモ管理"}
            </NavLink>
            <div className="sidebar-footer">
              DEVFEST 2026 <span>PROTOTYPE v0.1</span>
            </div>
          </aside>
          <main className="main-area">
            <header className="topbar">
              <span className="breadcrumb">
                TASUKU <span className="breadcrumb-page">/ {title}</span>
              </span>
              <div className="topbar-actions">
                <NavLink className="language-button guide-link" to="/welcome">
                  <IonIcon icon={informationCircleOutline} />
                  {en ? "Guide" : "使い方"}
                </NavLink>
                <button
                  className="language-button"
                  onClick={() => setLanguage(en ? "ja" : "en")}
                >
                  <IonIcon icon={languageOutline} />
                  {en ? "日本語" : "English"}
                </button>
              </div>
            </header>
            <div className="simulation-label">
              <span className="status-dot" />
              {dataMode === "real_preview"
                ? en
                  ? "TRAINING · Real data trial · Not for real evacuation."
                  : "訓練・実データ試験 / 実際の避難には使用できません。"
                : en
                  ? "SIMULATION · All places and roads are fictional. Not for real evacuation."
                  : "訓練・シミュレーション中 · 避難場所・道路は架空です。実際の避難には使用できません。"}
            </div>
            <div className="page-body">
              <div className="page-heading">
                <div>
                  {eyebrow && <span className="eyebrow">{eyebrow}</span>}
                  <h1>{title}</h1>
                </div>
                <span className="area-tag">
                  {dataMode === "real_preview"
                    ? en
                      ? "Real data trial"
                      : "実データ接続・試験版"
                    : en
                      ? "Fukuyama demo area"
                      : "福山駅周辺・模擬エリア"}
                </span>
              </div>
              {children}
            </div>
          </main>
          <nav className="mobile-nav" aria-label="Mobile navigation">
            {links.map((l) => (
              <NavLink
                to={l.to}
                key={l.to}
                activeClassName="active"
                isActive={(_, location) =>
                  location.pathname === l.to ||
                  (l.to === "/home" && location.pathname === "/navigation") ||
                  (l.to === "/simulation-support" &&
                    location.pathname === "/simulation-matching")
                }
              >
                <IonIcon icon={l.icon} />
                <span>{l.mobileLabel}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </IonContent>
    </IonPage>
  );
}
