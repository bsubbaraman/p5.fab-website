import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { writable } from "svelte/store";
import { auth } from "../dbConfig";



export const store = $state({
    displayLogin: false,
    displaySignUp: false,
    user: null,
    loading: true,
    data: {},
    allPostsData: null,
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
    signup: async (email, password) => {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    },
    login: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
    },
    logout: async () => {
        await signOut(auth);
    }
}

