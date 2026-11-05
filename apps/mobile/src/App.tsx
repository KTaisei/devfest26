import { useEffect } from "react";
import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Redirect, Route } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HomePage } from "./pages/HomePage";
import { ProfilePage } from "./pages/ProfilePage";
import { SupportPage } from "./pages/SupportPage";
import { HelperPage } from "./pages/HelperPage";
import { MatchingPage } from "./pages/MatchingPage";
import { AdminPage } from "./pages/AdminPage";
import { api } from "./services/api";
import { useAppStore } from "./stores/useAppStore";
import type { Profile } from "./types/domain";

setupIonicReact();
export default function App() {
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<Profile | null>("/profile")).data,
  });
  useEffect(() => {
    if (profile.data) {
      useAppStore.getState().setProfile(profile.data);
      useAppStore.getState().setLanguage(profile.data.preferredLanguage);
    }
  }, [profile.data]);
  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route exact path="/home" component={HomePage} />
          <Route exact path="/profile" component={ProfilePage} />
          <Route exact path="/support" component={SupportPage} />
          <Route exact path="/helper" component={HelperPage} />
          <Route exact path="/matching" component={MatchingPage} />
          <Route exact path="/admin" component={AdminPage} />
          <Route exact path="/">
            <Redirect to="/home" />
          </Route>
          <Route>
            <Redirect to="/home" />
          </Route>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}
