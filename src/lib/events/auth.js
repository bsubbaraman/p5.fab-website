
import { store, authHandlers } from '../../store/state.svelte';

export function toggleAuthContainer() {
    store.displayLogin = !store.displayLogin;
    store.displaySignUp = false;
}

export async function signOut() {
    let authenticating = false;

    if (authenticating) {
        return;
    }
    try {
        await authHandlers.logout();
    } catch (err) {
        console.log('Authentication error', err);
    }
    authenticating = true;
    store.user = null;
    store.displayLogin = false;
    store.displaySignUp = false;
}
