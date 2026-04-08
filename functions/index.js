const {setGlobalOptions} = require("firebase-functions");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

setGlobalOptions({maxInstances: 10});

initializeApp();
const db = getFirestore();

// Atomically claim a username in the username registry.
// Called immediately after Firebase Auth account + user doc creation.
exports.claimUsername = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const {username} = request.data;

  if (
    !username ||
    typeof username !== "string" ||
    username.length < 3 ||
    username.length > 30 ||
    !/^[a-zA-Z0-9_]+$/.test(username)
  ) {
    throw new HttpsError("invalid-argument", "Invalid username.");
  }

  const usernamesRef = db.doc("users/usernames");

  await db.runTransaction(async (t) => {
    const snap = await t.get(usernamesRef);
    const data = snap.data() || {allUsernames: []};
    if (data.allUsernames.includes(username)) {
      throw new HttpsError("already-exists", "Username is taken.");
    }
    t.update(usernamesRef, {
      allUsernames: FieldValue.arrayUnion(username),
    });
  });

  return {success: true};
});
