import axios from "axios";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import type { User } from "firebase/auth";

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
if (auth && env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
  const url = new URL(env.VITE_FIREBASE_AUTH_EMULATOR_URL);
  if (
    !import.meta.env.DEV ||
    !env.VITE_FIREBASE_PROJECT_ID.startsWith("demo-") ||
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error("Firebaseエミュレータは開発時のローカル接続専用です。");
  }
  // HMR can re-evaluate this module while the Firebase app is still initialized.
  if (!auth.emulatorConfig) connectAuthEmulator(auth, url.origin);
}

let firebaseUser: Promise<User> | undefined;
let session:
  Promise<{ token: string; uid: string; admin: boolean }> | undefined;
let demo: { token: string; uid: string; admin: boolean } | undefined;

export async function getSession() {
  if (auth) {
    // Wait for persisted auth before signing in, and coalesce parallel startup requests.
    // Without this, reloading or several API calls may create different anonymous users.
    const firebaseAuth = auth;
    firebaseUser ??= (async () => {
      await firebaseAuth.authStateReady();
      return (
        firebaseAuth.currentUser ?? (await signInAnonymously(firebaseAuth)).user
      );
    })().catch((error) => {
      firebaseUser = undefined;
      throw error;
    });
    const user = await firebaseUser;
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
