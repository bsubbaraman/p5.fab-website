// p5.fab — a p5.js library for digital fabrication.
// https://github.com/machineagency/p5.fab
// MIT License

(function (global) {
	/**
	 * Use _log/_warn/_error throughout this file
	 * so p5.fab internal messages always go to the browser devtools console,
	 * regardless of what the editor's eval'd sketch code does.
	 */
	const _log = console.log.bind(console);
	const _warn = console.warn.bind(console);
	const _error = console.error.bind(console);

	let _fab;
	let _once = false;
	let _savedShapesCounter = 0;
	const moveCommands = ['G0', 'G1', 'G2', 'G3'];

	/**
	 * Explicitly initializes the global `fab` object and returns it.
	 *
	 * `createFab()` is optional: `fab` is created automatically before `setup()` runs.
	 * Calling it multiple times returns the same instance, preserving any open
	 * serial connection across reloads.
	 * @memberof Fab
	 * @group Setup
	 * @returns {Fab} The global fab instance.
	 * @example
	 * function setup() {
	 *   createCanvas(windowWidth, windowHeight, WEBGL);
	 *   fab = createFab();
	 * }
	 *
	 * function fabDraw() {
	 *   fab.autoHome();
	 *   fab.setTemps(200, 60);
	 *   const diameter = 50;
	 *   fab.circle(fab.centerX, fab.centerY, 0, diameter);
	 * }
	 *
	 * function draw() {
	 *   background(255);
	 *   fab.render();
	 * }
	 *
	 * @example
	 * function setup() {
	 *   createCanvas(windowWidth, windowHeight, WEBGL);
	 *   // You can omit createFab()
	 *   // The fab object will be created automatically before setup() runs
	 *   fab.setPrinter('ender3');
	 * }
	 *
	 * function fabDraw() {
	 *
	 * }
	 *
	 * function draw() {
	 *   background(255);
	 *   fab.render();
	 * }
	 *
	 * @example
	 * // You can name your fab object something else, if you want!
	 * let myMachine;
	 *
	 * function setup() {
	 *   createCanvas(windowWidth, windowHeight, WEBGL);
	 *   myMachine = createFab();
	 * }
	 *
	 * function fabDraw() {
	 *   myMachine.autoHome();
	 *   myMachine.setTemps(200, 60);
	 *   const diameter = 50;
	 *   myMachine.circle(fab.centerX, fab.centerY, 0, 50);
	 * }
	 *
	 * function draw() {
	 *   background(255);
	 *   myMachine.render();
	 * }
	 */
	p5.prototype.createFab = function () {
		if (!_fab) {
			_fab = new Fab();
		}
		global.fab = new Proxy(_fab, fabValidationHandler);
		_fab._initCamera();
		return global.fab;
	};

	// Create fab before setup() so `fab` is always defined when user code runs.
	// Camera init is deferred to _initCamera() since WEBGL doesn't exist yet here.
	p5.prototype.registerMethod('beforeSetup', function () {
		if (!_fab) {
			_fab = new Fab();
			global.fab = new Proxy(_fab, fabValidationHandler);
		}
	});

	p5.prototype.getSerial = function () {
		return _fab.serial;
	};

	p5.prototype.printOnOpen = function () {
		_fab.serial.on('open', () => _fab.print());
	};

	p5.prototype.reloadSketch = function () {
		if (!_fab) {
			_fab = new Fab();
			global.fab = new Proxy(_fab, fabValidationHandler);
		}
		_fab._initCamera();
		if (typeof fabDraw === 'function') {
			_fab.lastAsyncPosition = new XYZEFC();
			_fab._plannedPosition = new XYZEFC();
			_fab._extrusionMultiplier = _fab._defaultExtrusionMultiplier;
			_fab._retractAmount = _fab._defaultRetractAmount;
			_fab._zHopHeight = _fab._defaultZHopHeight;
			_fab._transformOffset = { x: 0, y: 0, z: 0 };
			_fab._stateStack = [];
			_fab._lastGcodePosition = { x: 0, y: 0, z: 0 };
			setTimeout(() => {
				window.parent.postMessage({ type: 'parsing_start' }, '*');
				setTimeout(() => {
					_fab._commands = [];
					fabDraw();
					_fab.parseGcodeAsync();
					_fab.syncVizStream = true;
				}, 0);
			}, 350);
		}
	};

	// Call reloadSketch once, immediately after setup and before first draw()
	// predraw is called before every draw, so make sure its only run _once
	p5.prototype.predraw = function () {
		if (!_once) {
			_once = true;
			this.reloadSketch();
		}
	};

	p5.prototype.registerMethod('pre', p5.prototype.predraw);

	//===================================
	// Classes
	//===================================
	class XYZEFC {
		// Keep track of the printer XYZE axis positions, speed (F) and comments (C)
		constructor(x, y, z, e, f, c) {
			this.x = x || 0;
			this.y = y || 0;
			this.z = z || 0;
			this.e = e || 0;
			this.f = f || 1500;
			this.c = c || '';
		}
	}

	class LinearMove {
		constructor(cmdString) {
			let x, y, z, e, f, comment;

			// TODO: handle custom tags for midi control
			const commentIdx = cmdString.indexOf(';');
			if (commentIdx > -1) {
				[cmdString, comment] = [
					cmdString.substring(0, commentIdx),
					cmdString.substring(commentIdx)
				];
			}

			cmdString = cmdString.trim();
			let splitCmd = cmdString.split(' ');
			const command = splitCmd[0];
			splitCmd.shift();
			splitCmd.forEach((parameter) => {
				const field = parameter[0];
				const value = parseFloat(parameter.substring(1));
				switch (field) {
					case 'X':
						x = value;
						break;
					case 'Y':
						y = value;
						break;
					case 'Z':
						z = value;
						break;
					case 'E':
						e = value;
						break;
					case 'F':
						f = value;
						break;
				}
			});

			this.command = command;
			this.comment = comment || null;
			this.x = x || null;
			this.y = y || null;
			this.z = z || null;
			this.e = e || null;
			this.f = f || null;
		}

		decimal(val, decimalPoints = 3) {
			return parseFloat(val).toFixed(decimalPoints);
		}

		toString() {
			let xParam, yParam, zParam, eParam, fParam;
			if (this.x !== null) {
				xParam = 'X' + this.decimal(this.x);
			}
			if (this.y !== null) {
				yParam = 'Y' + this.decimal(this.y);
			}
			if (this.z !== null) {
				zParam = 'Z' + this.decimal(this.z);
			}
			if (this.e !== null) {
				eParam = 'E' + this.decimal(this.e);
			}
			if (this.f !== null) {
				fParam = 'F' + this.decimal(this.f);
			}
			// if (this.comment) { commentParam = '; ' + this.comment}

			const parameters = [this.command, xParam, yParam, zParam, eParam, fParam];
			const filteredParameters = parameters.filter(Boolean);
			return filteredParameters.join(' ');
		}
	}

	class GCodeCommand {
		constructor(cmdString) {
			this.raw = cmdString.trim();

			const semiIdx = this.raw.indexOf(';');
			const str = semiIdx > -1 ? this.raw.substring(0, semiIdx).trim() : this.raw;
			this.comment = semiIdx > -1 ? this.raw.substring(semiIdx + 1).trim() : null;

			const parts = str.split(/\s+/).filter(Boolean);
			this.command = parts[0] ?? '';

			this.fields = {};
			for (let i = 1; i < parts.length; i++) {
				const letter = parts[i][0].toUpperCase();
				const value = parseFloat(parts[i].substring(1));
				this.fields[letter] = isNaN(value) ? parts[i].substring(1) : value;
			}

			for (const [letter, value] of Object.entries(this.fields)) {
				this[letter.toLowerCase()] = value;
			}
		}
	}

	//===================================
	// Fab
	//===================================
	// Printer presets are loaded eagerly from /printers/<name>.json at script startup.
	// By the time a user runs a sketch these are guaranteed to be populated.
	const printerPresets = {
		ender3: {
			name: 'ender3',
			baudRate: 115200,
			nozzleDiameter: 0.8,
			filamentDiameter: 1.75,
			maxX: 220,
			maxY: 220,
			maxZ: 250,
			extrusionMultiplier: 1,
			retractAmount: 8,
			zHopHeight: 0.2
		},
		prusa_mk3: {
			name: 'prusa_mk3',
			baudRate: 115200,
			nozzleDiameter: 0.4,
			filamentDiameter: 1.75,
			maxX: 250,
			maxY: 210,
			maxZ: 210,
			extrusionMultiplier: 1,
			retractAmount: 8,
			zHopHeight: 0.2
		},
		jubilee: {
			name: 'jubilee',
			baudRate: 250000,
			nozzleDiameter: 0.4,
			filamentDiameter: 1.75,
			maxX: 300,
			maxY: 300,
			maxZ: 300,
			extrusionMultiplier: 1,
			retractAmount: 8,
			zHopHeight: 0.2
		}
	};

	const defaultPrinterSettings = {
		name: 'default',
		baudRate: 115200,
		nozzleDiameter: 0.8,
		filamentDiameter: 1.75,
		maxX: 220,
		maxY: 220,
		maxZ: 250,
		extrusionMultiplier: 1,
		retractAmount: 8,
		zHopHeight: 0.2,
		autoConnect: true
	};

	const FAB_PARAM_NAMES = Object.freeze({
		// Update these manually for the simple friendly error system
		// Drawing — v optional
		circle: ['x', 'y', 'z', 'd'],
		// Absolute movement — v optional
		moveTo: ['x', 'y', 'z'],
		travelTo: ['x', 'y', 'z'],
		moveToX: ['x'],
		moveToY: ['y'],
		moveToZ: ['z'],
		// Relative movement — v optional
		move: ['dx', 'dy', 'dz'],
		moveX: ['dx'],
		moveY: ['dy'],
		moveZ: ['dz'],
		// Absolute extrusion — e auto-calculated, v optional
		extrudeTo: ['x', 'y', 'z'],
		retractTo: ['x', 'y', 'z'],
		extrudeToX: ['x'],
		extrudeToY: ['y'],
		extrudeToXY: ['x', 'y'],
		extrudeToZ: ['z'],
		// Relative extrusion — e auto-calculated, v optional
		extrude: ['dx', 'dy', 'dz'],
		extrudeX: ['dx'],
		extrudeXY: ['dx', 'dy'],
		extrudeY: ['dy'],
		extrudeZ: ['dz'],
		// Config — these are the whole point of the call
		// Relative retract travel
		retractBy: ['dx', 'dy', 'dz'],
		// Config — these are the whole point of the call
		setTemps: ['tNozzle', 'tBed'],
		speed: ['v'],
		retractAmount: ['mm'],
		zHopHeight: ['mm']
	});

	const fabValidationHandler = {
		// Simple 'Friendly Error System' a la p5 FES
		// Uses FAB_PARAM_NAMES to give a bit of feedback
		get(target, prop) {
			const val = target[prop];
			if (typeof val !== 'function' || !FAB_PARAM_NAMES[prop]) return val;
			return function (...args) {
				const names = FAB_PARAM_NAMES[prop];
				const src = val.toString();
				const paramStr = src.slice(src.indexOf('(') + 1, src.indexOf(')'));
				const maxParams = paramStr.trim() ? paramStr.split(',').length : 0;
				const received = args.length;
				const word = received === 1 ? 'argument' : 'arguments';
				if (received < names.length) {
					window.parent.postMessage(
						{
							type: 'output',
							body: `p5.fab says: ${prop}() received ${received} ${word}, expected at least ${names.length}.`
						},
						'*'
					);
					return;
				}
				if (maxParams > 0 && received > maxParams) {
					window.parent.postMessage(
						{
							type: 'output',
							body: `p5.fab says: ${prop}() received ${received} ${word}, expected no more than ${maxParams}.`
						},
						'*'
					);
					return;
				}
				return val.apply(target, args);
			};
		}
	};

	class Fab {
		constructor(config = defaultPrinterSettings) {
			this.configure(config);
			if (navigator.serial) this.setupSerialConnection();

			// Command queue
			this._commands = [];
			this._commandStream = [];

			// Motion state
			this.lastAsyncPosition = new XYZEFC();
			this._plannedPosition = new XYZEFC();
			this._lastGcodePosition = { x: 0, y: 0, z: 0 };
			this.relativePositioning = false;
			this.reportedPos = {};
			this.gotInitPosition = false;
			this._isPrinting = false;

			// Print parameters (reset to profile defaults each fabDraw)
			this._extrusionMultiplier = 1;
			this._defaultExtrusionMultiplier = 1;
			this._retractAmount = 8;
			this._defaultRetractAmount = 8;
			this._zHopHeight = 0.2;
			this._defaultZHopHeight = 0.2;

			// Push/pop state
			this._transformOffset = { x: 0, y: 0, z: 0 };
			this._stateStack = [];

			// Rendering (camera deferred to _initCamera — needs a WEBGL canvas)
			this.vertices = [];
			this.model = null;
			this.lineWeight = 1.5;
			this._parseGeneration = 0;
			this._parsingGcode = false;
			this.syncVizStream = true;
			this.tempQueryIntervalID = null;
			this.camera = null;
			this.cameraPosition = null;
			this.cameraOrientation = null;
			this._cameraInitialized = false;
			this._needsCameraReInit = false;
		}

		_initCamera() {
			if (this._cameraInitialized) return;
			try {
				pixelDensity(2);
				this.camera = createCamera();
				this.camera.setPosition(0, 0, 400);
				this.cameraPosition = new p5.Vector(0, 0, 400);
				this.cameraOrientation = new p5.Vector(0, 0, 0);
				this.setCameraView('home');
				this._cameraInitialized = true;
			} catch (e) {
				// WEBGL renderer not ready yet; will be called again from reloadSketch/predraw
			}
		}

		//===================================
		// Configuring machine parameters
		//===================================
		configure(config) {
			this.coordinateSystem = config.coordinateSystem;
			this.radius = config.radius;
			this.nozzleDiameter = config.nozzleDiameter;
			this.filamentDiameter = config.filamentDiameter;
			this.baudRate = config.baudRate;
			this.autoConnect = config.autoConnect;
			this._extrusionMultiplier = config.extrusionMultiplier;
			this._defaultExtrusionMultiplier = config.extrusionMultiplier;
			this._retractAmount = config.retractAmount;
			this._defaultRetractAmount = config.retractAmount;
			this._zHopHeight = config.zHopHeight;
			this._defaultZHopHeight = config.zHopHeight;
			this.maxZ = config.maxZ;
			if (config.coordinateSystem == 'delta') {
				this._maxX = (2 * config.radius) / sqrt(2);
				this._maxY = this._maxX;
				this._centerX = 0;
				this._centerY = 0;
			} else {
				this.maxX = config.maxX;
				this.maxY = config.maxY;
			}

			var messageData = {
				coordinateSystem: this.coordinateSystem,
				maxX: this.maxX,
				maxY: this.maxY,
				maxZ: this.maxZ,
				nozzleDiameter: this._nozzleDiameter,
				filamentDiameter: this._filamentDiameter
			};

			window.parent.postMessage({ type: 'fab_config', body: messageData }, '*');
			if (this.cameraPosition) {
				this.setCameraView('home');
			}
		}

		/**
		 * The printer's nozzle diameter in mm. Used to calculate extrusion amounts automatically.
		 *
		 * You can configure the nozzle diameter via `setPrinter()`
		 * or directly to override the preset.
		 * @type {number}
		 * @group Configuration
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 *   fab.setPrinter('ender3', { nozzleDiameter: 0.5 });
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(205, 60);
		 *   const lineLength = 100;
		 *
		 *   fab.retractTo(50, 50, 0);
		 *   fab.extrudeX(lineLength);
		 *   let lastCmd = fab.commands.at(-1);
		 *   console.log(`Extruding ${lastCmd.e}mm with a ${fab.nozzleDiameter}mm nozzle`);
		 *
		 *   // Change nozzle diameter and extrude another line
		 *   fab.nozzleDiameter = 1.0;
		 *   fab.retractTo(50, 100, 0);
		 *   fab.extrudeX(lineLength);
		 *   lastCmd = fab.commands.at(-1);
		 *   console.log(`Extruding ${lastCmd.e}mm with a ${fab.nozzleDiameter}mm nozzle`);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		get nozzleDiameter() {
			return this._nozzleDiameter;
		}

		set nozzleDiameter(d) {
			this._nozzleDiameter = d;
			window.parent.postMessage(
				{ type: 'fab_config', body: { property: 'nozzleDiameter', value: d } },
				'*'
			);
		}

		/**
		 * The filament diameter in mm. Used to calculate extrusion amounts automatically.
		 * Set via `setPrinter()` or assign directly to override the preset.
		 * @type {number}
		 * @group Configuration
		 */
		get filamentDiameter() {
			return this._filamentDiameter;
		}

		set filamentDiameter(d) {
			this._filamentDiameter = d;
			window.parent.postMessage(
				{ type: 'fab_config', body: { property: 'filamentDiameter', value: d } },
				'*'
			);
		}

		set maxX(v) {
			this._maxX = v;
			this._centerX = v / 2;
			window.parent.postMessage({ type: 'fab_config', body: { property: 'maxX', value: v } }, '*');
		}
		/**
		 * The maximum X travel distance of the printer in mm.
		 * Set by the printer profile; assign directly to override.
		 * @type {number}
		 * @group Utilities
		 */
		get maxX() {
			return this._maxX;
		}

		set maxY(v) {
			this._maxY = v;
			this._centerY = v / 2;
			window.parent.postMessage({ type: 'fab_config', body: { property: 'maxY', value: v } }, '*');
		}
		/**
		 * The maximum Y travel distance of the printer in mm.
		 * Set by the printer profile; assign directly to override.
		 * @type {number}
		 * @group Utilities
		 */
		get maxY() {
			return this._maxY;
		}

		set maxZ(v) {
			this._maxZ = v;
			window.parent.postMessage({ type: 'fab_config', body: { property: 'maxZ', value: v } }, '*');
		}
		/**
		 * The maximum Z travel distance of the printer in mm.
		 * Set by the printer profile; assign directly to override.
		 * @type {number}
		 * @group Utilities
		 */
		get maxZ() {
			return this._maxZ;
		}

		/**
		 * The X center of the build plate in mm (`maxX / 2`). Useful for centering prints.
		 * @readonly
		 * @type {number}
		 * @group Utilities
		 */
		get centerX() {
			return this._centerX;
		}

		/**
		 * The Y center of the build plate in mm (`maxY / 2`). Useful for centering prints.
		 * @readonly
		 * @type {number}
		 * @group Utilities
		 */
		get centerY() {
			return this._centerY;
		}

		/**
		 * Current planned X position in mm (local coordinates, before any `translate` offset).
		 * @readonly
		 * @type {number}
		 * @group Utilities
		 */
		get x() {
			return this._plannedPosition.x;
		}

		/**
		 * Current planned Y position in mm (local coordinates, before any `translate` offset).
		 * @readonly
		 * @type {number}
		 * @group Utilities
		 */
		get y() {
			return this._plannedPosition.y;
		}

		/**
		 * Current planned Z position in mm (local coordinates, before any `translate` offset).
		 * @readonly
		 * @type {number}
		 * @group Utilities
		 */
		get z() {
			return this._plannedPosition.z;
		}

		/**
		 * Whether a print is currently in progress.
		 * Useful inside `draw()` to update a visualization or UI while printing.
		 * @readonly
		 * @type {boolean}
		 * @group Utilities
		 */
		get isPrinting() {
			return this._isPrinting;
		}

		/**
		 * The GCode commands generated by the most recent fabDraw() call, as structured objects. Each entry has `.command` (e.g. 'G1', 'M104'), `.fields` (all parameters as a map), and direct lowercase field access (`.x`, `.s`, `.f`, etc.). Cleared and rebuilt each time fabDraw() runs.
		 *
		 * A line of GCode consists of fields that are separated by spaces.
		 * A field can be interpreted as a command, a parameter, or some custom purpose. It typically consists of a letter directly followed by a number. For example, `G1` is a linear move command. For a comprehensive overview of GCode commands, see {@link https://marlinfw.org/meta/gcode/ Marlin's GCode dictionary}.
		 *
		 * @property {string} raw - The original unparsed command string.
		 * @property {string} command - The command code, e.g. `'G1'`, `'M104'`.
		 * @property {Object.<string, number|string>} fields - All parameter fields keyed by
		 *   uppercase letter, e.g. `{ X: 100, Y: 50, E: 0.45, F: 2400 }`.
		 * @property {string|null} comment - Inline comment text after `;`, or `null`.
		 *
		 * Field values are also accessible as direct lowercase properties:
		 * `cmd.x`, `cmd.s`, `cmd.f`, etc. — `undefined` if the field is absent.
		 * G-code commands generated by the most recent `fabDraw()` call, as structured objects.
		 * Each entry has `.command` (e.g. `'G1'`, `'M104'`), `.fields` (all parameters as a map),
		 * and direct lowercase field access (`.x`, `.s`, `.f`, etc.).
		 * Cleared and rebuilt each time `fabDraw()` runs.
		 * @readonly
		 * @type {GCodeCommand[]}
		 * @group Utilities
		 */
		get commands() {
			return this._commands.map((s) => new GCodeCommand(s));
		}

		/**
		 * All generated G-code as a single newline-separated string.
		 * Useful for downloading or logging the full output of `fabDraw()`.
		 * @readonly
		 * @type {string}
		 * @group Utilities
		 */
		get gcode() {
			return this._commands.join('\n');
		}

		/**
		 * Set the extrusion multiplier applied to all subsequent auto-calculated extrusion amounts.
		 * Works like `strokeWeight` in p5.js — set once and it applies to all moves until changed.
		 * Automatically resets to the printer's default value at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Configuration
		 * @param {number} value - Multiplier value (e.g. `1.2` for 20% over-extrusion, `0.8` for bridging).
		 * @example
		 * function fabDraw() {
		 *   fab.moveTo(0, 0, 0.2, 1500);
		 *   fab.extrusionMultiplier(1.2);  // over-extrude first layer
		 *   fab.extrudeTo(100, 0, 0.2, 1500);
		 *   fab.extrusionMultiplier(1);    // reset to normal
		 *   fab.extrudeTo(100, 100, 0.2, 1500);
		 * }
		 */
		extrusionMultiplier(value) {
			this._extrusionMultiplier = value;
		}

		/**
		 * Set the filament retraction distance for `retractTo()` and `retractBy()`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Configuration
		 * @param {number} mm - Retraction distance in mm.
		 */
		retractAmount(mm) {
			this._retractAmount = mm;
		}

		/**
		 * Set the z-hop height for `retractTo()` and `retractBy()`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Configuration
		 * @param {number} mm - Z-hop height in mm.
		 */
		zHopHeight(mm) {
			this._zHopHeight = mm;
		}

		/**
		 * Begins a command group that contains its own printing state.
		 *
		 * By default, printing parameters (e.g., `extrusionMultiplier()`, `speed()`) and
		 * transformations (e.g., `translate()`) apply to all subsequent commands. `push()` and `pop()`
		 * can be used to constrain the effect of print parameters and transformations to a specific group
		 * of commands. The functionality follows `push()` and `pop()` in p5.js.
		 *
		 * `push()` and `pop()` contain the effects of the following functions:
		 *
		 * <ul>
		 * <li>`extrusionMultiplier()`</li>
		 * <li>`speed()`</li>
		 * <li>`translate()`</li>
		 * <li>`retractAmount()`</li>
		 * <li>`zHopHeight()`</li>
		 * </ul>
		 *
		 * @group Structure
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   fab.speed(50);
		 *   const firstLayerHeight = 0.2;
		 *   const diameter = 50;
		 *
		 *   // Draw a circle on the left side of the bed
		 *   fab.circle(fab.maxX/3, fab.centerY, firstLayerHeight, diameter);
		 *
		 *   // Begin a group of commands with different parameters
		 *   fab.push();
		 *
		 *   // Translate to the center of the bed
		 *   fab.translate(fab.centerX, fab.centerY);
		 *
		 *   // Set new printing parameters
		 *   fab.speed(20);
		 *   fab.extrusionMultiplier(2);
		 *
		 *   // Draw a circle using the slower speed and higher extrusion
		 *   fab.circle(0, 0, firstLayerHeight, diameter);
		 *
		 *   // Restore parameters
		 *   fab.pop();
		 *
		 *   // Print a circle on the right side of the bed
		 *   fab.circle(2*fab.maxX/3, fab.centerY, firstLayerHeight, diameter);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		push() {
			this._stateStack.push({
				extrusionMultiplier: this._extrusionMultiplier,
				feedrate: this._plannedPosition.f,
				transformOffset: { ...this._transformOffset },
				retractAmount: this._retractAmount,
				zHopHeight: this._zHopHeight
			});
		}

		/**
		 * Ends a command group that contains its own printing state.
		 *
		 * By default, printing parameters (e.g., `extrusionMultiplier()`, `speed()`) and
		 * transformations (e.g., `translate()`) apply to all subsequent commands. `push()` and `pop()`
		 * can be used to constrain the effect of print parameters and transformations to a specific group
		 * of commands. The functionality follows `push()` and `pop()` in p5.js.
		 *
		 * `push()` and `pop()` contain the effects of the following functions:
		 *
		 * <ul>
		 * <li>`extrusionMultiplier()`</li>
		 * <li>`speed()`</li>
		 * <li>`translate()`</li>
		 * <li>`retractAmount()`</li>
		 * <li>`zHopHeight()`</li>
		 * </ul>
		 *
		 * @group Structure
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   fab.speed(50);
		 *   const firstLayerHeight = 0.2;
		 *   const diameter = 50;
		 *
		 *   // Draw a circle on the left side of the bed
		 *   fab.circle(fab.maxX/3, fab.centerY, firstLayerHeight, diameter);
		 *
		 *   // Begin a group of commands with different parameters
		 *   fab.push();
		 *
		 *   // Translate to the center of the bed
		 *   fab.translate(fab.centerX, fab.centerY);
		 *
		 *   // Set new printing parameters
		 *   fab.speed(20);
		 *   fab.extrusionMultiplier(2);
		 *
		 *   // Draw a circle using the slower speed and higher extrusion
		 *   fab.circle(0, 0, firstLayerHeight, diameter);
		 *
		 *   // Restore parameters
		 *   fab.pop();
		 *
		 *   // Print a circle on the right side of the bed
		 *   fab.circle(2*fab.maxX/3, fab.centerY, firstLayerHeight, diameter);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		pop() {
			const state = this._stateStack.pop();
			if (!state) return;
			this._extrusionMultiplier = state.extrusionMultiplier;
			this._transformOffset = state.transformOffset;
			this._retractAmount = state.retractAmount;
			this._zHopHeight = state.zHopHeight;
			if (parseFloat(this._plannedPosition.f) !== parseFloat(state.feedrate)) {
				this.speed(parseFloat(state.feedrate) / 60.0);
			}
		}

		/**
		 * Offset the coordinate origin for all subsequent moves by `(dx, dy, dz)`.
		 * Offsets accumulate — a second `translate` adds to the first.
		 * Use `push()` / `pop()` to scope a translation to a specific region.
		 * @group Motion
		 * @param {number} dx - X offset in mm.
		 * @param {number} dy - Y offset in mm.
		 * @param {number} [dz=0] - Z offset in mm.
		 * @example
		 * function fabDraw() {
		 *   for (let i = 0; i < 3; i++) {
		 *     fab.push();
		 *     fab.translate(i * 60, 0);
		 *     fab.moveTo(0, 0, 0.2, 3000);
		 *     fab.extrudeTo(50, 0, 0.2, 1500);
		 *     fab.extrudeTo(50, 50, 0.2, 1500);
		 *     fab.extrudeTo(0, 50, 0.2, 1500);
		 *     fab.extrudeTo(0, 0, 0.2, 1500);
		 *     fab.pop();
		 *   }
		 * }
		 */
		translate(dx, dy, dz = 0) {
			this._transformOffset.x += parseFloat(dx);
			this._transformOffset.y += parseFloat(dy);
			this._transformOffset.z += parseFloat(dz);
		}

		/**
		 * Configure the fab instance for a specific printer preset, with optional overrides.
		 * @group Setup
		 * @param {string} name - Printer preset name (e.g. `'ender3'`, `'prusa'`).
		 * @param {Object} [overrides={}] - Optional settings to override the preset (e.g. `{ nozzleDiameter: 0.4 }`).
		 * @example
		 * function setup() {
		 *   fab = new Fab();
		 *   fab.setPrinter('ender3', { nozzleDiameter: 0.4 });
		 * }
		 */
		setPrinter(name, overrides = {}) {
			const preset = printerPresets[name];
			if (!preset) {
				const available = Object.keys(printerPresets).join(', ');
				window.parent.postMessage(
					{
						type: 'output',
						body: `p5.fab says: unknown printer preset "${name}". Available: ${available}`
					},
					'*'
				);
				return;
			}
			this.configure({ ...defaultPrinterSettings, ...preset, ...overrides });
			window.parent.postMessage(
				{ type: 'fab_config', body: { property: 'printerName', value: name } },
				'*'
			);
		}

		setupSerialConnection() {
			this.serial = new p5.WebSerial();
			this.serial.setLineEnding('\n');
			this.serialResp = '';
			this.callbacks = {};
			this.connected = false;

			this.serial.on('portavailable', function () {
				_fab.serial.open({ baudRate: _fab.baudRate });
			});

			this.serial.on('requesterror', function () {
				_error('p5.fab: serial connection request failed.');
			});

			this.serial.on('data', this.onData);

			this.serial.on('open', function () {
				_fab.connected = true;
				window.parent.postMessage(
					{
						type: 'fab_status',
						body: { event: 'connection', connected: true }
					},
					'*'
				);
				_fab.serial.write('M114\n');
				_fab.tempQueryIntervalID = setInterval(() => {
					if (!_fab.isPrinting) {
						_fab.serial.write('M105\n');
						_fab.serial.write('M114\n');
					}
				}, 2000);
			});

			this.serial.on('close', function () {
				_fab.connected = false;
				window.parent.postMessage(
					{
						type: 'fab_status',
						body: { event: 'connection', connected: false }
					},
					'*'
				);
				clearInterval(_fab.tempQueryIntervalID);
				_fab.tempQueryIntervalID = null;
			});

			if (this.autoConnect) {
				Promise.resolve(this.serial.getPorts()).catch(() => {});
			}

			this.on('ok', this.serial_ok);
		}

		enqueue(cmd) {
			this._commands.push(cmd);
		}

		print() {
			if (this.isPrinting) {
				window.parent.postMessage(
					{
						type: 'fab_status',
						body: { event: 'print_error', reason: 'already_printing' }
					},
					'*'
				);
				return;
			}
			if (this._commands.length === 0) {
				window.parent.postMessage(
					{
						type: 'fab_status',
						body: { event: 'print_error', reason: 'no_commands' }
					},
					'*'
				);
				return;
			}
			if (this.syncVizStream) {
				this._commandStream = this._commands.slice();
				this.syncVizStream = false;
			}

			if (this._commandStream.length > 0) {
				this._isPrinting = true;
				window.parent.postMessage({ type: 'fab_status', body: { event: 'print_start' } }, '*');
				const cmd = this._commandStream[0];
				this.serial.write(cmd + '\n');
				this._postPositionFromCmd(cmd);
				this._commandStream.shift();
			} else {
				this._isPrinting = false;
				this.syncVizStream = true;
				window.parent.postMessage({ type: 'fab_status', body: { event: 'print_complete' } }, '*');
			}
		}

		printStream() {
			// TODO: Do I need print() and printStream()?
			if (this._commandStream.length > 0) {
				this._isPrinting = true;
				const cmd = this._commandStream[0];
				this.serial.write(cmd + '\n');
				this._postPositionFromCmd(cmd);
				this._commandStream.shift();
			} else {
				this._isPrinting = false;
				window.parent.postMessage({ type: 'fab_status', body: { event: 'print_complete' } }, '*');
			}
		}

		on(event, cb) {
			if (!this.callbacks[event]) this.callbacks[event] = [];
			this.callbacks[event].push(cb);
		}

		emit(event, data) {
			let cbs = this.callbacks[event];
			if (cbs) {
				cbs.forEach((cb) => cb(data));
			}
		}

		serial_ok(g) {
			g.printStream();
		}

		_postPositionFromCmd(cmd) {
			if (!/^G[01]\b/.test(cmd)) return;
			const body = { event: 'position' };
			const xMatch = cmd.match(/X([\d.-]+)/);
			const yMatch = cmd.match(/Y([\d.-]+)/);
			const zMatch = cmd.match(/Z([\d.-]+)/);
			if (xMatch) body.x = parseFloat(xMatch[1]);
			if (yMatch) body.y = parseFloat(yMatch[1]);
			if (zMatch) body.z = parseFloat(zMatch[1]);
			if (xMatch || yMatch || zMatch) {
				window.parent.postMessage({ type: 'fab_status', body }, '*');
			}
		}

		onData = () => {
			this.serialResp += this.serial.readString();

			if (this.serialResp.slice(-1) !== '\n') return;

			const lines = this.serialResp
				.split('\n')
				.map((l) => l.trim())
				.filter((l) => l.length > 0);
			this.serialResp = '';

			for (const line of lines) {
				if (line.includes('ok') && this.isPrinting) {
					this.emit('ok', this);
				}

				if (line.includes(' Count ')) {
					this.updateReportedPosition(line.split(' Count ')[0].trim());
				}

				if (line.includes('T:') && line.includes('B:')) {
					const nozzleMatch = line.match(/T:([\d.]+)/);
					const bedMatch = line.match(/B:([\d.]+)/);
					const tempBody = {};
					if (nozzleMatch) tempBody.nozzle = parseFloat(nozzleMatch[1]);
					if (bedMatch) tempBody.bed = parseFloat(bedMatch[1]);
					if (nozzleMatch || bedMatch) {
						window.parent.postMessage(
							{ type: 'fab_status', body: { event: 'temp', ...tempBody } },
							'*'
						);
					}
				}
			}
		};

		updateReportedPosition(resp) {
			resp.split(' ').forEach((item) => {
				if (item.includes('X:')) {
					this.reportedPos['X'] = item.split(':')[1];
				}
				if (item.includes('Y:')) {
					this.reportedPos['Y'] = item.split(':')[1];
				}
				if (item.includes('Z:')) {
					this.reportedPos['Z'] = item.split(':')[1];
				}
			});

			if (!this.gotInitPosition) {
				this._plannedPosition.x = this.reportedPos['X'];
				this._plannedPosition.y = this.reportedPos['Y'];
				this._plannedPosition.z = this.reportedPos['Z'];
				this.lastAsyncPosition.x = this.reportedPos['X'];
				this.lastAsyncPosition.y = this.reportedPos['Y'];
				this.lastAsyncPosition.z = this.reportedPos['Z'];
				this.gotInitPosition = true;
			}

			window.parent.postMessage(
				{
					type: 'fab_status',
					body: {
						event: 'position',
						x: parseFloat(this.reportedPos['X']),
						y: parseFloat(this.reportedPos['Y']),
						z: parseFloat(this.reportedPos['Z'])
					}
				},
				'*'
			);
		}

		parseGcode() {
			this.vertices = [];
			this._commands.forEach((cmd) => {
				let fullcommand = cmd;
				cmd = cmd.trim().split(' ');
				var code = cmd[0].substring(0, 2);
				if (code !== 'G0' && code !== 'G1') {
					// G0&1 are move commands. add G2&3 later.
					return;
				}
				var newV = new p5.Vector();
				let vertexData = {
					command: code,
					vertex: newV,
					full: fullcommand
				};

				/****
             *  parse gcode
             *  Ender coordinate system
                    7 +Z
                   /
                  /
                  +-----------> +X
                  |
                  |
                  |
                  V +Y

                p5 WEBGL coordinate system
                    7 +Y
                   /
                  /
                  +-----------> +X
                  |
                  |
                  |
                  V -Z

             */
				cmd.forEach((c) => {
					const val = c.substring(1);
					switch (c.charAt(0)) {
						case 'X':
							newV.x = val;
							break;
						case 'Y':
							newV.z = val; // switch z-y
							break;
						case 'Z':
							newV.y = -1 * val; // switch z-y
							break;
						case 'E':
							if (val < 0) {
								newV = null;
								return;
							}
						case ';':
							if (val == 'prime' || val == 'present') {
								// || val == 'intro' to remove intro line
								newV = null;
								return;
							}
					}
				});

				if (newV) {
					this.vertices.push(vertexData);
				}
			});
		}

		async parseGcodeAsync() {
			const generation = ++this._parseGeneration;
			this._parsingGcode = true;
			window.parent.postMessage({ type: 'parsing_start' }, '*');

			const commands = this._commands.slice();
			const vertices = [];
			const CHUNK = 1000;

			for (let i = 0; i < commands.length; i += CHUNK) {
				if (this._parseGeneration !== generation) return;

				const end = Math.min(i + CHUNK, commands.length);
				for (let j = i; j < end; j++) {
					let fullcommand = commands[j];
					let cmd = fullcommand.trim().split(' ');
					const code = cmd[0].substring(0, 2);
					if (code !== 'G0' && code !== 'G1') continue;

					let newV = new p5.Vector();
					let vertexData = { command: code, vertex: newV, full: fullcommand };
					let skip = false;

					cmd.forEach((c) => {
						const val = c.substring(1);
						switch (c.charAt(0)) {
							case 'X':
								newV.x = val;
								break;
							case 'Y':
								newV.z = val;
								break;
							case 'Z':
								newV.y = -1 * val;
								break;
							case 'E':
								if (val < 0) {
									newV = null;
									skip = true;
								}
								break;
							case ';':
								if (val == 'prime' || val == 'present') {
									newV = null;
									skip = true;
								}
								break;
						}
					});

					if (newV && !skip) vertices.push(vertexData);
				}

				if (end < commands.length) {
					await new Promise((r) => requestAnimationFrame(r));
				}
			}

			if (this._parseGeneration !== generation) return;

			this.vertices = vertices;
			this.model = null;
			this._parsingGcode = false;
			window.parent.postMessage({ type: 'parsing_complete' }, '*');
		}

		/**
		 * Render a 3D preview of the planned toolpath. Call this inside a WEBGL p5.js `draw()` loop.
		 * @group Utilities
		 * @example
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		render() {
			if (!this._cameraInitialized) return;
			if (this._needsCameraReInit) {
				this.camera = createCamera();
				this._needsCameraReInit = false;
			}
			perspective(PI / 3, width / height, 0.1, 10000);
			if (this.coordinateSystem == 'delta') {
				this.drawDeltaPrinter();
			} else {
				this.drawCartesianPrinter();
			}

			if (this._parsingGcode) {
				if (this.model) {
					stroke(0);
					strokeWeight(this.lineWeight);
					model(this.model);
				}
			} else if (!this.model) {
				const _verts = this.vertices;
				const _lw = this.lineWeight;
				this.model = buildGeometry(() => {
					stroke(0);
					strokeWeight(_lw);
					noFill();
					let pos = createVector(0, 0, 0);
					for (let v in _verts) {
						v = parseInt(v);
						const vd = _verts[v];
						if (vd.command === 'G1') {
							line(pos.x, pos.y, pos.z, vd.vertex.x, vd.vertex.y, vd.vertex.z);
						}
						if (vd.command === 'G0' || vd.command === 'G1') {
							pos.set(vd.vertex.x, vd.vertex.y, vd.vertex.z);
						}
					}
				});
			} else {
				stroke(0);
				strokeWeight(this.lineWeight);
				model(this.model);
			}
			pop();

			// Update camera position & orientation
			if (this.recoverCameraPosition) {
				// Reset upY in case orbitControl flipped it by crossing the north pole
				this.camera.upY = 1;
				this.camera.setPosition(
					this.cameraPosition.x,
					this.cameraPosition.y,
					this.cameraPosition.z
				);
				this.recoverCameraPosition = false;
				this.camera.lookAt(
					this.cameraOrientation.x,
					this.cameraOrientation.y,
					this.cameraOrientation.z
				);
			}

			this.cameraPosition.x = this.camera.eyeX;
			this.cameraPosition.y = this.camera.eyeY;
			this.cameraPosition.z = this.camera.eyeZ;
			this.cameraOrientation.x = this.camera.centerX;
			this.cameraOrientation.y = this.camera.centerY;
			this.cameraOrientation.z = this.camera.centerZ;
		}

		/**
		 * Snap the camera to an axis-aligned view.
		 * @param {'home'|'top'|'front'|'side'} view
		 */
		setCameraView(view) {
			const d = Math.max(this.maxX, this.maxY, this.maxZ) * 2;
			// Horizontal scene center in world space (same for all views):
			//   T3 brings bed center to origin, T2/R2/R3 are trivial there,
			//   then S*R*T1 gives cx=0, cz=-maxY.
			const cx = 0;
			const cz = -this.maxY;
			// Vertical centers differ by view:
			//   cy_bed  = bed surface level (0.25*maxZ) — used for top view
			//   cy_mid  = work-envelope midpoint (~-0.25*maxZ) — used for front/side
			const cy_bed = 0.25 * this.maxZ;
			const cy_mid = -0.25 * this.maxZ;

			if (view === 'home') {
				this.cameraOrientation.set(cx, cy_mid, cz);
				this.cameraPosition.set(cx + d * 0.3, cy_mid + d * -0.25, cz + d * 0.95);
			} else if (view === 'top') {
				// Steep top-down view with slight +Z tilt so the look direction is never
				// parallel to the default up vector (0,1,0), avoiding gimbal lock. ~81° elevation.
				this.cameraOrientation.set(cx, cy_bed, cz);
				this.cameraPosition.set(cx, cy_bed - d * 0.99, cz + d * 0.14);
			} else if (view === 'front') {
				this.cameraOrientation.set(cx, cy_mid, cz);
				this.cameraPosition.set(cx, cy_mid, cz + d);
			} else if (view === 'side') {
				this.cameraOrientation.set(cx, cy_mid, cz);
				this.cameraPosition.set(cx + d, cy_mid, cz);
			} else if (view === 'back') {
				this.cameraOrientation.set(cx, cy_mid, cz);
				this.cameraPosition.set(cx, cy_mid, cz - d);
			} else if (view === 'left') {
				this.cameraOrientation.set(cx, cy_mid, cz);
				this.cameraPosition.set(cx - d, cy_mid, cz);
			} else if (view === 'bottom') {
				this.cameraOrientation.set(cx, cy_bed, cz);
				this.cameraPosition.set(cx, cy_bed + d * 0.99, cz + d * 0.14);
			} else {
				return;
			}
			this.recoverCameraPosition = true;
		}

		drawCartesianPrinter() {
			orbitControl(2, 2, 1);

			translate(-this.maxX / 2, 0.25 * this.maxZ, -this.maxY / 2);
			rotateY(PI);
			scale(-1, 1);
			push();
			translate(this.maxX / 2, 0, this.maxY / 2);
			// rotateY(PI / 12);
			// rotateX(PI / 12);
			fill(254, 249, 152);
			push();
			translate(0, 2.5, 0);
			box(this.maxX + 1, 5, this.maxY + 1); // build plate
			pop();

			push();
			noFill();
			translate(0, -this.maxZ / 2 + 1, 0);
			stroke(220, 50, 32);
			box(this.maxX, this.maxZ, this.maxY); // work envelope
			pop();

			noFill();
			stroke(0);
			translate(-this.maxX / 2, 0, -this.maxY / 2);
		}

		drawDeltaPrinter() {
			orbitControl(2, 2, 1);

			translate(-this.radius, 0, -this.radius);
			rotateY(PI);
			scale(-1, 1);
			push();
			translate(this.radius, 0, this.radius);
			rotateY(PI / 12);
			rotateX(PI / 12);
			fill(254, 249, 152);
			push();
			translate(0, 2.5, 0);
			cylinder(this.radius + 1, 5); // build plate
			pop();

			push();
			noFill();
			translate(0, -this.maxZ / 2 + 1, 0);
			stroke(220, 50, 32);
			box((2 * this.radius) / sqrt(2), this.maxZ, (2 * this.radius) / sqrt(2)); // work envelope
			pop();

			// not sure if needed
			noFill();
			stroke(0);
		}

		/*****
		 * G-Code Commands
		 */
		/**
		 * Home all axes and reset the extruder position.
		 * @group Print control
		 * @example
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 * }
		 */
		autoHome() {
			const cmd = 'G28';
			this.enqueue(cmd);
			this.enqueue('G92 E0');

			return cmd;
		}

		/**
		 * Set nozzle and bed temperatures and wait for both to be reached before continuing.
		 * @group Temperature
		 * @param {number} tNozzle - Target nozzle temperature in °C.
		 * @param {number} tBed - Target bed temperature in °C.
		 * @example
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 * }
		 */
		setTemps(tNozzle, tBed) {
			let cmd = `M104 S${tNozzle}`; // set nozzle temp without waiting
			this.enqueue(cmd);

			cmd = `M140 S${tBed}`; // set bed temp without waiting
			this.enqueue(cmd);

			// now wait for both
			cmd = `M109 S${tNozzle}`;
			this.enqueue(cmd);
			cmd = `M190 S${tBed}`;
			this.enqueue(cmd);

			return cmd;
		}

		/**
		 * Set the nozzle temperature and wait for it to be reached before continuing.
		 * @group Temperature
		 * @param {number} t - Target nozzle temperature in °C.
		 */
		setNozzleTemp(t) {
			const cmd = `M109 S${t}`;
			this.enqueue(cmd);
			return cmd;
		}

		/**
		 * Set the bed temperature and wait for it to be reached before continuing.
		 * @group Temperature
		 * @param {number} t - Target bed temperature in °C.
		 */
		setBedTemp(t) {
			const cmd = `M190 S${t}`;
			this.enqueue(cmd);
			return cmd;
		}

		setAbsolutePosition() {
			this.relativePositioning = false;
			const cmd = 'G90';
			this.enqueue(cmd);
		}

		setAbsolutePositionXYZ() {
			// For Marlin, G90 sets extruder to absolute https://marlinfw.org/docs/gcode/G090.html
			// Duet doesn't https://docs.duet3d.com/en/User_manual/Reference/Gcodes
			// Send an M83 to keep extruder in relative mode.
			this.relativePositioning = false;
			this.setAbsolutePosition();
			this.setERelative();
		}

		setRelativePosition() {
			this.relativePositioning = true;
			const cmd = 'G91';
			this.enqueue(cmd);
		}

		setERelative() {
			const cmd = 'M83';
			this.enqueue(cmd);
		}

		/**
		 * Turn the part cooling fan on at full speed.
		 * @group Print control
		 */
		fanOn() {
			const cmd = 'M106';
			this.enqueue(cmd);
		}

		/**
		 * Turn the part cooling fan off.
		 * @group Print control
		 */
		fanOff() {
			const cmd = 'M107';
			this.enqueue(cmd);
		}

		/**
		 * Pause the print for a given duration.
		 * @group Print control
		 * @param {number|null} [t=null] - Duration in seconds. Defaults to 10s if not provided.
		 */
		pausePrint(t = null) {
			const cmd = t ? `M1 S${t}` : 'M1 S10 this is a pause';
			this._commandStream.unshift(cmd);
		}

		/**
		 * Immediately stop the print and clear the command queue.
		 * @group Print control
		 */
		stopPrint() {
			this._commandStream = [];
			this._isPrinting = false;
			fabDraw();
		}

		restartPrinter() {
			const cmd = 'M999';
			this.enqueue(cmd);
			this.print();
		}

		/**
		 * Print a priming line along the left edge of the bed to prepare the extruder.
		 * @group Print control
		 * @param {number} [z=0.3] - Layer height for the intro line in mm.
		 */
		introLine(z = 0.3) {
			this.setAbsolutePositionXYZ();
			this.moveTo(5, 20, z, 25);
			this.moveExtrude(5, 200, z, 25);
			this.moveTo(8, 200, z, 25);
			this.moveExtrude(8, 20, z, 25);
		}

		presentPart() {
			this.moveToY(180, 60);
		}

		waitCommand() {
			var cmd = 'M400';
			this.enqueue(cmd);
		}

		getPos() {
			const cmd = 'M114 D';
			this.enqueue(cmd);
		}

		setPos() {
			const cmd = `G92 X${this._plannedPosition.x} Y${this._plannedPosition.y} Z${this._plannedPosition.z} E${this._plannedPosition.e}`;
			this.enqueue(cmd);
			return cmd;
		}

		autoReportPos(t = 10) {
			// currently not working
			this.add('AUTO_REPORT_POSITION');
			t = parseInt(t);
			var cmd = `M154 S${t}`;
			this.enqueue(cmd);
		}

		//===================================
		// Path Commands
		//===================================
		updateAsyncPosition({ x = null, y = null, z = null, e = null, v = null, comment = '' } = {}) {
			this.lastAsyncPosition = { ...this._plannedPosition };
			if (!this.relativePositioning) {
				if (x !== null) {
					this._plannedPosition.x = parseFloat(x).toFixed(2);
				}
				if (y !== null) {
					this._plannedPosition.y = parseFloat(y).toFixed(2);
				}
				if (z !== null) {
					this._plannedPosition.z = parseFloat(z).toFixed(2);
				}
			} else {
				if (x !== null) {
					this._plannedPosition.x = (parseFloat(this._plannedPosition.x) + parseFloat(x)).toFixed(
						2
					);
				}
				if (y !== null) {
					this._plannedPosition.y = (parseFloat(this._plannedPosition.y) + parseFloat(y)).toFixed(
						2
					);
				}
				if (z !== null) {
					this._plannedPosition.z = (parseFloat(this._plannedPosition.z) + parseFloat(z)).toFixed(
						2
					);
				}
			}

			// E is relative
			if (e) {
				// CHANGED THIS TO toFixed(4) instead of 2
				this._plannedPosition.e = parseFloat(e).toFixed(4);
			} else {
				this._plannedPosition.e = 0;
			}

			if (v) {
				const f = this.mm_sec_to_mm_min(v);
				this._plannedPosition.f = parseFloat(f).toFixed(2);
			}

			if (comment) {
				this._plannedPosition.c = `;${comment}`;
			} else {
				this._plannedPosition.c = '';
			}
		}

		_moveXYZE({
			x = null,
			y = null,
			z = null,
			e = null,
			isExtrude = false,
			v = null,
			comment = null
		} = {}) {
			this.updateAsyncPosition({ x, y, z, v, comment });

			// Apply transform offset to get actual G-code output coordinates.
			// Null axes mean "don't move this axis" — use the last known physical position
			// so that E-only or Z-only moves (retract, z-hop, prime) don't drag XY when
			// a translate() offset is active.
			const gcodeX =
				x !== null
					? (parseFloat(this._plannedPosition.x) + this._transformOffset.x).toFixed(2)
					: this._lastGcodePosition.x.toFixed(2);
			const gcodeY =
				y !== null
					? (parseFloat(this._plannedPosition.y) + this._transformOffset.y).toFixed(2)
					: this._lastGcodePosition.y.toFixed(2);
			const gcodeZ =
				z !== null
					? (parseFloat(this._plannedPosition.z) + this._transformOffset.z).toFixed(2)
					: this._lastGcodePosition.z.toFixed(2);

			// Compute E from the physical distance traveled (gcode space), applying extrusionMultiplier.
			// If the user passes an explicit e value, use it as-is (no multiplier applied).
			if (isExtrude && e === null) {
				const dist = sqrt(
					(parseFloat(gcodeX) - this._lastGcodePosition.x) ** 2 +
						(parseFloat(gcodeY) - this._lastGcodePosition.y) ** 2 +
						(parseFloat(gcodeZ) - this._lastGcodePosition.z) ** 2
				);
				e = parseFloat(
					(
						dist *
						(this._nozzleDiameter / 2 / (this._filamentDiameter / 2)) ** 2 *
						this._extrusionMultiplier
					).toFixed(4)
				);
			}

			this._plannedPosition.e = e !== null ? parseFloat(e).toFixed(4) : 0;

			this._lastGcodePosition.x = parseFloat(gcodeX);
			this._lastGcodePosition.y = parseFloat(gcodeY);
			this._lastGcodePosition.z = parseFloat(gcodeZ);

			const moveType = isExtrude || e !== null ? 'G1' : 'G0';
			this.setAbsolutePositionXYZ();
			const cmd = `${moveType} X${gcodeX} Y${gcodeY} Z${gcodeZ} E${this._plannedPosition.e} F${this._plannedPosition.f} ${this._plannedPosition.c} `;
			this.enqueue(cmd);
			return cmd;
		}

		/**
		 * Move to an absolute XYZ position without extruding.
		 * @group Motion
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {string} [comment] - Optional G-code comment appended to the command.
		 * @example
		 * function fabDraw() {
		 *   fab.moveTo(100, 100, 5, 3000);
		 * }
		 */
		moveTo(x, y, z, v, comment) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x: x, y: y, z: z, v: v, comment: comment });
		}

		/**
		 * Move relative to the current position without extruding.
		 * @group Motion
		 * @param {number} dx - Distance to move in X in mm.
		 * @param {number} dy - Distance to move in Y in mm.
		 * @param {number} dz - Distance to move in Z in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @example
		 * function fabDraw() {
		 *   fab.move(10, 0, 0, 3000); // move 10mm in X
		 * }
		 */
		move(dx, dy, dz, v) {
			this.setRelativePosition();
			this._moveXYZE({ x: dx, y: dy, z: dz, v: v });
		}

		/**
		 * Move to an absolute XYZ position while extruding filament.
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`.
		 * Pass an explicit `e` value in mm to override the auto-calculation entirely.
		 * @group Extrusion
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 *   fab = createFab();
		 *   fab.setPrinter('ender3');
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   fab.moveTo(0, 0, 0.2, 1500);
		 *   fab.extrudeTo(100, 0, 0.2, 1500);
		 *   fab.extrudeTo(100, 100, 0.2, 1500);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		extrudeTo(x, y, z, v, e = null) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x, y, z, e, isExtrude: true, v });
		}

		/**
		 * Move a relative distance in XYZ while extruding filament.
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`.
		 * Pass an explicit `e` value in mm to override the auto-calculation entirely.
		 * @group Extrusion
		 * @param {number} dx - Distance to move in X in mm.
		 * @param {number} dy - Distance to move in Y in mm.
		 * @param {number} dz - Distance to move in Z in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @example
		 * function fabDraw() {
		 *   fab.moveTo(0, 0, 0.2, 1500);
		 *   fab.extrude(100, 0, 0, 1500); // extrude 100mm in X
		 *   fab.extrude(0, 100, 0, 1500); // extrude 100mm in Y
		 * }
		 */
		extrude(dx, dy, dz, v, e = null) {
			this.setRelativePosition();
			this._moveXYZE({ x: dx, y: dy, z: dz, e, isExtrude: true, v });
		}

		/** @deprecated Use `extrudeTo()` instead. */
		moveExtrude(x, y, z, v, e = null) {
			window.parent.postMessage(
				{ type: 'output', body: 'p5.fab: moveExtrude() is deprecated — use extrudeTo() instead.' },
				'*'
			);
			this.extrudeTo(x, y, z, v, e);
		}

		/**
		 * Travel to an absolute XYZ position with a filament retraction, z-hop, and re-prime.
		 * Use this to travel between disconnected extrusion paths without stringing.
		 * Retract distance and z-hop height are set by `retractAmount()` and `zHopHeight()`.
		 * @group Motion
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @example
		 * function fabDraw() {
		 *   fab.extrudeTo(50, 50, 0.2, 1500);
		 *   fab.retractTo(100, 100, 0.2, 3000); // travel without stringing
		 *   fab.extrudeTo(150, 50, 0.2, 1500);
		 * }
		 */
		retractTo(x, y, z, v) {
			this.moveE(-1 * this._retractAmount);
			this.moveZ(this._zHopHeight);
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x, y, z, v });
			this.prime(this._retractAmount);
			this.moveZ(-this._zHopHeight);
		}

		/**
		 * Travel a relative XYZ distance with a filament retraction, z-hop, and re-prime.
		 * Use this to travel between disconnected extrusion paths without stringing.
		 * Retract distance and z-hop height are set by `retractAmount()` and `zHopHeight()`.
		 * @group Motion
		 * @param {number} dx - Distance to move in X in mm.
		 * @param {number} dy - Distance to move in Y in mm.
		 * @param {number} dz - Distance to move in Z in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @example
		 * function fabDraw() {
		 *   fab.extrudeTo(50, 50, 0.2, 1500);
		 *   fab.retractBy(50, 50, 0, 3000); // travel 50mm in X and Y without stringing
		 *   fab.extrudeTo(150, 50, 0.2, 1500);
		 * }
		 */
		retractBy(dx, dy, dz, v) {
			this.moveE(-1 * this._retractAmount);
			this.moveZ(this._zHopHeight);
			this.setRelativePosition();
			this._moveXYZE({ x: dx, y: dy, z: dz, v });
			this.prime(this._retractAmount);
			this.moveZ(-this._zHopHeight);
		}

		/** @deprecated Use `retractTo()` instead. */
		moveRetract(x, y, z, v, e = 8) {
			window.parent.postMessage(
				{ type: 'output', body: 'p5.fab: moveRetract() is deprecated — use retractTo() instead.' },
				'*'
			);
			this.retractTo(x, y, z, v);
		}

		/**
		 * Move to an absolute position with a 2mm z-hop over the travel path.
		 * @group Motion
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @example
		 * function fabDraw() {
		 *   fab.travelTo(100, 100, 0.2, 3000);
		 * }
		 */
		travelTo(x, y, z, v) {
			this.move(0, 0, 2);
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x: x, y: y, z: z, v: v });
			this.move(0, 0, -2);
		}

		/**
		 * Move to an absolute X position without extruding.
		 * @group Motion
		 * @param {number} x - Target X position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveToX(x, v) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x: x, v: v });
		}

		/**
		 * Move to an absolute Y position without extruding.
		 * @group Motion
		 * @param {number} y - Target Y position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveToY(y, v) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ y: y, v: v });
		}

		/**
		 * Move to an absolute Z position without extruding.
		 * @group Motion
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveToZ(z, v) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ z: z, v: v });
		}

		/**
		 * Move the extruder to an absolute E position.
		 * @group Motion
		 * @param {number} e - Target E position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveToE(e, v) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ e: e, v: v });
		}

		/**
		 * Move a relative distance in X without extruding.
		 * @group Motion
		 * @param {number} dx - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveX(dx, v) {
			this.setRelativePosition();
			this._moveXYZE({ x: dx, v });
		}

		/**
		 * Move a relative distance in Y without extruding.
		 * @group Motion
		 * @param {number} dy - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveY(dy, v) {
			this.setRelativePosition();
			this._moveXYZE({ y: dy, v });
		}

		/**
		 * Move a relative distance in Z without extruding.
		 * @group Motion
		 * @param {number} dz - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveZ(dz, v) {
			this.setRelativePosition();
			this._moveXYZE({ z: dz, v });
		}

		/**
		 * Move the extruder a relative distance in E.
		 * @group Motion
		 * @param {number} de - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveE(de, v) {
			this.setRelativePosition();
			this._moveXYZE({ e: de, v: v });
		}

		/**
		 * Move a relative distance in X while extruding.
		 * @group Extrusion
		 * @param {number} dx - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function fabDraw() {
		 *   fab.extrudeX(50, 1500); // extrude a 50mm line in X
		 * }
		 */
		extrudeX(dx, v, e = null, comment = '') {
			this.setRelativePosition();
			this._moveXYZE({ x: dx, e, isExtrude: true, v, comment });
		}

		/**
		 * Move a relative distance in X and Y while extruding.
		 * @group Extrusion
		 * @param {number} dx - Distance to move in X in mm.
		 * @param {number} dy - Distance to move in Y in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function fabDraw() {
		 *   fab.extrudeXY(30, 40, 1500); // extrude diagonally
		 * }
		 */
		extrudeXY(dx, dy, v, e = null, comment = '') {
			this.setRelativePosition();
			this._moveXYZE({ x: dx, y: dy, e, isExtrude: true, v, comment });
		}

		/**
		 * Move a relative distance in Y while extruding.
		 * @group Extrusion
		 * @param {number} dy - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 */
		extrudeY(dy, v, e = null) {
			this.setRelativePosition();
			this._moveXYZE({ y: dy, e, isExtrude: true, v });
		}

		/**
		 * Move a relative distance in Z while extruding.
		 * @group Extrusion
		 * @param {number} dz - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 */
		extrudeZ(dz, v, e = null) {
			this.setRelativePosition();
			this._moveXYZE({ z: dz, e, isExtrude: true, v });
		}

		/**
		 * Move to an absolute X position while extruding.
		 * @group Extrusion
		 * @param {number} x - Target X position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 */
		extrudeToX(x, v, e = null, comment = '') {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x, e, isExtrude: true, v, comment });
		}

		/**
		 * Move to an absolute Y position while extruding.
		 * @group Extrusion
		 * @param {number} y - Target Y position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 */
		extrudeToY(y, v, e = null, comment = '') {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ y, e, isExtrude: true, v, comment });
		}

		/**
		 * Move to an absolute XY position while extruding.
		 * @group Extrusion
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function fabDraw() {
		 *   fab.extrudeToXY(100, 100, 1500); // extrude to absolute position
		 * }
		 */
		extrudeToXY(x, y, v, e = null, comment = '') {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x, y, e, isExtrude: true, v, comment });
		}

		/**
		 * Move to an absolute Z position while extruding.
		 * @group Extrusion
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 */
		extrudeToZ(z, v, e = null, comment = '') {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ z, e, isExtrude: true, v, comment });
		}

		/**
		 * Extrude a circle centered at (x, y) at the given Z height.
		 * @group Utilities
		 * @param {number} x - Center X position in mm.
		 * @param {number} y - Center Y position in mm.
		 * @param {number} z - Z height in mm.
		 * @param {number} d - Diameter in mm.
		 * @param {number} [v] - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount per segment. Calculated automatically if null.
		 * @example
		 * function fabDraw() {
		 *   fab.circle(110, 110, 0.2, 20, 1500);
		 * }
		 */
		circle(x, y, z, d, v, e = null) {
			const r = d / 2;
			const segments = Math.max(16, Math.ceil(Math.PI * d));
			this.retractTo(x + r, y, z, v);
			for (let i = 1; i <= segments; i++) {
				const angle = (i / segments) * Math.PI * 2;
				this.extrudeToXY(x + r * Math.cos(angle), y + r * Math.sin(angle), v, e);
			}
		}

		/**
		 * Set the feedrate for subsequent moves. Persistent — applies to all moves until changed, like `strokeWeight()` in p5.js.
		 * @group Configuration
		 * @param {number} v - Feedrate in mm/sec.
		 */
		speed(v) {
			this._moveXYZE({ v: v });
		}

		/** @deprecated Use `speed()` instead. */
		setSpeed(v) {
			window.parent.postMessage(
				{ type: 'output', body: 'p5.fab: setSpeed() is deprecated — use speed() instead.' },
				'*'
			);
			this.speed(v);
		}

		/**
		 * Prime the extruder by pushing filament forward. Used after a retraction.
		 * @group Utilities
		 * @param {number} de - Amount to prime in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		prime(de, v) {
			// To prime after a retraction, add ;prime comment to filter in rendering
			this.setRelativePosition();
			this._moveXYZE({ e: de, v: v });
		}

		/**
		 * Set the maximum acceleration for each axis.
		 * @group Configuration
		 * @param {number} x - Max X acceleration in mm/s².
		 * @param {number} y - Max Y acceleration in mm/s².
		 * @param {number} z - Max Z acceleration in mm/s².
		 */
		setMaxAcceleration(x, y, z) {
			var cmd = `M201 X${x} Y${y} Z${z};`;
			this.enqueue(cmd);
		}

		/**
		 * Set the starting acceleration for print moves.
		 * @group Configuration
		 * @param {number} a - Acceleration in mm/s².
		 */
		setStartAcceleration(a) {
			var cmd = `M204 P${a};`;
			this.enqueue(cmd);
		}

		/**
		 * Calculate the extrusion amount needed to move to an absolute XYZ position
		 * based on the current nozzle and filament diameters.
		 * @group Utilities
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @returns {string} Extrusion amount in mm, fixed to 4 decimal places.
		 */
		makeE(x, y, z) {
			const dist3D = (x, y, z) =>
				sqrt(
					(x - this._plannedPosition.x) ** 2 +
						(y - this._plannedPosition.y) ** 2 +
						(z - this._plannedPosition.z) ** 2
				);
			// CHANGED THIS to toFixed(4) instead of 2
			return (
				dist3D(x, y, z) *
				(this._nozzleDiameter / 2 / (this._filamentDiameter / 2)) ** 2
			).toFixed(4);
		}

		mm_sec_to_mm_min(v) {
			return v * 60.0; // convert from mm/sec to mm/min
		}

		/**
		 * Select a tool by index (for multi-tool machines like Jubilee).
		 * @group Utilities
		 * @param {number} tool_idx - Zero-based tool index.
		 */
		pickupTool(tool_idx) {
			var cmd = `T${tool_idx}`;
			this.enqueue(cmd);
		}

		/**
		 * Append a comment to the last command in the queue.
		 * @group Utilities
		 * @param {string} c - Comment text (without the leading semicolon).
		 */
		addComment(c) {
			_fab._commands[_fab._commands.length - 1] += ` ;${c}`;
			_fab._commandStream[_fab._commandStream.length - 1] += ` ;${c}`;
		}
	}

	function windowResized() {
		try {
			_fab.recoverCameraPosition = true;
			resizeCanvas(windowWidth, windowHeight);
		} catch (e) {
			_warn(e);
		}
	}
	global.windowResized = windowResized;

	window.addEventListener('message', function (e) {
		if (e.origin !== window.location.origin && e.origin !== 'null') return;
		if (!e.data || e.data.type !== 'fab_command') return;
		if (typeof fab !== 'undefined' && fab.serial) {
			fab.serial.write(e.data.body.gcode + '\n');
		}
	});
})(typeof window !== 'undefined' ? window : globalThis);
