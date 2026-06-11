/**
 * Escape a string for safe interpolation into a raw HTML string (e.g. d3's
 * `.html()` or Svelte `{@html}`). Prefer framework auto-escaping (`{value}` in
 * markup) where possible; use this only for the few sinks that build HTML by hand.
 * @param {unknown} str
 * @returns {string}
 */
export function escapeHTML(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
