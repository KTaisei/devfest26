import axios from "axios";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";

const env = import.meta.env;
export const firebaseEnabled = Boolean(
  env.VITE_FIREBASE_API_KEY &&
  env.VITE_FIREBASE_AUTH_DOMAIN &&
  env.VITE_FIREBASE_PROJECT_ID,
);
const auth = firebaseEnabled
  ? getAuth(
      initializeApp({
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
      }),
    )
  : null;
let session:
  Promise<{ token: string; uid: string; admin: boolean }> | undefined;
let demo: { token: string; uid: string; admin: boolean } | undefined;

export async function getSession() {
  if (auth) {
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    const claims = await user.getIdTokenResult();
    return {
      token: claims.token,
      uid: user.uid,
      admin: claims.claims.admin === true,
    };
  }
  // Each tab is a distinct demonstration participant. No credentials survive a reload.
  session ??= axios
    .post(`${env.VITE_API_BASE_URL || "/api/v1"}/auth/demo`)
    .then((r) => {
      demo = r.data;
      return r.data;
    })
    .catch((e) => {
      session = undefined;
      throw e;
    });
  return session;
}

export async function enableDemoAdmin() {
  if (auth) throw new Error("Firebase管理者のカスタムクレームが必要です。");
  // Separate admin credential; retain the participant identity and its active requests.
  demo = (
    await axios.post(
      `${env.VITE_API_BASE_URL || "/api/v1"}/auth/demo?admin=true`,
    )
  ).data;
  return demo!;
}
export const demoAdminToken = () => (demo?.admin ? demo.token : undefined);
