import { sandboxOrigin } from './sandbox.js';

export function requestIframeScreenshot(iframe) {
    return new Promise((resolve) => {
        function handler(e) {
            if (e.source !== iframe.contentWindow) return;
            if (e.data?.type !== 'screenshot_data') return;
            window.removeEventListener('message', handler);
            resolve(e.data.dataURL);
        }
        window.addEventListener('message', handler);
        iframe.contentWindow.postMessage({ type: 'screenshot' }, sandboxOrigin());
    });
}
