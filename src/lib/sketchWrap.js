import { evalPrefix } from '$lib/evalPrefix.js';

// Shared eval-wrapping for the preview iframe, used by BOTH the main editor (repl.js) and
// the embed page so the two can't drift. `body` is the user's sketch code — AST-instrumented
// with per-function try/catch by the main editor, or raw in the embed. We append the function
// "exports" the preview expects (setup/draw/fabDraw/windowResized) and close the IIFE that
// evalPrefix opens. Callers post the returned string to the preview themselves, keeping their
// own postMessage target (sandbox origin for the editor, '*' for the embed).
export function wrapSketch(body) {
	return (
		evalPrefix +
		body +
		`\n      try { window.setup = setup } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }, '*'); };` +
		`\n      try { window.draw = draw } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }, '*'); };` +
		`\n      try { window.fabDraw = fabDraw } catch (e) { window.parent.postMessage({ type: "error", body: e.toString() }, '*'); };` +
		`\n      try { window.windowResized = windowResized } catch (e) { };` +
		`\n    }\n  })()()`
	);
}

// Re-run setup() between runs without blanking the canvas when its dimensions are unchanged,
// preserving the fab camera. Eval'd after the first p5 init (i.e. on subsequent runs).
export const reloadWrapper = `(() => {
    const _orig = p5.prototype.createCanvas;
    let _canvasResized = false;
    p5.prototype.createCanvas = function(w, h, renderer) {
        if (w === width && h === height) return this._renderer;
        _canvasResized = true;
        return _orig.call(this, w, h, renderer);
    };
    const savedPos = (typeof fab !== 'undefined' && fab) ? {x: fab.cameraPosition.x, y: fab.cameraPosition.y, z: fab.cameraPosition.z} : null;
    const savedOrientation = (typeof fab !== 'undefined' && fab) ? {x: fab.cameraOrientation.x, y: fab.cameraOrientation.y, z: fab.cameraOrientation.z} : null;
    try { setup(); } finally {
        p5.prototype.createCanvas = _orig;
        if (typeof fab !== 'undefined' && fab) {
            fab._needsCameraReInit = true;
            if (!_canvasResized && savedPos) {
                fab.cameraPosition.set(savedPos.x, savedPos.y, savedPos.z);
                fab.cameraOrientation.set(savedOrientation.x, savedOrientation.y, savedOrientation.z);
                fab.recoverCameraPosition = true;
            }
        }
    }
})()`;
