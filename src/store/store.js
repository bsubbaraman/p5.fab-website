import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { writable } from "svelte/store";
import { auth } from "../dbConfig";
import { getFirestore, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../dbConfig'



export const store = writable({
    displayLogin: false,
    displaySignUp: false,
    user: null,
    loading: true,
    data: {}
})

export const authHandlers = {
    signup: async (email, password, username) => {
        let uid = null;
        await createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                uid = userCredential.user.uid;

            });
        await setDoc(doc(db, 'users', uid), {
            username: username,
            email: email,
            created: new Date(),
            posts: {},
            favorites: [],
        });

    },
    login: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
    },
    logout: async () => {
        await signOut(auth);
    }
}

