import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser } from "firebase/auth";
import { auth } from "../dbConfig";
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../dbConfig';



export const store = $state({
    displayLogin: false,
    displaySignUp: false,
    user: null,
    loading: true,
    data: {},
})

export const editorState = $state({
    sketchWindow: null,
    editorView: null,
    globalSketch: "",
    p5Initialized: false,
    output: [],
    projectTitle: "Untitled Project",
    displaySaveScreen: false,
    displayLogScreen: false,
    saveText: 'save',
    currentObjectID: null,
    savedSketchData: {},
    saved: false,
    displayRemixPane: false,
    remixTree: null,
    sketchIsFork: null,
    machineStatus: {
        connected: false,
        isPrinting: false,
        nozzleTemp: null,
        bedTemp: null,
        x: null,
        y: null,
        z: null,
        printerName: null,
        nozzleDiameter: null,
        filamentDiameter: null,
        maxX: null,
        maxY: null,
        maxZ: null,
        maxNozzleTemp: null,
        maxBedTemp: null,
    },
    printAlert: null,
    lastRunCode: null,
    staleCodeModal: false,
    staleGcodeDownloadModal: false,
    isParsing: false,
})

export const authHandlers = {
    signup: async (email, password, username) => {
        const display = username.trim();
        const key = display.toLowerCase();
        const usernameRef = doc(db, 'usernames', key);

        // 0. Pre-check availability BEFORE creating an auth account, so claiming a taken
        //    name never signs the user in or flips the header. The create-only rule in
        //    step 1 is still the real guard against the check-then-claim race.
        const pre = await getDoc(usernameRef);
        if (pre.exists()) {
            throw new Error('username-taken');
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const uid = user.uid;

        // 1. Claim the username registry doc — lowercase key (uniqueness), original-case
        //    display. The rule is create-only, so writing over an existing key is denied.
        try {
            await setDoc(usernameRef, { uid, display, created: serverTimestamp() });
        } catch (err) {
            const snap = await getDoc(usernameRef);
            if (snap.exists() && snap.data().uid === uid) {
                // Orphaned claim we already own (earlier crash) — resume.
            } else if (snap.exists()) {
                await deleteUser(user).catch(() => {}); // someone else got it in the race
                throw new Error('username-taken');
            } else {
                await deleteUser(user).catch(() => {}); // claim failed for another reason
                throw err;
            }
        }

        // 2. Create the user doc pointing at the claimed name.
        try {
            await setDoc(doc(db, 'users', uid), {
                username: display,
                created: new Date(),
                posts: {},
                favorites: [],
            });
        } catch (err) {
            // Roll back the claim and the auth account so nothing is left dangling.
            await deleteDoc(usernameRef).catch(() => {});
            await deleteUser(user).catch(() => {});
            throw err;
        }

        return user;
    },
    login: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
    },
    logout: async () => {
        await signOut(auth);
    }
}

