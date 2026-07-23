/**
 * Whether Web Serial is usable in this browser.
 *
 * Checks that `navigator.serial` exists and exposes a real `requestPort` method.
 * True in Chromium browsers (Chrome/Edge/Opera) and in Firefox with the
 * `dom.serial.enabled` pref turned on, where Web Serial genuinely works. Safari and
 * default Firefox don't expose `navigator.serial`, so they resolve to false and get
 * the "unsupported" modal.
 * @returns {boolean}
 */
export function isWebSerialSupported() {
	return (
		typeof navigator !== 'undefined' &&
		!!navigator.serial &&
		typeof navigator.serial.requestPort === 'function'
	);
}
