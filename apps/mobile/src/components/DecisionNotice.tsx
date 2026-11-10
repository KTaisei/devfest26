import type { components } from "../types/api.generated";
export function DecisionNotice({
  value,
  en,
}: {
  value: components["schemas"]["DecisionSupport"];
  en: boolean;
}) {
  const actions = {
    compare_approaches: en
      ? "Compare the verified walking approaches and confirm the public meeting point."
      : "通常徒歩経路を比較した合流候補です。公開地点を確認してください。",
    check_surroundings: en
      ? "Shaking or an obstruction was reported. Check your surroundings and official instructions before planning movement."
      : "揺れ・通行障害が申告されています。移動経路の判断より先に周囲と公的な指示を確認してください。",
    check_official_information: en
      ? "Check current official information. An absent notice does not establish safety."
      : "公的な最新情報を確認してください。情報がないことは安全を意味しません。",
    review_route: en
      ? "Review nearby evacuation places and the ordinary walking route. Verify opening and road conditions separately."
      : "周辺の避難場所と通常徒歩経路を確認してください。開設・道路状況は別途確認が必要です。",
    review_meeting: en
      ? "Review the agreed meeting point and your route. Either participant can cancel."
      : "合意した合流地点と自分の道順を確認してください。双方とも中止できます。",
    confirm_in_person: en
      ? "Both confirmations are recorded. Confirm the next action with the other person in person."
      : "双方の合流確認が記録されています。次の行動は相手と対面で確認してください。",
  };
  return (
    <div className="notice" role="status">
      <strong>
        {value.provider === "gemini"
          ? "Gemini"
          : en
            ? "Rule-based fallback"
            : "ルールによる提案"}{" "}
        · {en ? "Decision support / review required" : "判断補助・確認が必要"}
      </strong>
      <p>{actions[value.action]}</p>
      <small>
        {en
          ? "Road/site safety and accessibility remain unverified."
          : "安全性・通行可否・移動条件への適合は未確認です。"}
      </small>
    </div>
  );
}
