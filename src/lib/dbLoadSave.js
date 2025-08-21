import { store, editorState } from "../store/state.svelte.js";
import { db, storage } from '../dbConfig.js';
import { getDoc, doc } from 'firebase/firestore';


export async function getUserData(uid) {
    const userRef = doc(db, 'users', uid);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
        return docSnap.data();
    }
    else {
        console.log("Can't find user with that id");
        return false;
    }
}

export async function getPostFromDB(id) {
    const docRef = doc(db, 'posts', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data();
    } else {
        alert("That post does not exist!");
        return false;
    }
}
