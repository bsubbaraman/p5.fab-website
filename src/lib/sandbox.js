// Origin that serves preview.html — the sandbox where untrusted sketch code runs.
//
// SECURITY: the preview iframe uses `allow-scripts allow-same-origin` (required so
// Web Serial can be delegated into it for printing). `allow-same-origin` is only safe
// when the iframe is served from a DIFFERENT origin than the app, so that "same-origin"
// means the throwaway sandbox origin — never the app origin where the user's Firebase
// session lives. Configure VITE_SANDBOX_ORIGIN to that separate origin in production,
// e.g. https://sandbox.copypastes.xyz.
//
// In dev, if VITE_SANDBOX_ORIGIN is unset we fall back to same-origin so `npm run dev`
// works without extra infrastructure. Isolation is NOT active in that mode (dev only).
// To exercise real isolation locally, set VITE_SANDBOX_ORIGIN to a second local origin
// (e.g. http://localhost:4173) serving the `static/` directory.

const configured = (import.meta.env.VITE_SANDBOX_ORIGIN || '').replace(/\/+$/, '');

function appOrigin() {
	return typeof window !== 'undefined' ? window.location.origin : '';
}

// Fail loud, never fail open: in a production build the sandbox must be a real,
// separate origin. If it isn't, untrusted code is NOT isolated from the session.
if (import.meta.env.PROD && typeof window !== 'undefined') {
	if (!configured || configured === appOrigin()) {
		console.error(
			'[p5.fab SECURITY] VITE_SANDBOX_ORIGIN is unset or equal to the app origin. ' +
				'Untrusted sketch code is running WITHOUT isolation from the user session. ' +
				'Set VITE_SANDBOX_ORIGIN to a separate origin that serves preview.html.'
		);
	}
}

/**
 * The origin to use as the postMessage `targetOrigin` when talking to the
 * preview iframe (and the origin incoming preview messages are expected from).
 * Never returns '*'. In the dev same-origin fallback this is the app origin.
 * @returns {string}
 */
export function sandboxOrigin() {
	return configured || appOrigin();
}

/**
 * URL for the preview iframe `src`. Carries the parent (app) origin so the
 * sandbox can target its replies precisely instead of broadcasting with '*'.
 * @returns {string}
 */
export function previewUrl() {
	const parent = encodeURIComponent(appOrigin());
	// configured is '' in the dev fallback -> relative, same-origin URL.
	return `${configured}/preview.html?parentOrigin=${parent}`;
}
