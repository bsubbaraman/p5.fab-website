import { db } from '../dbConfig.js';
import { getDoc, doc } from 'firebase/firestore';

/**
 * Fetch a user document.
 * @returns the user data, or `null` if no such user exists.
 * @throws if the read itself fails (offline / permission). Callers should `try/catch`
 *   to tell "not found" (null) apart from "load failed" (throw).
 */
export async function getUserData(uid) {
	const userRef = doc(db, 'users', uid);
	const docSnap = await getDoc(userRef);
	return docSnap.exists() ? docSnap.data() : null;
}

/**
 * Fetch a post document.
 * @returns the post data, or `null` if no such post exists.
 * @throws if the read itself fails (offline / permission).
 */
export async function getPostFromDB(id) {
	const docRef = doc(db, 'posts', id);
	const docSnap = await getDoc(docRef);
	return docSnap.exists() ? docSnap.data() : null;
}
