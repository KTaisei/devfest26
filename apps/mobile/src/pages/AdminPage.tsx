import { IonButton, IonSelect, IonSelectOption } from "@ionic/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout, ErrorNotice } from "../components/Layout";
import { useScenarios } from "../features/useSimulation";
import { api } from "../services/api";
import { enableDemoAdmin, firebaseEnabled } from "../services/auth";
import { useAppStore } from "../stores/useAppStore";

export function AdminPage() {
  const scenarios = useScenarios(),
    client = useQueryClient(),
    en = useAppStore((s) => s.language) === "en";
  const admin = useMutation({ mutationFn: enableDemoAdmin });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/simulation/roads/${id}`, { status }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["scenarios"] }),
  });
  return (
    <Layout
      title={en ? "Simulation settings" : "デモ管理"}
      eyebrow="SCENARIO CONTROL"
    >
      <div className="form-card">
        <h2>{en ? "Road closure scenario" : "道路閉塞シナリオ"}</h2>
        <p>{scenarios.data?.[0]?.description}</p>
        <p>
          {en
            ? "Change r3 to closed and watch the evacuation route recalculate. Changes apply to all demo participants."
            : "r3を通行不可にすると、経路が再計算されます。変更はすべてのデモ参加者に反映されます。"}
        </p>
        {!firebaseEnabled && (
          <>
            <div className="notice">
              ローカルデモでは誰でも模擬管理者になれます。実データを登録しないでください。
              / Local demo administrator only.
            </div>
            <IonButton
              onClick={() => admin.mutate()}
              disabled={admin.isPending}
            >
              {en ? "Enable demo administration" : "模擬管理操作を有効にする"}
            </IonButton>
          </>
        )}
        <ErrorNotice error={admin.error} />
        <ErrorNotice error={scenarios.error} />
        <ErrorNotice error={update.error} />
        <div className="roads-list">
          {scenarios.data?.[0]?.edges.map((e) => (
            <div className="road-row" key={e.id}>
              <div>
                <strong>{e.id}</strong>
                <span>
                  {e.fromNode} → {e.toNode}
                  {e.hasStairs ? " · 階段" : ""}
                </span>
              </div>
              <IonSelect
                aria-label={`Road ${e.id} status`}
                disabled={
                  update.isPending || (!firebaseEnabled && !admin.isSuccess)
                }
                value={e.roadStatus}
                onIonChange={(event) => {
                  if (event.detail.value !== e.roadStatus)
                    update.mutate({ id: e.id, status: event.detail.value });
                }}
              >
                <IonSelectOption value="open">Open / 通行可</IonSelectOption>
                <IonSelectOption value="restricted">
                  Restricted / 規制
                </IonSelectOption>
                <IonSelectOption value="closed">
                  Closed / 通行不可
                </IonSelectOption>
                <IonSelectOption value="unknown">
                  Unknown / 未確認
                </IonSelectOption>
              </IonSelect>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
