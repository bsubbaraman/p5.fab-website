// Firestore rules test for the one-like-per-user (togglingOwnLike) rule.
// Run with: firebase emulators:exec --only firestore --project demo-fab 'node rules.test.mjs'
import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, increment, deleteField } from 'firebase/firestore';

const hostport = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [host, port] = hostport.split(':');

const testEnv = await initializeTestEnvironment({
	projectId: 'demo-fab',
	firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) }
});

const A = testEnv.authenticatedContext('userA').firestore();
const B = testEnv.authenticatedContext('userB').firestore();

const base = {
	name: 'p', authorUID: 'author', username: 'auth', info: 'i', code: 'c',
	hasFabricated: 'no', isFork: false, favorites: 0, numForks: 0, forks: []
};
async function seed(id, data) {
	await testEnv.withSecurityRulesDisabled(async (ctx) =>
		setDoc(doc(ctx.firestore(), 'posts', id), { ...base, ...data })
	);
}

let pass = 0, fail = 0;
async function expect(name, p) {
	try { await p; console.log('  PASS  ' + name); pass++; }
	catch (e) { console.log('  FAIL  ' + name + ' :: ' + e.message); fail++; }
}

// --- ALLOW: legitimate toggles ---
await seed('p1', { favorites: 3 });
await expect('A likes (count+1, favoritedBy.A) — first like on a post with no favoritedBy',
	assertSucceeds(updateDoc(doc(A, 'posts', 'p1'), { favorites: increment(1), ['favoritedBy.userA']: true })));

await expect('A unlikes (count-1, favoritedBy.A removed)',
	assertSucceeds(updateDoc(doc(A, 'posts', 'p1'), { favorites: increment(-1), ['favoritedBy.userA']: deleteField() })));

await seed('p4', { favorites: 2, favoritedBy: { other: true } });
await expect('B likes a post others already liked (only B key added)',
	assertSucceeds(updateDoc(doc(B, 'posts', 'p4'), { favorites: increment(1), ['favoritedBy.userB']: true })));

// --- DENY: inflation / tampering ---
await seed('p2', { favorites: 10, favoritedBy: { userA: true } });
await expect('A cannot double-like (raw +1, favoritedBy unchanged)',
	assertFails(updateDoc(doc(A, 'posts', 'p2'), { favorites: increment(1) })));

await seed('p2b', { favorites: 10 });
await expect('B cannot inflate via raw +1 without recording a like',
	assertFails(updateDoc(doc(B, 'posts', 'p2b'), { favorites: increment(1) })));

await expect('A cannot +2 in a single write',
	assertFails(updateDoc(doc(A, 'posts', 'p2b'), { favorites: increment(2), ['favoritedBy.userA']: true })));

await seed('p3', { favorites: 5 });
await expect('A cannot deflate (-1) a post they never liked (griefing)',
	assertFails(updateDoc(doc(A, 'posts', 'p3'), { favorites: increment(-1), ['favoritedBy.userA']: deleteField() })));

await expect('B cannot like on behalf of A (adds favoritedBy.A, not own key)',
	assertFails(updateDoc(doc(B, 'posts', 'p3'), { favorites: increment(1), ['favoritedBy.userA']: true })));

await expect('A cannot piggyback another field change while liking',
	assertFails(updateDoc(doc(A, 'posts', 'p3'), { favorites: increment(1), ['favoritedBy.userA']: true, name: 'hacked' })));

await expect('A cannot change favoritedBy without moving the count',
	assertFails(updateDoc(doc(A, 'posts', 'p3'), { ['favoritedBy.userA']: true })));

console.log(`\n${pass} passed, ${fail} failed`);
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
