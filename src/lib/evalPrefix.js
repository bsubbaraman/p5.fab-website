export const evalPrefix =
	`(() => {\n` +
	`    return () => {\n` +
	`      console.log = (function(){\n` +
	`        function _fmt(txt) {\n` +
	`          if (txt === null || txt === undefined) return String(txt);\n` +
	`          if (typeof txt !== 'object') return String(txt);\n` +
	`          if (txt.toString !== Object.prototype.toString) return txt.toString();\n` +
	`          try { return JSON.stringify(txt); } catch (e) { return String(txt); }\n` +
	`        }\n` +
	`        return function (txt) {\n` +
	`          window.parent.postMessage({ type: "output", body: _fmt(txt) }, '*');\n` +
	`        };\n` +
	`      })();\n` +
	`      `;
