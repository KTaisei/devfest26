import { IonButton } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { Layout } from "../components/Layout";
import { markOnboardingSeen } from "../services/onboarding";
import { useAppStore } from "../stores/useAppStore";

const sections = [
  {
    ja: {
      title: "TASUKUとは",
      body: "「知らない街でも、ひとりにしない。」実GPS・実道路・公開避難場所・P2P地震情報を使い、近くの人との助け合いを試すアプリです。言語と時間目安を調整できますが、階段回避・車いす対応の経路は未検証です。",
    },
    en: {
      title: "What is TASUKU?",
      body: "“Never alone, even in an unfamiliar city.” TASUKU uses actual GPS, roads, public earthquake sites and P2PQuake information to trial nearby assistance. Language and time estimates adapt to your profile; stair avoidance and wheelchair routes are unverified.",
    },
  },
  {
    ja: {
      title: "これは訓練です",
      body: "通常画面は実データを使う試験版です。道路の被災・避難場所の開設・入口・移動条件への適合・警報の配信品質は未確認です。安全な避難経路としては使用できません。旧架空データの訓練は別画面です。",
    },
    en: {
      title: "This is a drill",
      body: "The main screens trial real data. Road damage, site opening, entrances, accessibility and alert delivery are unverified. Do not treat these routes as verified safe evacuation guidance. The earlier fictional simulation is separate.",
    },
  },
  {
    ja: {
      title: "位置情報について",
      body: "位置の共有は任意で、あなたが明示的に同意したときだけ行われます。共有した位置は30分でマッチングに使えなくなり、期限切れデータを順次削除します。当事者の正確な現在地は他の参加者に表示せず、承諾後は選ばれた実在する公開合流地点を両者に共有します。",
    },
    en: {
      title: "About your location",
      body: "Location sharing is optional and happens only with your explicit consent. A shared location becomes unavailable for matching after 30 minutes, then expired data is deleted asynchronously. Your exact current position is not shown to other participants. Once accepted, both participants see the selected real public meeting point.",
    },
  },
  {
    ja: {
      title: "はじめにプロフィールを",
      body: "ニックネーム、言語、移動の制約を登録すると、経路計算と支援マッチングに反映されます。本人確認は行われず、参加者は匿名です。表示名だけで「確認済みの支援者」にはなりません。",
    },
    en: {
      title: "Start with your profile",
      body: "Register a nickname, language, and mobility needs so routes and support matching can reflect them. Participants are anonymous and identities are not verified; a display name never makes someone a “verified helper.”",
    },
  },
];

export function WelcomePage() {
  const en = useAppStore((s) => s.language) === "en";
  const history = useHistory();
  const start = (to: string) => {
    markOnboardingSeen();
    history.push(to);
  };
  return (
    <Layout
      dataMode="real_preview"
      title={en ? "Welcome to TASUKU" : "はじめに"}
      eyebrow="BEFORE YOU START"
    >
      <p className="intro">
        {en
          ? "A one-minute guide before using location and assistance."
          : "現在地と支援を使う前に、1分だけ案内します。"}
      </p>
      <div className="two-columns">
        {sections.map((section) => {
          const text = en ? section.en : section.ja;
          return (
            <section className="match-card" key={text.title}>
              <h2>{text.title}</h2>
              <p>{text.body}</p>
            </section>
          );
        })}
      </div>
      <div className="form-actions">
        <IonButton onClick={() => start("/profile")}>
          {en ? "Set up your profile" : "プロフィールを登録する"}
        </IonButton>
        <IonButton fill="outline" onClick={() => start("/home")}>
          {en ? "Go to the map first" : "まずマップを見る"}
        </IonButton>
      </div>
    </Layout>
  );
}
