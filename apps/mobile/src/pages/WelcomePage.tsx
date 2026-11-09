import { IonButton } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { Layout } from "../components/Layout";
import { markOnboardingSeen } from "../services/onboarding";
import { useAppStore } from "../stores/useAppStore";

const sections = [
  {
    ja: {
      title: "TASUKUとは",
      body: "「知らない街でも、ひとりにしない。」災害時の避難経路と、近くにいる人同士の助け合いを体験できるシミュレーションです。あなたの移動の制約（車いす・階段回避など）に合った経路と支援のつながりを探します。",
    },
    en: {
      title: "What is TASUKU?",
      body: "“Never alone, even in an unfamiliar city.” TASUKU is a simulation of evacuation routes and mutual support between people nearby. It finds routes and support that respect your mobility needs, such as wheelchair use or avoiding stairs.",
    },
  },
  {
    ja: {
      title: "これは訓練です",
      body: "表示される道路・避難場所・災害情報はすべて架空の模擬データです。実際の避難判断には使用できません。実際の災害時は、自治体や公式の情報を確認してください。",
    },
    en: {
      title: "This is a drill",
      body: "Every road, shelter, and disaster update shown here is fictional simulation data. Never use it for a real evacuation decision. In a real disaster, follow official information from your municipality.",
    },
  },
  {
    ja: {
      title: "位置情報について",
      body: "位置の共有は任意で、あなたが明示的に同意したときだけ行われます。共有した位置は30分でマッチングに使えなくなり、期限切れデータを順次削除します。当事者の正確な現在地は他の参加者に表示せず、承諾後は選ばれた模擬合流地点を両者に共有します。",
    },
    en: {
      title: "About your location",
      body: "Location sharing is optional and happens only with your explicit consent. A shared location becomes unavailable for matching after 30 minutes, then expired data is deleted asynchronously. Your exact current position is not shown to other participants. Once accepted, both participants see the selected fictional meeting point.",
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
      title={en ? "Welcome to TASUKU" : "はじめに"}
      eyebrow="BEFORE YOU START"
    >
      <p className="intro">
        {en
          ? "A one-minute guide before your first simulation."
          : "最初のシミュレーションの前に、1分だけ案内します。"}
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
