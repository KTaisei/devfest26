import { useEffect } from "react";
import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Redirect, Route } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { WelcomePage } from "./pages/WelcomePage";
import { hasSeenOnboarding } from "./services/onboarding";
import { HomePage } from "./pages/HomePage";
import { NavigationPage } from "./pages/NavigationPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SupportPage } from "./pages/SupportPage";
import { HelperPage } from "./pages/HelperPage";
import { MatchingPage } from "./pages/MatchingPage";
import { AssistancePage } from "./pages/AssistancePage";
import { AdminPage } from "./pages/AdminPage";
import { api } from "./services/api";
import { useAppStore } from "./stores/useAppStore";
import type { Profile } from "./types/domain";

import { LocationSession } from "./components/LocationSession";

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
      <LocationSession />
      <IonReactRouter>
        <IonRouterOutlet>
          <Route exact path="/welcome" component={WelcomePage} />
          <Route exact path="/simulation" component={HomePage} />
          <Route exact path="/home" component={NavigationPage} />
          <Route exact path="/navigation">
            <Redirect to="/home" />
          </Route>
          <Route exact path="/profile" component={ProfilePage} />
          <Route exact path="/support">
            <AssistancePage />
          </Route>
          <Route exact path="/simulation-support" component={SupportPage} />
          <Route exact path="/helper">
            <AssistancePage helper />
          </Route>
          <Route exact path="/simulation-helper" component={HelperPage} />
          <Route exact path="/simulation-matching" component={MatchingPage} />
          <Route exact path="/admin" component={AdminPage} />
          <Route exact path="/">
            <Redirect to={hasSeenOnboarding() ? "/home" : "/welcome"} />
          </Route>
          <Route>
            <Redirect to="/home" />
          </Route>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}
