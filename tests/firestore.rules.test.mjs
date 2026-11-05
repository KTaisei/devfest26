import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$/.test(host || ""))
  throw new Error(
    "Run npm run test:firebase; only local emulator tests are allowed",
  );
const [hostname, port] = host.split(":");
let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-tasuku",
    firestore: {
      host: hostname,
      port: Number(port),
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});
after(async () => {
  await environment?.cleanup();
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users/alice"), { uid: "alice", displayName: "Alice" }),
      setDoc(doc(db, "private_locations/alice"), {
        latitude: 34.4884,
        longitude: 133.3614,
      }),
      setDoc(doc(db, "support_requests/request1"), {
        uid: "alice",
        status: "offered",
      }),
      setDoc(doc(db, "matches/match1"), {
        requesterId: "alice",
        helperId: "bob",
        status: "offered",
      }),
      setDoc(doc(db, "helper_claims/bob"), { matchId: "match1" }),
      setDoc(doc(db, "request_claims/alice"), { requestId: "request1" }),
      setDoc(doc(db, "road_status/r1"), { roadStatus: "closed" }),
    ]);
  });
});

test("only the profile owner can read it; nobody can write directly", async () => {
  const alice = environment.authenticatedContext("alice").firestore();
  const bob = environment.authenticatedContext("bob").firestore();
  await assertSucceeds(getDoc(doc(alice, "users/alice")));
  await assertFails(getDoc(doc(bob, "users/alice")));
  await assertFails(
    updateDoc(doc(alice, "users/alice"), { displayName: "Changed" }),
  );
  await assertFails(deleteDoc(doc(alice, "users/alice")));
});

test("exact locations and server claims remain unreadable, even to owners or claimed admins", async () => {
  for (const context of [
    environment.unauthenticatedContext(),
    environment.authenticatedContext("alice"),
    environment.authenticatedContext("bob", { admin: true }),
  ]) {
    const db = context.firestore();
    for (const path of [
      "private_locations/alice",
      "helper_claims/bob",
      "request_claims/alice",
      "road_status/r1",
    ]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { injected: true }));
    }
  }
});

test("only match participants and request owner may read their records", async () => {
  for (const uid of ["alice", "bob"]) {
    await assertSucceeds(
      getDoc(
        doc(
          environment.authenticatedContext(uid).firestore(),
          "matches/match1",
        ),
      ),
    );
  }
  const alice = environment.authenticatedContext("alice").firestore();
  const stranger = environment.authenticatedContext("stranger").firestore();
  await assertSucceeds(getDoc(doc(alice, "support_requests/request1")));
  await assertFails(getDoc(doc(stranger, "support_requests/request1")));
  await assertFails(getDoc(doc(stranger, "matches/match1")));
  await assertFails(
    getDoc(
      doc(environment.unauthenticatedContext().firestore(), "matches/match1"),
    ),
  );
  await assertFails(
    updateDoc(doc(alice, "matches/match1"), { status: "accepted" }),
  );
  await assertFails(
    setDoc(doc(alice, "support_requests/fake"), { uid: "alice" }),
  );
});

test("collection access cannot expose other requests or matches", async () => {
  const db = environment.authenticatedContext("alice").firestore();
  await assertFails(getDocs(collection(db, "matches")));
  await assertFails(getDocs(collection(db, "support_requests")));
  await assertSucceeds(
    getDocs(
      query(collection(db, "matches"), where("requesterId", "==", "alice")),
    ),
  );
  await assertSucceeds(
    getDocs(
      query(collection(db, "support_requests"), where("uid", "==", "alice")),
    ),
  );
});
