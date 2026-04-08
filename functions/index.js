const {setGlobalOptions} = require("firebase-functions");
const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
} = require("firebase-functions/v2/firestore");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

setGlobalOptions({maxInstances: 10});

initializeApp();
const db = getFirestore();
const allPostsRef = db.doc("posts/allPosts");

// When a post is first published, add it to the feed
exports.onPostCreated = onDocumentCreated("posts/{postId}", async (event) => {
  const postId = event.params.postId;
  if (postId === "allPosts") return;

  const data = event.data.data();
  await allPostsRef.update({
    [postId]: {
      name: data.name ?? null,
      authorUID: data.authorUID ?? null,
      username: data.username ?? null,
      created: data.created ?? null,
      isFork: data.isFork ?? false,
      parentSketch: data.parentSketch ?? null,
      hasFabricated: data.hasFabricated ?? false,
      thumbnail: data.thumbnail ?? null,
    },
  });
});

// When a post's name or thumbnail changes, sync to the feed
exports.onPostUpdated = onDocumentUpdated("posts/{postId}", async (event) => {
  const postId = event.params.postId;
  if (postId === "allPosts") return;

  const before = event.data.before.data();
  const after = event.data.after.data();

  const nameUnchanged = before.name === after.name;
  const thumbUnchanged = before.thumbnail === after.thumbnail;
  if (nameUnchanged && thumbUnchanged) return;

  await allPostsRef.update({
    [`${postId}.name`]: after.name ?? null,
    [`${postId}.thumbnail`]: after.thumbnail ?? null,
  });
});

// When a post is deleted, remove it from the feed
exports.onPostDeleted = onDocumentDeleted("posts/{postId}", async (event) => {
  const postId = event.params.postId;
  if (postId === "allPosts") return;

  await allPostsRef.update({
    [postId]: FieldValue.delete(),
  });
});

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
