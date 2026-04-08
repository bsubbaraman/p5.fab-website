import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../dbConfig";
import { doc, setDoc } from 'firebase/firestore';
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
})

export const authHandlers = {
    signup: async (email, password, username) => {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        await setDoc(doc(db, 'users', uid), {
            username: username,
            created: new Date(),
            posts: {},
            favorites: [],
        });
        return userCredential.user;
    },
    login: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
    },
    logout: async () => {
        await signOut(auth);
    }
}

