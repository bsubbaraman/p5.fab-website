// p5.fab — a p5.js library for digital fabrication.
// https://github.com/machineagency/p5.fab
// MIT License
//
// Host integration (v0.1.x): p5.fab reports status, configuration, console
// output, and G-code parsing progress by posting messages to the host page
// (window.parent, targetOrigin '*'). It currently assumes it runs inside a host
// that listens for these (the copypastes editor); used fully standalone, those
// messages simply have no listener. Standalone event subscription — fab.on(...)
// — is planned for v0.2.0.

(function (global) {
	'use strict';

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

	// Create the Fab and its global `fab` proxy on first use
	// Return the existing instance to preserve any open serial connection.
	function _ensureFab() {
		if (!_fab) {
			_fab = new Fab();
			global.fab = new Proxy(_fab, fabValidationHandler);
		}
		return global.fab;
	}

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
		_ensureFab();
		_fab._initCamera();
		return global.fab;
	};

	// Create fab before setup() so `fab` is always defined when user code runs.
	// Camera init is deferred to _initCamera() since WEBGL doesn't exist yet here.
	p5.prototype.registerMethod('beforeSetup', function () {
		_ensureFab();
	});

	p5.prototype.reloadSketch = function () {
		_ensureFab();
		_fab._initCamera();
		if (typeof fabDraw === 'function') {
			_fab._resetParams();
			_fab._resetDrawState();
			setTimeout(() => {
				window.parent.postMessage({ type: 'parsing_start' }, '*');
				setTimeout(() => {
					_fab._commands = [];
					_fab._setMaxSpeeds();
					_fab._setMaxAccelerations();
					fabDraw();
					_fab.parseGcodeAsync();
					_fab._syncVizStream = true;
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

		toString() {
			return this.raw;
		}
	}

	//===================================
	// Fab
	//===================================
	const printerPresets = {
		ender3: {
			name: 'ender3',
			baudRate: 115200,
			nozzleDiameter: 0.4,
			filamentDiameter: 1.75,
			maxX: 220,
			maxY: 220,
			maxZ: 250,
			extrusionMultiplier: 1,
			retractAmount: 8,
			zHopHeight: 0.2,
			printSpeed: 50,
			travelSpeed: 150,
			maxSpeedX: 200,
			maxSpeedY: 200,
			maxSpeedZ: 10,
			maxSpeedE: 60,
			maxAccelerationX: 500,
			maxAccelerationY: 500,
			maxAccelerationZ: 100,
			maxAccelerationE: 5000,
			printAcceleration: 500,
			travelAcceleration: 1000
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
			zHopHeight: 0.2,
			printSpeed: 50,
			travelSpeed: 150,
			maxSpeedX: 200,
			maxSpeedY: 200,
			maxSpeedZ: 12,
			maxSpeedE: 60,
			maxAccelerationX: 1000,
			maxAccelerationY: 1000,
			maxAccelerationZ: 200,
			maxAccelerationE: 5000,
			printAcceleration: 1250,
			travelAcceleration: 1500
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
			zHopHeight: 0.2,
			printSpeed: 50,
			travelSpeed: 150,
			maxSpeedX: 200,
			maxSpeedY: 200,
			maxSpeedZ: 15,
			maxSpeedE: 60,
			maxAccelerationX: 1000,
			maxAccelerationY: 1000,
			maxAccelerationZ: 200,
			maxAccelerationE: 3000,
			printAcceleration: 1000,
			travelAcceleration: 1500
		}
	};

	const defaultPrinterSettings = {
		name: 'default',
		baudRate: 115200,
		maxNozzleTemp: 280,
		maxBedTemp: 130, // °C
		nozzleDiameter: 0.4,
		filamentDiameter: 1.75,
		maxX: 220,
		maxY: 220,
		maxZ: 250,
		extrusionMultiplier: 1,
		retractAmount: 8,
		zHopHeight: 0.2,
		printSpeed: 50,
		travelSpeed: 150,
		maxSpeedX: 200,
		maxSpeedY: 200,
		maxSpeedZ: 10,
		maxSpeedE: 60,
		maxAccelerationX: 500,
		maxAccelerationY: 500,
		maxAccelerationZ: 100,
		maxAccelerationE: 5000,
		printAcceleration: 500,
		travelAcceleration: 1000,
		minSegmentTime: 20, // ms — floor on move duration to avoid serial-starve stutter
		autoConnect: true
	};

	// Lead-in modes for beginShape(): how the first vertex reaches the path start.
	// Each maps to the like-named motion primitive (travelTo/retractTo/moveTo/extrudeTo).
	const TRAVEL = 'travel';
	const RETRACT = 'retract';
	const MOVE = 'move';
	const EXTRUDE = 'extrude';

	// Expose the lead-in modes as p5-style globals (like CLOSE/WEBGL) so sketches can
	// write beginShape(RETRACT). Don't clobber existing p5 constants (p5 already defines
	// MOVE === 'move'); beginShape() also accepts the raw string values as a fallback.
	for (const [_name, _value] of Object.entries({ TRAVEL, RETRACT, MOVE, EXTRUDE })) {
		if (p5.prototype[_name] === undefined) p5.prototype[_name] = _value;
	}

	const FAB_PARAM_NAMES = Object.freeze({
		// Maintained by hand for the simple friendly error system
		// Grouped to match the documentation @group categories.
		// Only strictly required arguments should be listed

		// Motion
		moveTo: ['x', 'y', 'z'],
		travelTo: ['x', 'y', 'z'],
		retractTo: ['x', 'y', 'z'],
		moveToX: ['x'],
		moveToY: ['y'],
		moveToZ: ['z'],
		move: ['dx', 'dy', 'dz'],
		travel: ['dx', 'dy', 'dz'],
		moveX: ['dx'],
		moveY: ['dy'],
		moveZ: ['dz'],
		translate: ['dx', 'dy', 'dz'],
		// Extrusion
		extrudeTo: ['x', 'y', 'z'],
		extrudeToX: ['x'],
		extrudeToY: ['y'],
		extrudeToXY: ['x', 'y'],
		extrudeToZ: ['z'],
		extrude: ['dx', 'dy', 'dz'],
		extrudeX: ['dx'],
		extrudeXY: ['dx', 'dy'],
		extrudeY: ['dy'],
		extrudeZ: ['dz'],
		// Structure
		vertex: ['x', 'y'],
		// Shapes
		circle: ['x', 'y', 'z', 'd'],
		ellipse: ['x', 'y', 'z', 'w'],
		square: ['x', 'y', 'z', 's'],
		rect: ['x', 'y', 'z', 'w'],
		ngon: ['x', 'y', 'z', 'd', 'n'],
		triangle: ['x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'z'],
		quad: ['x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'x4', 'y4', 'z'],
		rectMode: ['mode'],
		ellipseMode: ['mode'],
		// Print control
		setTemps: ['tNozzle', 'tBed'],
		speed: ['v'],
		printSpeed: ['v'],
		travelSpeed: ['v'],
		printAcceleration: ['v'],
		travelAcceleration: ['v'],
		retractAmount: ['mm'],
		zHopHeight: ['mm'],
		minSegmentTime: ['ms'],
		// Configuration
		maxSpeedX: ['v'],
		maxSpeedY: ['v'],
		maxSpeedZ: ['v'],
		maxSpeedE: ['v'],
		maxAccelerationX: ['v'],
		maxAccelerationY: ['v'],
		maxAccelerationZ: ['v'],
		maxAccelerationE: ['v']
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
				let body;
				if (received < names.length) {
					body = `p5.fab says: ${prop}() received ${received} ${word}, expected at least ${names.length}.`;
				} else if (maxParams > 0 && received > maxParams) {
					body = `p5.fab says: ${prop}() received ${received} ${word}, expected no more than ${maxParams}.`;
				}
				if (body) {
					// Only surface each friendly error once per sketch run, so a bad
					// call inside fabDraw() doesn't spam the console every frame.
					if (!target._fesWarned.has(body)) {
						target._fesWarned.add(body);
						window.parent.postMessage({ type: 'output', body }, '*');
					}
					return;
				}
				return val.apply(target, args);
			};
		},

		// The get trap validates calls; this guards writes — the two most common mistakes are
		// assigning to a method (meant to call it) and assigning to a read-only getter.
		set(target, prop, value) {
			if (typeof target[prop] === 'function') {
				// Assigning to a method shadows it and silently does nothing useful. Warn once
				// (the mistake often sits inside a loop) and leave the method callable.
				const key = `set:${prop}`;
				if (!target._fesWarned.has(key)) {
					target._fesWarned.add(key);
					window.parent.postMessage(
						{
							type: 'output',
							body: `p5.fab says: fab.${prop} is a function — did you mean fab.${prop}(${value})? Assigning to it has no effect.`
						},
						'*'
					);
				}
				return true;
			}
			try {
				// Real settable properties (nozzleDiameter, filamentDiameter, maxX/Y/Z) and any
				// user-added fields assign as normal.
				target[prop] = value;
			} catch {
				// Getter-only accessors (commands, centerX, isPrinting, …) throw on write under
				// strict mode — surface a friendly read-only notice instead.
				const key = `ro:${prop}`;
				if (!target._fesWarned.has(key)) {
					target._fesWarned.add(key);
					window.parent.postMessage(
						{ type: 'output', body: `p5.fab says: fab.${prop} is read-only.` },
						'*'
					);
				}
			}
			return true;
		}
	};

	class Fab {
		constructor(config = defaultPrinterSettings) {
			this.configure(config);
			if (navigator.serial) this.setupSerialConnection();

			// Command queue
			this._commands = [];
			this._commandStream = [];

			// Machine / connection / print state
			// Persists across sketch re-runs
			this._relativePositioning = false;
			this._reportedPos = {};
			this._gotInitPosition = false;
			this._isPrinting = false;

			// Drawing state (motion, push/pop, warnings, safety rails)
			// also reset on every sketch reload
			this._resetDrawState();

			// Rendering (camera deferred to _initCamera for the WEBGL canvas)
			this._vertices = [];
			this._model = null;
			this._lineWeight = 1.5;
			this._parseGeneration = 0;
			this._parsingGcode = false;
			this._syncVizStream = true;
			this._tempQueryIntervalID = null;
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
			// Tunable parameters: record the configured value as the default, then apply
			// it via _resetParams() (the same reset used on every sketch reload).
			this._defaultExtrusionMultiplier = config.extrusionMultiplier;
			this._defaultRetractAmount = config.retractAmount;
			this._defaultZHopHeight = config.zHopHeight;
			this._defaultMinSegmentTime = config.minSegmentTime ?? 20;
			this._defaultPrintSpeed = config.printSpeed;
			this._defaultTravelSpeed = config.travelSpeed;
			this._defaultMaxSpeedX = config.maxSpeedX;
			this._defaultMaxSpeedY = config.maxSpeedY;
			this._defaultMaxSpeedZ = config.maxSpeedZ;
			this._defaultMaxSpeedE = config.maxSpeedE;
			this._defaultMaxAccelerationX = config.maxAccelerationX;
			this._defaultMaxAccelerationY = config.maxAccelerationY;
			this._defaultMaxAccelerationZ = config.maxAccelerationZ;
			this._defaultMaxAccelerationE = config.maxAccelerationE;
			this._defaultPrintAcceleration = config.printAcceleration;
			this._defaultTravelAcceleration = config.travelAcceleration;
			this._resetParams();
			this.maxZ = config.maxZ;
			this._maxNozzleTemp = config.maxNozzleTemp ?? 280;
			this._maxBedTemp = config.maxBedTemp ?? 130;
			if (config.coordinateSystem == 'delta') {
				this._maxX = (2 * config.radius) / sqrt(2);
				this._maxY = this._maxX;
				this._centerX = 0;
				this._centerY = 0;
			} else {
				this.maxX = config.maxX;
				this.maxY = config.maxY;
			}

			const messageData = {
				coordinateSystem: this.coordinateSystem,
				maxX: this.maxX,
				maxY: this.maxY,
				maxZ: this.maxZ,
				maxNozzleTemp: this._maxNozzleTemp,
				maxBedTemp: this._maxBedTemp,
				nozzleDiameter: this._nozzleDiameter,
				filamentDiameter: this._filamentDiameter
			};

			window.parent.postMessage({ type: 'fab_config', body: messageData }, '*');
			if (this.cameraPosition) {
				this.setCameraView('home');
			}
		}

		// Restore all tunable parameters to their configured defaults.
		// Called from up-front and whevever the sketch is reloade
		_resetParams() {
			this._extrusionMultiplier = this._defaultExtrusionMultiplier;
			this._retractAmount = this._defaultRetractAmount;
			this._zHopHeight = this._defaultZHopHeight;
			this._minSegmentTime = this._defaultMinSegmentTime;
			this._printSpeed = this._defaultPrintSpeed;
			this._travelSpeed = this._defaultTravelSpeed;
			this._maxSpeedX = this._defaultMaxSpeedX;
			this._maxSpeedY = this._defaultMaxSpeedY;
			this._maxSpeedZ = this._defaultMaxSpeedZ;
			this._maxSpeedE = this._defaultMaxSpeedE;
			this._maxAccelerationX = this._defaultMaxAccelerationX;
			this._maxAccelerationY = this._defaultMaxAccelerationY;
			this._maxAccelerationZ = this._defaultMaxAccelerationZ;
			this._maxAccelerationE = this._defaultMaxAccelerationE;
			this._printAcceleration = this._defaultPrintAcceleration;
			this._travelAcceleration = this._defaultTravelAcceleration;
		}

		// Reset drawing state
		_resetDrawState() {
			this._lastAsyncPosition = new XYZEFC();
			this._plannedPosition = new XYZEFC();
			this._lastGcodePosition = { x: 0, y: 0, z: 0 };
			this._transformOffset = { x: 0, y: 0, z: 0 };
			this._stateStack = [];
			this._deprecationWarned = new Set();
			this._boundsWarned = new Set();
			this._fesWarned = new Set();
			this._shapeStarted = false;
			this._shapeFirstVertex = null;
			this._shapeLeadIn = TRAVEL;
			this._rectMode = 'corner'; // p5 default
			this._ellipseMode = 'center'; // p5 default
			this._allowHighTemp = false; // safety ceiling re-armed each run; opt out per draw
		}

		/**
		 * The printer's nozzle diameter in mm. Used to calculate extrusion amounts automatically.
		 *
		 * The default is set by the printer profile.
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
		 *   fab.travelTo(50, 50, 0);
		 *   fab.extrudeX(lineLength);
		 *   let lastCmd = fab.commands.at(-1);
		 *   console.log(`Extruding ${lastCmd.e}mm with a ${fab.nozzleDiameter}mm nozzle`);
		 *
		 *   // Change nozzle diameter and extrude another line
		 *   fab.nozzleDiameter = 1.0;
		 *   fab.travelTo(50, 100, 0);
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
		 * The diameter of the filament being used in mm. Used to calculate extrusion amounts automatically.
		 *
		 * The default value is set by the printer profile.
		 * You can configure the filament diameter via `setPrinter()`
		 * or directly to override the preset.
		 * @type {number}
		 * @group Configuration
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 *   fab.setPrinter('ender3', { filamentDiameter: 2.85 });
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(205, 60);
		 *   const lineLength = 100;
		 *
		 *   fab.travelTo(50, 50, 0);
		 *   fab.extrudeX(lineLength);
		 *   let lastCmd = fab.commands.at(-1);
		 *   console.log(`Extruding ${lastCmd.e}mm using ${fab.filamentDiameter}mm filament`);
		 *
		 *   // Change filament diameter and extrude another line
		 *   fab.filamentDiameter = 1.75;
		 *   fab.travelTo(50, 100, 0);
		 *   fab.extrudeX(lineLength);
		 *   lastCmd = fab.commands.at(-1);
		 *   console.log(`Extruding ${lastCmd.e}mm using ${fab.filamentDiameter}mm filament`);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
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

		/**
		 * The maximum X dimension of the printer in mm.
		 * The default value is set by the printer profile.
		 * You can configure the max dimension via `setPrinter()`
		 * or directly to override the preset.
		 * @type {number}
		 * @group Configuration
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 *   // hypothetical looooooong printer
		 *   fab.setPrinter('ender3', { maxX: 500 });
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		get maxX() {
			return this._maxX;
		}

		set maxX(v) {
			this._maxX = v;
			this._centerX = v / 2;
			window.parent.postMessage({ type: 'fab_config', body: { property: 'maxX', value: v } }, '*');
		}

		/**
		 * The maximum Y dimension of the printer in mm.
		 * The default value is set by the printer profile.
		 * You can configure the max dimension via `setPrinter()`
		 * or directly to override the preset.
		 * @type {number}
		 * @group Configuration
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 *   // hypothetical looooooong printer
		 *   fab.setPrinter('ender3', { maxY: 500 });
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		get maxY() {
			return this._maxY;
		}

		set maxY(v) {
			this._maxY = v;
			this._centerY = v / 2;
			window.parent.postMessage({ type: 'fab_config', body: { property: 'maxY', value: v } }, '*');
		}

		/**
		 * The maximum Z dimension of the printer in mm.
		 * The default value is set by the printer profile.
		 * You can configure the max dimension via `setPrinter()`
		 * or directly to override the preset.
		 * @type {number}
		 * @group Configuration
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 *   // hypothetical tall printer
		 *   fab.setPrinter('ender3', { maxZ: 500 });
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		get maxZ() {
			return this._maxZ;
		}

		set maxZ(v) {
			this._maxZ = v;
			window.parent.postMessage({ type: 'fab_config', body: { property: 'maxZ', value: v } }, '*');
		}

		/**
		 * The X center of the build plate in mm (`maxX / 2`).
		 * @readonly
		 * @type {number}
		 * @group Configuration
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(205, 60);
		 *
		 *   // Draw a circle at the center of the bed
		 *   fab.circle(fab.centerX, fab.centerY, 0, 100);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		get centerX() {
			return this._centerX;
		}

		/**
		 * The Y center of the build plate in mm (`maxY / 2`).
		 * @readonly
		 * @type {number}
		 * @group Configuration
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(205, 60);
		 *
		 *   // Draw a circle at the center of the bed
		 *   fab.circle(fab.centerX, fab.centerY, 0, 100);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		get centerY() {
			return this._centerY;
		}

		/**
		 * Current planned X position in mm.
		 *
		 * Note that this is not the current physical position on the machine,
		 * but the planned position in code. The value is in local (i.e. transformed)
		 * coordinate space.
		 * @readonly
		 * @type {number}
		 * @group Motion
		 * @example
		 *  function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 *
		 *   fab.moveTo(fab.centerX - 10, fab.centerY, 0);
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 *
		 *   fab.push()
		 *   fab.translate(fab.centerX - 10, fab.centerY, 0);
		 *   fab.extrudeToX(20);
		 *   // Position will be in the transformed coordinate space
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 *   fab.pop();
		 *
		 *   fab.moveTo(0, 0, 0);
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		get x() {
			return this._plannedPosition.x;
		}

		/**
		 * Current planned Y position in mm.
		 *
		 * Note that this is not the current physical position on the machine,
		 * but the planned position in code. The value is in local (i.e. transformed)
		 * coordinate space.
		 * @readonly
		 * @type {number}
		 * @group Motion
		 * @example
		 *  function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 *
		 *   fab.moveTo(fab.centerX - 10, fab.centerY, 0);
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 *
		 *   fab.push()
		 *   fab.translate(fab.centerX - 10, fab.centerY, 0);
		 *   fab.extrudeToX(20);
		 *   // Position will be in the transformed coordinate space
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 *   fab.pop();
		 *
		 *   fab.moveTo(0, 0, 0);
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		get y() {
			return this._plannedPosition.y;
		}

		/**
		 * Current planned Z position in mm.
		 *
		 * Note that this is not the current physical position on the machine,
		 * but the planned position in code. The value is in local (i.e. transformed)
		 * coordinate space.
		 * @readonly
		 * @type {number}
		 * @group Motion
		 * @example
		 *  function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 *
		 *   fab.moveTo(fab.centerX - 10, fab.centerY, 0);
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 *
		 *   fab.push()
		 *   fab.translate(fab.centerX - 10, fab.centerY, 0);
		 *   fab.extrudeToX(20);
		 *   // Position will be in the transformed coordinate space
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 *   fab.pop();
		 *
		 *   fab.moveTo(0, 0, 0);
		 *   console.log(`Position: (${fab.x}, ${fab.y}, ${fab.z})`);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		get z() {
			return this._plannedPosition.z;
		}

		/**
		 * Returns `true` if the printer is actively printing and `false` if not.
		 * @readonly
		 * @type {boolean}
		 * @group Utilities
		 * @example
		 *  function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   const layerHeight = 0.2;
		 *   const radius = 100;
		 *
		 *   fab.introLine(layerHeight);
		 *   for (let z = 0; z < radius; z += layerHeight) {
		 *     fab.circle(fab.centerX, fab.centerY, z, radius);
		 *   }
		 * }
		 *
		 * function draw() {
		 *   // Change the background color for additional visual feedback about print status
		 *   if (fab.isPrinting) {
		 *     // orange if printing
		 *     background(255, 103, 0, 127);
		 *   }
		 *   else {
		 *     // green if idle
		 *     background(0, 255, 0, 127);
		 *   }
		 *   fab.render();
		 * }
		 */
		get isPrinting() {
			return this._isPrinting;
		}

		/**
		 * The GCode commands generated by the most recent `fabDraw()` call, as structured objects.
		 *
		 * Each entry has a `.command` (e.g. 'G1', 'M104'), `.fields` (all parameters as a map), and direct lowercase field access (`.x`, `.s`, `.f`, etc.). `commands` is rebuilt each time `fabDraw()` runs.
		 *
		 * A line of GCode consists of fields that are separated by spaces.
		 * A field can be interpreted as a command, a parameter, or some custom purpose. It typically consists of a letter directly followed by a number. For example, `G1` is a linear move command. For a comprehensive overview of GCode commands, see {@link https://marlinfw.org/meta/gcode/ Marlin's GCode dictionary}.
		 *
		 * @property {string} raw - The original unparsed command string.
		 * @property {string} command - The command code, e.g. `'G1'`, `'M104'`.
		 * @property {Object.<string, number|string>} fields - All parameter fields keyed by
		 *   uppercase letter, e.g. `{ X: 100, Y: 50, E: 0.45, F: 2400 }`.
		 * @property {string|null} comment - Inline comment text after `;`, or `null`.
		 * @readonly
		 * @type {GCodeCommand[]}
		 * @group Utilities
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(205, 60);
		 *   fab.extrudeTo(fab.centerX, fab.centerY, 0);
		 *
		 *   // Get the last generated GCode command
		 *   const lastCmd = fab.commands.at(-1);
		 *   console.log(lastCmd);
		 *   console.log(lastCmd.command);
		 *   console.log(lastCmd.fields);
		 *   console.log(lastCmd.x);
		 *   console.log(lastCmd.s); // doesn't exist
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		get commands() {
			return this._commands.map((s) => new GCodeCommand(s));
		}

		/**
		 * All generated G-code as a single newline-separated string.
		 *
		 * @readonly
		 * @type {string}
		 * @group Utilities
		 */
		get gcode() {
			return this._commands.join('\n');
		}

		/**
		 * Set the extrusion multiplier applied to all subsequent auto-calculated extrusion amounts.
		 *
		 * `extrusionMultiplier()` works like `strokeWeight` in p5.js: once set, it will apply to
		 * all moves until changed. You can scope a temporary change with `push()` and `pop()`.
		 *
		 * Note that the mutliplier is only applied to auto-calculated extrusion amounts; explicit
		 * extrusion will not be affected.
		 * @group Print control
		 * @param {number} value - Multiplier value (e.g. `1.2` for 20% over-extrusion, `0.8` for under-extrusion).
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   const layerHeight = 0.2;
		 *   const height = 5;
		 *   const diameter = 50;
		 *
		 *   fab.introLine(layerHeight);
		 *   for (let z = 0; z < height; z += layerHeight) {
		 *     // Increase the extrusion multiplier over the course of the print
		 *     let eMultiplier = map(z, 0, height, 1, 2);
		 *     fab.extrusionMultiplier(eMultiplier);
		 *     fab.circle(fab.centerX, fab.centerY, z, diameter);
		 *   }
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		extrusionMultiplier(value) {
			let v = parseFloat(value);
			if (isNaN(v) || v < 0) {
				window.parent.postMessage(
					{
						type: 'output',
						body: `p5.fab says: extrusionMultiplier(${value}) must be ≥ 0 — using 1.`
					},
					'*'
				);
				v = 1;
			} else if (v > 5) {
				window.parent.postMessage(
					{
						type: 'output',
						body: `p5.fab says: extrusionMultiplier(${v}) is high; watch for skipped steps. Proceeding.`
					},
					'*'
				);
			}
			this._extrusionMultiplier = v;
		}

		/**
		 * Set the filament retraction distance to be used by all relevant commands (e.g., `travelTo()`, `travel()`, `retractTo()`).
		 *
		 * Once set, it will apply to all moves until changed.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * The default retraction can be overriden in `setPrinter()`.
		 * @group Print control
		 * @param {number} mm - Retraction distance in mm.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(205, 60);
		 *   const z = 0.2;
		 *
		 *   // Test a series of retraction amounts
		 *   const numLines = 5;
		 *   const spacing = 10;
		 *   const lineLength = 100;
		 *   let retraction = 5;
		 *   for (let i = 0; i < numLines; i++) {
		 *     fab.push();
		 *     fab.translate(50, 50 + spacing * i, z);
		 *     fab.retractAmount(retraction);
		 *     fab.travelTo(0, 0, 0);
		 *     fab.extrudeX(lineLength);
		 *     fab.pop();
		 *     retraction += 1;
		 *   }
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }

		* @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 *   // Specify a default retraction amount
		 *   fab.setPrinter('ender3', { retractAmount: 5 });
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		retractAmount(mm) {
			this._retractAmount = mm;
		}

		/**
		 * Set the z-hop height to be used by relevant commands (e.g., `travelTo()`, `travel()`).
		 *
		 * A z-hop raises the nozzle to avoid dragging along the surface during a travel move.
		 * Once set, it will apply to all moves until changed.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * The default can be overriden in `setPrinter()`.
		 * @group Print control
		 * @param {number} mm - Z-hop height in mm.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(205, 60);
		 *   const z = 0.2;
		 *
		 *   // Test a series of z-hop heights
		 *   const numLines = 5;
		 *   const spacing = 10;
		 *   const lineLength = 100;
		 *   let zHop = 0.1;
		 *   for (let i = 0; i < numLines; i++) {
		 *     fab.push();
		 *     fab.translate(50, 50 + spacing * i, z);
		 *     fab.zHopHeight(zHop);
		 *     fab.travelTo(0, 0, 0);
		 *     fab.extrudeX(lineLength);
		 *     fab.pop();
		 *     zHop += 0.5;
		 *   }
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }

		* @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 *   // Specify a default z-hop height
		 *   fab.setPrinter('ender3', { zHopHeight: 0.5 });
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		zHopHeight(mm) {
			this._zHopHeight = mm;
		}

		/**
		 * Set the minimum time (in milliseconds) any single move is allowed to take.
		 *
		 * Short, fast moves can finish faster than the serial link can send the next command,
		 * starving the printer's planner buffer and causing stuttering. This clamps the feedrate
		 * so each move lasts at least `ms`, keeping motion smooth. It only ever lowers the
		 * feedrate, and only for moves shorter than `feedrate * ms`; longer moves are unaffected.
		 * Set to `0` to disable. Mirrors Marlin's `DEFAULT_MINSEGMENTTIME` (default 20ms).
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Print control
		 * @param {number} ms - Minimum move duration in milliseconds. `0` disables the clamp.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *
		 *   // Loosen the clamp for a fast machine (or pass 0 to disable it)
		 *   fab.minSegmentTime(10);
		 *   fab.circle(fab.centerX, fab.centerY, 0.2, 10); // small circle stays smooth
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		minSegmentTime(ms) {
			const n = parseFloat(ms);
			if (isNaN(n) || n < 0) {
				window.parent.postMessage(
					{
						type: 'output',
						body: `p5.fab says: minSegmentTime must be >= 0 (got ${ms}) — keeping ${this._minSegmentTime}.`
					},
					'*'
				);
				return;
			}
			this._minSegmentTime = n;
		}

		/**
		 * Begins a command group that contains its own printing state.
		 *
		 * By default, printing parameters (e.g., `extrusionMultiplier()`, `printSpeed())`) and
		 * transformations (e.g., `translate()`) apply to all subsequent commands. `push()` and `pop()`
		 * can be used to constrain the effect of print parameters and transformations to a specific group
		 * of commands. The functionality follows `push()` and `pop()` in p5.js.
		 *
		 * `push()` and `pop()` contain the effects of the following functions:
		 *
		 * <ul>
		 * <li>`extrusionMultiplier()`</li>
		 * <li>`printSpeed()`, `travelSpeed()`</li>
		 * <li>`translate()`</li>
		 * <li>`retractAmount()`</li>
		 * <li>`zHopHeight()`</li>
		 * <li>`maxSpeedX()`, `maxSpeedY()`, `maxSpeedZ()`, `maxSpeedE()`</li>
		 * <li>`maxAccelerationX()`, `maxAccelerationY()`, `maxAccelerationZ()`, `maxAccelerationE()`</li>
		 * <li>`printAcceleration()`, `travelAcceleration()`</li>
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
		 *   fab.printSpeed(50);
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
		 *   fab.translate(fab.centerX, fab.centerY, 0);
		 *
		 *   // Set new printing parameters
		 *   fab.printSpeed(20);
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
				printSpeed: this._printSpeed,
				travelSpeed: this._travelSpeed,
				transformOffset: { ...this._transformOffset },
				retractAmount: this._retractAmount,
				zHopHeight: this._zHopHeight,
				maxSpeedX: this._maxSpeedX,
				maxSpeedY: this._maxSpeedY,
				maxSpeedZ: this._maxSpeedZ,
				maxSpeedE: this._maxSpeedE,
				maxAccelerationX: this._maxAccelerationX,
				maxAccelerationY: this._maxAccelerationY,
				maxAccelerationZ: this._maxAccelerationZ,
				maxAccelerationE: this._maxAccelerationE,
				printAcceleration: this._printAcceleration,
				travelAcceleration: this._travelAcceleration,
				minSegmentTime: this._minSegmentTime,
				rectMode: this._rectMode,
				ellipseMode: this._ellipseMode
			});
		}

		/**
		 * Ends a command group that contains its own printing state.
		 *
		 * By default, printing parameters (e.g., `extrusionMultiplier()`, `printSpeed()`) and
		 * transformations (e.g., `translate()`) apply to all subsequent commands. `push()` and `pop()`
		 * can be used to constrain the effect of print parameters and transformations to a specific group
		 * of commands. The functionality follows `push()` and `pop()` in p5.js.
		 *
		 * `push()` and `pop()` contain the effects of the following functions:
		 *
		 * <ul>
		 * <li>`extrusionMultiplier()`</li>
		 * <li>`printSpeed()`, `travelSpeed()`</li>
		 * <li>`translate()`</li>
		 * <li>`retractAmount()`</li>
		 * <li>`zHopHeight()`</li>
		 * <li>`maxSpeedX()`, `maxSpeedY()`, `maxSpeedZ()`, `maxSpeedE()`</li>
		 * <li>`maxAccelerationX()`, `maxAccelerationY()`, `maxAccelerationZ()`, `maxAccelerationE()`</li>
		 * <li>`printAcceleration()`, `travelAcceleration()`</li>
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
		 *   fab.printSpeed(50);
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
		 *   fab.translate(fab.centerX, fab.centerY, 0);
		 *
		 *   // Set new printing parameters
		 *   fab.printSpeed(20);
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
			this._printSpeed = state.printSpeed;
			this._travelSpeed = state.travelSpeed;
			this._transformOffset = state.transformOffset;
			this._retractAmount = state.retractAmount;
			this._zHopHeight = state.zHopHeight;
			this._maxSpeedX = state.maxSpeedX;
			this._maxSpeedY = state.maxSpeedY;
			this._maxSpeedZ = state.maxSpeedZ;
			this._maxSpeedE = state.maxSpeedE;
			this._maxAccelerationX = state.maxAccelerationX;
			this._maxAccelerationY = state.maxAccelerationY;
			this._maxAccelerationZ = state.maxAccelerationZ;
			this._maxAccelerationE = state.maxAccelerationE;
			this._printAcceleration = state.printAcceleration;
			this._travelAcceleration = state.travelAcceleration;
			this._minSegmentTime = state.minSegmentTime;
			this._rectMode = state.rectMode;
			this._ellipseMode = state.ellipseMode;
			this._setMaxSpeeds();
			this._setMaxAccelerations();
		}

		/**
		 * Offset the coordinate origin for all subsequent moves by `(dx, dy, dz)`.
		 *
		 * Offsets accumulate: a second `translate` adds to the first.
		 * Use `push()` / `pop()` to scope a translation to a specific region.
		 * @group Motion
		 * @param {number} dx - X offset in mm.
		 * @param {number} dy - Y offset in mm.
		 * @param {number} [dz=0] - Z offset in mm.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   fab.printSpeed(50);
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
		 *   fab.translate(fab.centerX, fab.centerY, 0);
		 *
		 *   // Set new printing parameters
		 *   fab.printSpeed(20);
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
		translate(dx, dy, dz = 0) {
			this._transformOffset.x += parseFloat(dx);
			this._transformOffset.y += parseFloat(dy);
			this._transformOffset.z += parseFloat(dz);
		}

		/**
		 * Configure printer settings using preset values, with optional overrides.
		 *
		 * Current default printers:
		 *
		 * <ul>
		 * <li>ender3</li>
		 * <li>prusa_mk3</li>
		 * <li>jubilee</li>
		 * </ul>
		 *
		 * Printer presets contain default values for the associated machine.
		 * All units are in mm and seconds.
		 *  For example, the `ender3` defaults are:
		 *
		 * ```
		 * {
		 *   name:                'ender3',
		 *   baudRate:            115200,
		 *   nozzleDiameter:      0.8,
		 *   filamentDiameter:    1.75,
		 *   maxX:                220,
		 *   maxY:                220,
		 *   maxZ:                250,
		 *   extrusionMultiplier: 1,
		 *   retractAmount:       8,
		 *   zHopHeight:          0.2,
		 *   printSpeed:          50,
		 *   travelSpeed:         150,
		 *   maxSpeedX:           200,
		 *   maxSpeedY:           200,
		 *   maxSpeedZ:           10,
		 *   maxSpeedE:           60,
		 *   maxAccelerationX:    500,
		 *   maxAccelerationY:    500,
		 *   maxAccelerationZ:    100,
		 *   maxAccelerationE:    5000,
		 *   printAcceleration:   500,
		 *   travelAcceleration:  1000
		 * }
		 * ```
		 * @group Setup
		 * @param {string} name - Printer preset name (e.g. `'ender3'`).
		 * @param {Object} [overrides={}] - Optional settings to override the preset (e.g. `{ nozzleDiameter: 0.4 }`).
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 *   // set a default printer profile with manual overrides
		 *   fab.setPrinter('ender3',  { nozzleDiameter: 0.8, retractAmount: 10 })
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   const layerHeight = 0.2;
		 *   const height = 50;
		 *   const diameter = 50;
		 *
		 *   fab.introLine(layerHeight);
		 *   for (let z = 0; z < height; z += layerHeight) {
		 *     fab.circle(fab.centerX, fab.centerY, z, diameter);
		 *   }
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
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

			this.serial.on('requesterror', function (err) {
				// A cancelled or empty port picker isn't a real error — don't spam the console.
				if (err && (err.name === 'AbortError' || err.name === 'NotFoundError')) return;
				_error('p5.fab: serial connection request failed.');
			});

			// Without this, a failed open() (port busy / held by another program or tab) is
			// silently dropped: the port is "picked" but never opens, so `open` never fires.
			this.serial.on('openerror', function (err) {
				const m = (err && err.message) || '';
				if (/already (open|opening)/i.test(m)) return; // reconnect race, not a failure
				_error('p5.fab: could not open the serial port' + (m ? ' (' + m + ')' : '') + '.');
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
				_fab._tempQueryIntervalID = setInterval(() => {
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
				clearInterval(_fab._tempQueryIntervalID);
				_fab._tempQueryIntervalID = null;
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
			if (this._syncVizStream) {
				this._commandStream = this._commands.slice();
				this._syncVizStream = false;
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
				this._syncVizStream = true;
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
					this._reportedPos['X'] = item.split(':')[1];
				}
				if (item.includes('Y:')) {
					this._reportedPos['Y'] = item.split(':')[1];
				}
				if (item.includes('Z:')) {
					this._reportedPos['Z'] = item.split(':')[1];
				}
			});

			if (!this._gotInitPosition) {
				this._plannedPosition.x = this._reportedPos['X'];
				this._plannedPosition.y = this._reportedPos['Y'];
				this._plannedPosition.z = this._reportedPos['Z'];
				this._lastAsyncPosition.x = this._reportedPos['X'];
				this._lastAsyncPosition.y = this._reportedPos['Y'];
				this._lastAsyncPosition.z = this._reportedPos['Z'];
				this._gotInitPosition = true;
			}

			window.parent.postMessage(
				{
					type: 'fab_status',
					body: {
						event: 'position',
						x: parseFloat(this._reportedPos['X']),
						y: parseFloat(this._reportedPos['Y']),
						z: parseFloat(this._reportedPos['Z'])
					}
				},
				'*'
			);
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

			this._vertices = vertices;
			this._model = null;
			this._parsingGcode = false;
			window.parent.postMessage({ type: 'parsing_complete' }, '*');
		}

		/**
		 * Render a 3D preview of the planned toolpaths.
		 *
		 * Call this inside the `draw()` loop, using WEBGL mode. Note that rendering isn't necessary; removing
		 * or commenting out the `render()` call will still generate GCode.
		 * @group Utilities
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   const layerHeight = 0.2;
		 *   const height = 50;
		 *   const diameter = 50;
		 *
		 *   fab.introLine(layerHeight);
		 *   for (let z = 0; z < height; z += layerHeight) {
		 *     fab.circle(fab.centerX, fab.centerY, z, diameter);
		 *   }
		 * }
		 *
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
				if (this._model) {
					stroke(0);
					strokeWeight(this._lineWeight);
					model(this._model);
				}
			} else if (!this._model) {
				const _verts = this._vertices;
				const _lw = this._lineWeight;
				this._model = buildGeometry(() => {
					stroke(0);
					strokeWeight(_lw);
					noFill();
					let pos = createVector(0, 0, 0);
					for (const vd of _verts) {
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
				strokeWeight(this._lineWeight);
				model(this._model);
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

			noFill();
			stroke(0);
		}

		/*****
		 * G-Code Commands
		 */
		/**
		 * Home all axes and reset the extruder position.
		 *
		 * The machine should always be homed before sending commands. If the machine
		 * has been homed, this command can be commented out/removed to save time. Note that
		 * some older printers will reboot the machine upon establishing a serial connection,
		 * therefore requiring re-homing.
		 * @group Print control
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		autoHome() {
			const cmd = 'G28';
			this.enqueue(cmd);
			this.enqueue('G92 E0');

			return cmd;
		}

		/**
		 * Set both the nozzle and bed temperatures and wait for both to be reached before continuing.
		 * @group Print control
		 * @param {number} tNozzle - Target nozzle temperature in °C.
		 * @param {number} tBed - Target bed temperature in °C.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   const height = 50;
		 *   const diameter = 50;
		 *
		 *   fab.introLine(layerHeight);
		 *   for (let z = 0; z < height; z += layerHeight) {
		 *     fab.circle(fab.centerX, fab.centerY, z, diameter);
		 *   }
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		setTemps(tNozzle, tBed) {
			tNozzle = this._clampTemp(tNozzle, this._maxNozzleTemp, 'nozzle temp');
			tBed = this._clampTemp(tBed, this._maxBedTemp, 'bed temp');
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
		 * @group Print control
		 * @param {number} t - Target nozzle temperature in °C.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   // Setting only the nozzle temperature
		 *   // The bed temperature will not be affected
		 *   fab.setNozzleTemp(200);
		 *   const layerHeight = 0.2;
		 *   const height = 50;
		 *   const diameter = 50;
		 *
		 *   fab.introLine(layerHeight);
		 *   for (let z = 0; z < height; z += layerHeight) {
		 *     fab.circle(fab.centerX, fab.centerY, z, diameter);
		 *   }
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		setNozzleTemp(t) {
			t = this._clampTemp(t, this._maxNozzleTemp, 'nozzle temp');
			const cmd = `M109 S${t}`;
			this.enqueue(cmd);
			return cmd;
		}

		/**
		 * Set the bed temperature and wait for it to be reached before continuing.
		 * @group Print control
		 * @param {number} t - Target bed temperature in °C.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   // Setting only the bed temperature
		 *   // The nozzle temperature will not be affected
		 *   fab.setBedTemp(200);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		setBedTemp(t) {
			t = this._clampTemp(t, this._maxBedTemp, 'bed temp');
			const cmd = `M190 S${t}`;
			this.enqueue(cmd);
			return cmd;
		}

		/**
		 * Allow nozzle/bed temperatures above the default safety ceiling (by default, these are 280°C / 130°C for nozzle and bed). This is necessary when printing high-temp materials like nylon or PC. Like other settings, this resets at the start of every
		 * fabDraw() (and on stopPrint()), so call it in fabDraw() before your high setTemps().
		 * @group Print control
		 */
		allowHighTemp() {
			this._allowHighTemp = true;
		}

		/**
		 * This enforces the temperature safety ceiling after disabling it with `allowHighTemp(). (It also resets
		 * automatically at the start of each fabDraw().)
		 * @group Print control
		 */
		disallowHighTemp() {
			this._allowHighTemp = false;
		}

		// Friendly temperature guard: warn-and-cap rather than throw (p5.fab ethos).
		_clampTemp(t, max, label) {
			const v = parseFloat(t);
			if (isNaN(v)) return t;
			if (v < 0) {
				window.parent.postMessage(
					{ type: 'output', body: `p5.fab says: ${label} ${v}°C is below 0 — using 0°C.` },
					'*'
				);
				return 0;
			}
			if (!this._allowHighTemp && v > max) {
				window.parent.postMessage(
					{
						type: 'output',
						body: `p5.fab says: ${label} ${v}°C looks high — capping at ${max}°C. Call fab.allowHighTemp() to override.`
					},
					'*'
				);
				return max;
			}
			return v;
		}

		setAbsolutePosition() {
			this._relativePositioning = false;
			const cmd = 'G90';
			this.enqueue(cmd);
		}

		setAbsolutePositionXYZ() {
			// For Marlin, G90 sets extruder to absolute https://marlinfw.org/docs/gcode/G090.html
			// Duet doesn't https://docs.duet3d.com/en/User_manual/Reference/Gcodes
			// Send an M83 to keep extruder in relative mode.
			this._relativePositioning = false;
			this.setAbsolutePosition();
			this.setERelative();
		}

		setRelativePosition() {
			this._relativePositioning = true;
			const cmd = 'G91';
			this.enqueue(cmd);
		}

		setERelative() {
			const cmd = 'M83';
			this.enqueue(cmd);
		}

		/**
		 * Turn the part cooling fan on.
		 *
		 * The fan speed can vary from 0 (off) to 255 (fully on).
		 * @group Print control
		 * @param {number} [s=255] - Fan speed, 0–255.
		 * @example
		 *  function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   // Ramp up fan speed from 0 to 255
		 *   for (let s = 0; s < 256; s +=1) {
		 *     fab.fanOn(s);
		 *   }
		 *   // Turn fan of
		 *   fab.fanOff();
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		fanOn(s = 255) {
			if (s < 0 || s > 255) {
				window.parent.postMessage(
					{
						type: 'output',
						body: `p5.fab says: fanOn() speed must be between 0 and 255 (got ${s}). Clamping.`
					},
					'*'
				);
				s = Math.max(0, Math.min(255, s));
			}
			const cmd = `M106 S${s}`;
			this.enqueue(cmd);
		}

		/**
		 * Turn the part cooling fan off.
		 * @group Print control
		 * @example
		 *  function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   // Ramp up fan speed from 0 to 255
		 *   for (let s = 0; s < 256; s +=1) {
		 *     fab.fanOn(s);
		 *   }
		 *   // Turn fan of
		 *   fab.fanOff();
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		fanOff() {
			const cmd = 'M107';
			this.enqueue(cmd);
		}

		/**
		 * Pause the print for a given duration, in seconds.
		 * @group Print control
		 * @param {number|null} [t=null] - Duration in seconds. Defaults to 10s if not provided.
		 */
		pausePrint(t = null) {
			const cmd = t ? `M1 S${t}` : 'M1 S10 this is a pause';
			this._commandStream.unshift(cmd);
		}

		/**
		 * Stop the print and clear the command queue.
		 *
		 * Note that any buffered commands will still be executed,
		 * resulting in a delay before actually stopping.
		 * @group Print control
		 */
		stopPrint() {
			this._commandStream = [];
			this._isPrinting = false;
			// Tell the host the print ended. We can't rely on printStream()'s print_complete
			// here — clearing _isPrinting stops onData from emitting 'ok', so that path never runs.
			window.parent.postMessage({ type: 'fab_status', body: { event: 'print_complete' } }, '*');
			fabDraw();
		}

		/**
		 * Emergency stop: immediately send M112 to the printer, halting all motion and
		 * heating at the firmware level. Unlike stopPrint() (which only clears the queued
		 * commands), this halts a print already in progress — but afterward the firmware
		 * needs a reset/reconnect before it will accept new commands.
		 * @group Print control
		 */
		emergencyStop() {
			// Halt the firmware first — this is the urgent part.
			try {
				if (this.connected && this.serial) {
					this.serial.write('M112\n');
					window.parent.postMessage(
						{
							type: 'output',
							body: 'p5.fab says: EMERGENCY STOP (M112) sent — the printer halted and must be reset/reconnected before printing again.'
						},
						'*'
					);
				} else {
					window.parent.postMessage(
						{ type: 'output', body: 'p5.fab says: emergencyStop() — no printer is connected.' },
						'*'
					);
				}
			} catch (e) {
				_error('p5.fab: emergencyStop() failed to write M112.', e);
			}
			// Then reset local state + rebuild the viz, same as stopPrint().
			this._commandStream = [];
			this._isPrinting = false;
			window.parent.postMessage({ type: 'fab_status', body: { event: 'print_complete' } }, '*');
			fabDraw();
		}

		restartPrinter() {
			const cmd = 'M999';
			this.enqueue(cmd);
			this.print();
		}

		/**
		 * Print a priming line along the left edge of the bed to prepare the extruder.
		 * @group Extrusion
		 * @param {number} [z=0.3] - Z height for the intro line in mm.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   const height = 50;
		 *   const diameter = 50;
		 *
		 *   fab.introLine(layerHeight);
		 *   for (let z = layerHeight; z < height; z += layerHeight) {
		 *     fab.circle(fab.centerX, fab.centerY, z, diameter);
		 *   }
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		introLine(z = 0.2) {
			this.setAbsolutePositionXYZ();
			this.moveTo(5, 20, z, 25);
			this.extrudeTo(5, 200, z, 25);
			this.moveTo(8, 200, z, 25);
			this.extrudeTo(8, 20, z, 25);
		}

		/**
		 * Move the hotend away from the part.
		 *
		 * Adding this command at the end of a print can make it easier to
		 * remove it from the build plate.
		 * @group Print control
		 * @param {number} [z=0.3] - Z height for the intro line in mm.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   const height = 50;
		 *   const diameter = 50;
		 *
		 *   fab.introLine(layerHeight);
		 *   for (let z = 0; z < height; z += layerHeight) {
		 *     fab.circle(fab.centerX, fab.centerY, z, diameter);
		 *   }
		 *
		 *   fab.presentPart();
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		presentPart() {
			this.moveToY(180, 60);
		}

		waitCommand() {
			const cmd = 'M400';
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
			const cmd = `M154 S${t}`;
			this.enqueue(cmd);
		}

		//===================================
		// Path Commands
		//===================================
		updateAsyncPosition({ x = null, y = null, z = null, e = null, v = null, comment = '' } = {}) {
			this._lastAsyncPosition = { ...this._plannedPosition };
			if (!this._relativePositioning) {
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
			let gcodeX =
				x !== null
					? (parseFloat(this._plannedPosition.x) + this._transformOffset.x).toFixed(2)
					: this._lastGcodePosition.x.toFixed(2);
			let gcodeY =
				y !== null
					? (parseFloat(this._plannedPosition.y) + this._transformOffset.y).toFixed(2)
					: this._lastGcodePosition.y.toFixed(2);
			let gcodeZ =
				z !== null
					? (parseFloat(this._plannedPosition.z) + this._transformOffset.z).toFixed(2)
					: this._lastGcodePosition.z.toFixed(2);

			// Soft limits: keep moves inside the build volume to avoid head crashes.
			const bounded = this._clampToBed(gcodeX, gcodeY, gcodeZ);
			if (bounded.clamped && !this._boundsWarned.has('xyz')) {
				this._boundsWarned.add('xyz');
				window.parent.postMessage(
					{
						type: 'output',
						body: 'p5.fab says: a move went outside the build volume — clamping to the bed. Check your coordinates against maxX/maxY/maxZ.'
					},
					'*'
				);
			}
			gcodeX = bounded.x;
			gcodeY = bounded.y;
			gcodeZ = bounded.z;

			// Physical distance traveled (gcode space) — used for auto-E and the min-segment-time clamp.
			const moveDist = sqrt(
				(parseFloat(gcodeX) - this._lastGcodePosition.x) ** 2 +
					(parseFloat(gcodeY) - this._lastGcodePosition.y) ** 2 +
					(parseFloat(gcodeZ) - this._lastGcodePosition.z) ** 2
			);

			// Compute E from the distance traveled, applying extrusionMultiplier.
			// If the user passes an explicit e value, use it as-is (no multiplier applied).
			if (isExtrude && e === null) {
				e = parseFloat(
					(
						moveDist *
						(this._nozzleDiameter / 2 / (this._filamentDiameter / 2)) ** 2 *
						this._extrusionMultiplier
					).toFixed(4)
				);
			}

			this._plannedPosition.e = e !== null ? parseFloat(e).toFixed(4) : 0;

			this._lastGcodePosition.x = parseFloat(gcodeX);
			this._lastGcodePosition.y = parseFloat(gcodeY);
			this._lastGcodePosition.z = parseFloat(gcodeZ);

			// Minimum segment time: don't let a short move finish faster than the serial link can
			// feed the next command, which would drain the planner buffer and cause stuttering.
			// Only ever lowers the feedrate, and only for moves shorter than feedrate * minSegmentTime.
			let feedrateMmSec = v !== null ? v : isExtrude ? this._printSpeed : this._travelSpeed;
			if (this._minSegmentTime > 0 && moveDist > 0) {
				const maxForMinTime = moveDist / (this._minSegmentTime / 1000); // mm/sec
				if (feedrateMmSec > maxForMinTime) feedrateMmSec = maxForMinTime;
			}
			const feedrateMmMin = this.mm_sec_to_mm_min(feedrateMmSec);

			const moveType = isExtrude || e !== null ? 'G1' : 'G0';
			this.setAbsolutePositionXYZ();
			const cmd = `${moveType} X${gcodeX} Y${gcodeY} Z${gcodeZ} E${this._plannedPosition.e} F${feedrateMmMin.toFixed(2)} ${this._plannedPosition.c} `;
			this.enqueue(cmd);
			return cmd;
		}

		// Clamp a target to the build volume so moves can't crash the head. O(1) per move —
		// a few comparisons; in-bounds moves (the common case) return unchanged with no
		// reformatting. Cartesian: [0,maxX]×[0,maxY]×[0,maxZ]; delta: circular bed of radius.
		_clampToBed(gx, gy, gz) {
			let x = parseFloat(gx);
			let y = parseFloat(gy);
			let z = parseFloat(gz);
			let clamped = false;
			if (z < 0) {
				z = 0;
				clamped = true;
			} else if (z > this.maxZ) {
				z = this.maxZ;
				clamped = true;
			}
			if (this.coordinateSystem === 'delta') {
				const r = Math.sqrt(x * x + y * y);
				if (this.radius && r > this.radius) {
					const k = this.radius / r;
					x *= k;
					y *= k;
					clamped = true;
				}
			} else {
				if (x < 0) {
					x = 0;
					clamped = true;
				} else if (x > this.maxX) {
					x = this.maxX;
					clamped = true;
				}
				if (y < 0) {
					y = 0;
					clamped = true;
				} else if (y > this.maxY) {
					y = this.maxY;
					clamped = true;
				}
			}
			if (!clamped) return { x: gx, y: gy, z: gz, clamped: false };
			return { x: x.toFixed(2), y: y.toFixed(2), z: z.toFixed(2), clamped: true };
		}

		/**
		 * Move to an absolute XYZ position without extruding.
		 *
		 * Non-extrusion moves will be executed at the default `travelSpeed` unless manually specified.
		 * Use `travelSpeed()` to set a new default.
		 * For retraction and/or z-hopping, see the `travel`/`travelTo` set of commands.
		 *
		 * @group Motion
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {string} [comment] - Optional G-code comment appended to the command.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   // Move in Y at the default travel speed
		 *   fab.moveTo(0, fab.centerY, 0);
		 *
		 *   // Move in X at a slower speed
		 *   const slower = 50; //mm per second
		 *   fab.moveTo(fab.centerX, fab.maxY, 0, slower)
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		moveTo(x, y, z, v, comment) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x: x, y: y, z: z, v: v, comment: comment });
		}

		/**
		 * Move relative to the current position without extruding.
		 *
		 * Non-extrusion moves will be executed at the default `travelSpeed` unless manually specified.
		 * Use `travelSpeed()` to set a new default.
		 * For retraction and/or z-hopping, see the `travel`/`travelTo` set of commands.
		 * @group Motion
		 * @param {number} dx - Distance to move in X in mm.
		 * @param {number} dy - Distance to move in Y in mm.
		 * @param {number} dz - Distance to move in Z in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   // Move in 30mm in x, 20mm in y, and 10mm in z at the default travel speed
		 *   fab.move(30, 20, 10);
		 *
		 *   // Move 30mm in x, -10mm in y, and 5mm in z at a slower speed
		 *   const slower = 50; //mm per second
		 *   fab.move(30, -10, 5, slower)
		 *
		 *   // The final position on the machine will be (60, 10, 15)
		 *   console.log(`(${fab.x}, ${fab.y}, ${fab.z})`);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		move(dx, dy, dz, v) {
			this.setRelativePosition();
			this._moveXYZE({ x: dx, y: dy, z: dz, v: v });
		}

		/**
		 * Move to an absolute XYZ position while extruding.
		 *
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`. If an explicit extrusion amount is specified, `extrusionMultiplier` is ignored.
		 *
		 * Print moves will be executed at the default `printSpeed` unless manually specified.
		 * @group Extrusion
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *
		 *   fab.introLine(layerHeight);
		 *   // Extrude filament at the default print speed
		 *   fab.extrudeTo(50, fab.centerY, layerHeight);
		 *
		 *   // Increase extrusion multiplier and print slower
		 *   fab.extrusionMultiplier(1.5);
		 *   const slower = 25; // mm per second
		 *   fab.extrudeTo(fab.centerX, 50, layerHeight, slower);
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
		 *
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`. If an explicit extrusion amount is specified, `extrusionMultiplier` is ignored.
		 *
		 * Print moves will be executed at the default `printSpeed` unless manually specified.
		 * @group Extrusion
		 * @param {number} dx - Distance to move in X in mm.
		 * @param {number} dy - Distance to move in Y in mm.
		 * @param {number} dz - Distance to move in Z in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *
		 *   // Extrude a line moving 50mm in x, 100mm in y, and 0mm in z
		 *   fab.extrude(50, 100, 0);
		 *
		 *   // Increase extrusion multiplier and print slower
		 *   fab.extrusionMultiplier(1.5);
		 *   const slower = 25; // mm per second
		 *   fab.extrude(50, -50, 0, slower);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		extrude(dx, dy, dz, v, e = null) {
			this.setRelativePosition();
			this._moveXYZE({ x: dx, y: dy, z: dz, e, isExtrude: true, v });
		}

		/** @deprecated Use `extrudeTo()` instead. */
		moveExtrude(x, y, z, v, e = null) {
			if (!this._deprecationWarned.has('moveExtrude')) {
				this._deprecationWarned.add('moveExtrude');
				window.parent.postMessage(
					{
						type: 'output',
						body: 'p5.fab: moveExtrude() is deprecated — use extrudeTo() instead.'
					},
					'*'
				);
			}
			this.extrudeTo(x, y, z, v, e);
		}

		/**
		 * Travel to an absolute XYZ position with filament retraction, z-hop, and re-prime.
		 * Use this to travel between disconnected extrusion paths without stringing.
		 * Retract distance and z-hop height are set by `retractAmount()` and `zHopHeight()`.
		 *
		 * Non-extrusion moves will be executed at the default `travelSpeed` unless manually specified.
		 * Use `travelSpeed()` to set a new default.
		 * @group Motion
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/sec.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *
		 *   fab.introLine(layerHeight);
		 *
		 *   // Travel to center of the machine while retracting and z-hopping
		 *   fab.travelTo(fab.centerX, fab.centerY, layerHeight);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		travelTo(x, y, z, v) {
			this.moveE(-1 * this._retractAmount);
			this.moveToZ(z + this._zHopHeight);
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x, y, z, v });
			this._prime(this._retractAmount);
			this.moveToZ(z);
		}

		/**
		 * Travel a relative XYZ distance with filament retraction, z-hop, and re-prime.
		 * Use this to travel between disconnected extrusion paths without stringing.
		 * Retract distance and z-hop height are set by `retractAmount()` and `zHopHeight()`.
		 *
		 * Non-extrusion moves will be executed at the default `travelSpeed` unless manually specified.
		 * Use `travelSpeed()` to set a new default.
		 * @group Motion
		 * @param {number} dx - Distance to move in X in mm.
		 * @param {number} dy - Distance to move in Y in mm.
		 * @param {number} dz - Distance to move in Z in mm.
		 * @param {number} v - Feedrate in mm/sec.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *
		 *   fab.introLine(layerHeight);
		 *
		 *   // Move 20mm in X, 10mm in Y, and 0mm in Z while retracting and hopping
		 *   fab.travel(20, 10, 0);
		 *
		 *   // Nozzle is primed and ready for subsquent commands
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		travel(dx, dy, dz, v) {
			this.moveE(-1 * this._retractAmount);
			this.moveToZ(this._plannedPosition.z + this._zHopHeight);
			this.setRelativePosition();
			this._moveXYZE({ x: dx, y: dy, z: dz, v });
			this._prime(this._retractAmount);
			this.moveToZ(this._plannedPosition.z);
		}

		/** @deprecated Use `travelTo()` instead. */
		moveRetract(x, y, z, v, e = 8) {
			if (!this._deprecationWarned.has('moveRetract')) {
				this._deprecationWarned.add('moveRetract');
				window.parent.postMessage(
					{ type: 'output', body: 'p5.fab: moveRetract() is deprecated — use travelTo() instead.' },
					'*'
				);
			}
			this.travelTo(x, y, z, v);
		}

		/**
		 * Move to an absolute XYZ position with filament retraction, and re-prime upon arrival.
		 *
		 * Retraction amount is set by `retractAmount()`. See `travel()`/`travelTo()`
		 * if a z-hop is also desired. See `move()`/`moveTo()` if retraction is not desired.
		 *
		 *  Non-extrusion moves will be executed at the default `travelSpeed` unless manually specified.
		 * Use `travelSpeed()` to set a new default.
		 * @group Motion
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/sec.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   fab.introLine(layerHeight);
		 *
		 *   // Move to the center of the machine while retracting
		 *   fab.retractTo(fab.centerX., fab.centerY, layerHeight);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		retractTo(x, y, z, v) {
			this.moveE(-1 * this._retractAmount);
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x, y, z, v });
			this._prime(this._retractAmount);
		}

		/**
		 * Move to an absolute X position without extruding.
		 *
		 * Non-extrusion moves will be executed at the default `travelSpeed` unless manually specified.
		 * Use `travelSpeed()` to set a new default.
		 * For retraction and/or z-hopping, see the `travel`/`travelTo` set of commands.
		 * @group Motion
		 * @param {number} x - Target X position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   // Move in X at the default travel speed
		 *   fab.moveToX(100);
		 *
		 *   // Move in X at a slower speed
		 *   const slower = 50; //mm per second
		 *   fab.moveToX(200, slower)
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		moveToX(x, v) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x: x, v: v });
		}

		/**
		 * Move to an absolute Y position without extruding.
		 *
		 * Non-extrusion moves will be executed at the default `travelSpeed` unless manually specified.
		 * Use `travelSpeed()` to set a new default.
		 * For retraction and/or z-hopping, see the `travel`/`travelTo` set of commands.
		 * @group Motion
		 * @param {number} y - Target Y position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   // Move in Y at the default travel speed
		 *   fab.moveToY(100);
		 *
		 *   // Move in Y at a slower speed
		 *   const slower = 50; //mm per second
		 *   fab.moveToY(200, slower)
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		moveToY(y, v) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ y: y, v: v });
		}

		/**
		 * Move to an absolute Z position without extruding.
		 *
		 * Most printers use a leadscrew for Z, which has a much lower max speed than the belt-driven XY axes.
		 * The `maxSpeedZ` preset value caps Z speed in firmware via `M203`.
		 * In practice, this max Z speed is used for Z movements in general.
		 * @group Motion
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   // Move in Z at the default speed
		 *   // This will be the maxZSpeed
		 *   fab.moveToZ(10);
		 *
		 *   // Move in Z at a slower speed
		 *   const slower = 5; //mm per second
		 *   fab.moveToX(20, slower)
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		moveToZ(z, v) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ z: z, v: v });
		}

		/**
		 * Move a relative distance in X without extruding.
		 *
		 * Non-extrusion moves will be executed at the default `travelSpeed` unless manually specified.
		 * Use `travelSpeed()` to set a new default.
		 * For retraction and/or z-hopping, see the `travel`/`travelTo` set of commands.
		 * @group Motion
		 * @param {number} dx - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   // move 30mm in x
		 *   fab.moveX(30);
		 *
		 *   // Move another 10mm in x
		 *   fab.moveX(10);
		 *
		 *   // Move -5mm in x, at a slower speed
		 *   const slower = 50; //mm per second
		 *   fab.moveX(-10, slower)
		 *
		 *   // The final X position on the machine will be 30 + 10 - 5 = 35
		 *   console.log(`(${fab.x}, ${fab.y}, ${fab.z})`);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		moveX(dx, v) {
			this.setRelativePosition();
			this._moveXYZE({ x: dx, v });
		}

		/**
		 * Move a relative distance in Y without extruding.
		 *
		 * Non-extrusion moves will be executed at the default `travelSpeed` unless manually specified.
		 * Use `travelSpeed()` to set a new default.
		 * For retraction and/or z-hopping, see the `travel`/`travelTo` set of commands.
		 * @group Motion
		 * @param {number} dy - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   // move 30mm in Y
		 *   fab.moveY(30);
		 *
		 *   // Move another 10mm in Y
		 *   fab.moveY(10);
		 *
		 *   // Move -5mm in Y, at a slower speed
		 *   const slower = 50; //mm per second
		 *   fab.moveY(-10, slower)
		 *
		 *   // The final Y position on the machine will be 30 + 10 - 5 = 35
		 *   console.log(`(${fab.x}, ${fab.y}, ${fab.z})`);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		moveY(dy, v) {
			this.setRelativePosition();
			this._moveXYZE({ y: dy, v });
		}

		/**
		 * Move a relative distance in Z without extruding.
		 *
		 * Most printers use a leadscrew for Z, which have a much lower max speed than the belt-driven XY axes.
		 * The `maxSpeedZ` preset value caps Z speed in firmware via `M203`.
		 * In practice, this max Z speed is used for Z movements in general.
		 * @group Motion
		 * @param {number} dz - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   // move 10mm in Z
		 *   fab.moveZ(310);
		 *
		 *   // Move another 5 in Z, slower
		 *   const slower = 5; // mm per second
		 *   fab.moveZ(5, slower);
		 *
		 *   // The final X position on the machine will be 10 + 5 = 15
		 *   console.log(`(${fab.x}, ${fab.y}, ${fab.z})`);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		moveZ(dz, v) {
			this.setRelativePosition();
			this._moveXYZE({ z: dz, v });
		}

		/**
		 * Move the extruder a relative distance in E.
		 * @group Extrusion
		 * @param {number} de - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveE(de, v) {
			this.setRelativePosition();
			this._moveXYZE({ e: de, v: v });
		}

		/**
		 * Move a relative distance in X while extruding.
		 *
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`. If an explicit extrusion amount is specified, `extrusionMultiplier` is ignored.
		 *
		 * Print moves will be executed at the default `printSpeed` unless manually specified.
		 * @group Extrusion
		 * @param {number} dx - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *
		 *   // Get to a starting position
		 *   fab.travelTo(100, 100, 0.2);
		 *
		 *   // Extrude 10mm in X
		 *   fab.extrudeX(10);
		 *
		 *   // Exrude another 10mm, slower and with more extrusion
		 *   const slower = 20;
		 *   fab.extrusionMultiplier(1.2);
		 *   fab.extrudeX(10, slower);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		extrudeX(dx, v, e = null, comment = '') {
			this.setRelativePosition();
			this._moveXYZE({ x: dx, e, isExtrude: true, v, comment });
		}

		/**
		 * Move a relative distance in X and Y while extruding.
		 *
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`. If an explicit extrusion amount is specified, `extrusionMultiplier` is ignored.
		 *
		 * Print moves will be executed at the default `printSpeed` unless manually specified.
		 * @group Extrusion
		 * @param {number} dx - Distance to move in X in mm.
		 * @param {number} dy - Distance to move in Y in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *
		 *   // Get to a starting position
		 *   fab.travelTo(100, 100, 0.2);
		 *
		 *   // Extrude 10mm in X and 10mm in Y
		 *   fab.extrudeXY(10, 10);
		 *
		 *   // Exrude another 10mm in X, -5mm in Y, slower and with more extrusion
		 *   const slower = 20;
		 *   fab.extrusionMultiplier(1.2);
		 *   fab.extrudeXY(10, -5, slower);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		extrudeXY(dx, dy, v, e = null, comment = '') {
			this.setRelativePosition();
			this._moveXYZE({ x: dx, y: dy, e, isExtrude: true, v, comment });
		}

		/**
		 * Move a relative distance in Y while extruding.
		 *
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`. If an explicit extrusion amount is specified, `extrusionMultiplier` is ignored.
		 *
		 * Print moves will be executed at the default `printSpeed` unless manually specified.
		 * @group Extrusion
		 * @param {number} dy - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *
		 *   // Get to a starting position
		 *   fab.travelTo(100, 100, 0.2);
		 *
		 *   // Extrude 10mm in Y
		 *   fab.extrudeY(10);
		 *
		 *   // Exrude another 10mm in Y, slower and with more extrusion
		 *   const slower = 20;
		 *   fab.extrusionMultiplier(1.2);
		 *   fab.extrudeY(10, slower);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		extrudeY(dy, v, e = null) {
			this.setRelativePosition();
			this._moveXYZE({ y: dy, e, isExtrude: true, v });
		}

		/**
		 * Move a relative distance in Z while extruding.
		 *
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`. If an explicit extrusion amount is specified, `extrusionMultiplier` is ignored.
		 *
		 * Most printers use a leadscrew for Z, which have a much lower max speed than the belt-driven XY axes.
		 * The `maxSpeedZ` preset value caps Z speed in firmware via `M203`.
		 * In practice, this max Z speed is used for Z movements in general.
		 * @group Extrusion
		 * @param {number} dz - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *
		 *   // Get to a starting position
		 *   fab.travelTo(100, 100, 0.2);
		 *
		 *   // Move very slowly straight up, while extruding
		 *   const slow = 1; // mm per second
		 *   fab.extrudeZ(10, slow);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		extrudeZ(dz, v, e = null) {
			this.setRelativePosition();
			this._moveXYZE({ z: dz, e, isExtrude: true, v });
		}

		/**
		 * Move to an absolute X position while extruding.
		 *
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`. If an explicit extrusion amount is specified, `extrusionMultiplier` is ignored.
		 *
		 * Print moves will be executed at the default `printSpeed` unless manually specified.
		 * @group Extrusion
		 * @param {number} x - Target X position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *
		 *   // Get to a starting position
		 *   fab.travelTo(100, 100, 0.2);
		 *
		 *   // Extrude to X = 110mm
		 *   fab.extrudeToX(110);
		 *
		 *   // Exrude another 10mm, slower and with more extrusion
		 *   const slower = 20;
		 *   fab.extrusionMultiplier(1.2);
		 *   fab.extrudeToX(120, slower);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		extrudeToX(x, v, e = null, comment = '') {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x, e, isExtrude: true, v, comment });
		}

		/**
		 * Move to an absolute Y position while extruding.
		 *
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`. If an explicit extrusion amount is specified, `extrusionMultiplier` is ignored.
		 *
		 * Print moves will be executed at the default `printSpeed` unless manually specified.
		 * @group Extrusion
		 * @param {number} y - Target Y position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *
		 *   // Get to a starting position
		 *   fab.travelTo(100, 100, 0.2);
		 *
		 *   // Extrude to Y = 110mm
		 *   fab.extrudeToY(110);
		 *
		 *   // Exrude another 10mm, slower and with more extrusion
		 *   const slower = 20;
		 *   fab.extrusionMultiplier(1.2);
		 *   fab.extrudeToY(120, slower);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		extrudeToY(y, v, e = null, comment = '') {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ y, e, isExtrude: true, v, comment });
		}

		/**
		 * Move to an absolute XY position while extruding.
		 *
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`. If an explicit extrusion amount is specified, `extrusionMultiplier` is ignored.
		 *
		 * Print moves will be executed at the default `printSpeed` unless manually specified.
		 * @group Extrusion
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *
		 *   // Get to a starting position
		 *   fab.travelTo(100, 100, 0.2);
		 *
		 *   // Extrude to X= 110mm, Y = 110mm
		 *   fab.extrudeToXY(110, 110);
		 *
		 *   // Exrude to 120 in X, 90 in Y, slower and with more extrusion
		 *   const slower = 20;
		 *   fab.extrusionMultiplier(1.2);
		 *   fab.extrudeToXY(120, 90, slower);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		extrudeToXY(x, y, v, e = null, comment = '') {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x, y, e, isExtrude: true, v, comment });
		}

		/**
		 * Move to an absolute Z position while extruding.
		 *
		 * Extrusion amount is calculated automatically from the move distance, scaled by `extrusionMultiplier`. If an explicit extrusion amount is specified, `extrusionMultiplier` is ignored.
		 *
		 * Most printers use a leadscrew for Z, which have a much lower max speed than the belt-driven XY axes.
		 * The `maxSpeedZ` preset value caps Z speed in firmware via `M203`.
		 * In practice, this max Z speed is used for Z movements in general.
		 * @group Extrusion
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *
		 *   // Get to a starting position
		 *   fab.travelTo(100, 100, 0.2);
		 *
		 *   // Move very slowly straight up, while extruding
		 *   const slow = 1; // mm per second
		 *   fab.extrudeToZ(10, slow);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		extrudeToZ(z, v, e = null, comment = '') {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ z, e, isExtrude: true, v, comment });
		}

		// Run the lead-in move that positions the nozzle at the start of a path.
		// Shared by vertex() (first vertex) and the shape primitives via _strokePolyline.
		_leadInTo(x, y, z, mode = TRAVEL) {
			switch (mode) {
				case RETRACT:
					this.retractTo(x, y, z);
					break;
				case MOVE:
					this.moveTo(x, y, z);
					break;
				case EXTRUDE:
					this.extrudeTo(x, y, z);
					break;
				default: // TRAVEL
					this.travelTo(x, y, z);
			}
		}

		// Extrude an outline through `points` ({x, y}, coplanar at `z`): lead-in to the first
		// point, extrude to the rest, optionally close back to the start. Shared by every shape
		// primitive. Deliberately does NOT touch _shapeStarted / _shapeFirstVertex, so a shape
		// drawn inside a user's open beginShape() can never clobber their path state.
		_strokePolyline(points, z, { close = true, mode = TRAVEL } = {}) {
			if (!points || points.length === 0) return;
			this._leadInTo(points[0].x, points[0].y, z, mode);
			for (let i = 1; i < points.length; i++) {
				this.extrudeToXY(points[i].x, points[i].y);
			}
			if (close && points.length > 1) {
				this.extrudeToXY(points[0].x, points[0].y);
			}
		}

		// Sample `n` points evenly around an ellipse (radii rx, ry) centered at (cx, cy),
		// starting at angle `rot` (radians). Shared by circle/ellipse (large n) and ngon.
		_ellipsePoints(cx, cy, rx, ry, n, rot = 0) {
			const points = [];
			for (let i = 0; i < n; i++) {
				const a = rot + (i / n) * Math.PI * 2;
				points.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
			}
			return points;
		}

		// Resolve (a, b, c, d) to an ellipse center + radii per the active ellipseMode.
		_ellipseCenter(a, b, c, d, mode) {
			switch (mode) {
				case 'radius':
					return { cx: a, cy: b, rx: c, ry: d };
				case 'corner':
					return { cx: a + c / 2, cy: b - d / 2, rx: c / 2, ry: d / 2 }; // -d/2: +Y renders up, so CORNER anchor is the visual top-left
				case 'corners':
					return {
						cx: (a + c) / 2,
						cy: (b + d) / 2,
						rx: Math.abs(c - a) / 2,
						ry: Math.abs(d - b) / 2
					};
				default: // center
					return { cx: a, cy: b, rx: c / 2, ry: d / 2 };
			}
		}

		// Resolve (a, b, c, d) to four rectangle corners per the active rectMode.
		_rectCorners(a, b, c, d, mode) {
			let x1, y1, x2, y2;
			switch (mode) {
				case 'center':
					x1 = a - c / 2;
					y1 = b - d / 2;
					x2 = a + c / 2;
					y2 = b + d / 2;
					break;
				case 'radius':
					x1 = a - c;
					y1 = b - d;
					x2 = a + c;
					y2 = b + d;
					break;
				case 'corners':
					x1 = a;
					y1 = b;
					x2 = c;
					y2 = d;
					break;
				default: // corner (anchor = visual top-left; +Y renders up, so extend -Y)
					x1 = a;
					y1 = b;
					x2 = a + c;
					y2 = b - d;
			}
			return [
				{ x: x1, y: y1 },
				{ x: x2, y: y1 },
				{ x: x2, y: y2 },
				{ x: x1, y: y2 }
			];
		}

		// Validate a rect/ellipse mode argument; warn once and keep the current value on bad input.
		_validShapeMode(mode, fnName, allowed, current) {
			const m = typeof mode === 'string' ? mode.toLowerCase() : mode;
			if (allowed.includes(m)) return m;
			const key = `${fnName}:${mode}`;
			if (!this._fesWarned.has(key)) {
				this._fesWarned.add(key);
				window.parent.postMessage(
					{
						type: 'output',
						body: `p5.fab says: ${fnName}() expects one of ${allowed.join(', ')}, got "${mode}". Keeping the current mode.`
					},
					'*'
				);
			}
			return current;
		}

		/**
		 * Extrude an ellipse outline at layer height `z`.
		 *
		 * By default, `(x, y)` specifies the center of the ellipse, see
		 * `ellipseMode()` for other ways to set the position. Speed and extrusion come from the current
		 * `printSpeed()` / `extrusionMultiplier()`.
		 * @group Shapes
		 * @param {number} x - X position of the anchor in mm (interpreted per `ellipseMode`).
		 * @param {number} y - Y position of the anchor in mm.
		 * @param {number} z - Layer height in mm.
		 * @param {number} w - Width in mm.
		 * @param {number} [h=w] - Height in mm. Defaults to `w` (a circle).
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   fab.introLine(layerHeight);
		 *
		 *   fab.ellipse(fab.centerX, fab.centerY, layerHeight, 60, 40);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		ellipse(x, y, z, w, h = w) {
			const { cx, cy, rx, ry } = this._ellipseCenter(x, y, w, h, this._ellipseMode);
			const n = Math.max(16, Math.ceil(Math.PI * 2 * Math.max(rx, ry)));
			this._strokePolyline(this._ellipsePoints(cx, cy, rx, ry, n), z);
		}

		/**
		 * Extrude a circle outline of diameter `d` at layer height `z`.
		 *
		 * By default, `(x, y)` specifies the center of the circle, see
		 * `ellipseMode()` for other ways to set the position.
		 * Using `circle` is the same as creating an ellipse with
		 * equal height and width (`ellipse(x, y, z, d, d)`).
		 * @group Shapes
		 * @param {number} x - X position of the anchor in mm (interpreted per `ellipseMode`).
		 * @param {number} y - Y position of the anchor in mm.
		 * @param {number} z - Layer height in mm.
		 * @param {number} d - Diameter in mm.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   const height = 50;
		 *   const diameter = 50;
		 *
		 *   fab.introLine(layerHeight);
		 *   for (let z = 0; z < height; z += layerHeight) {
		 *     fab.circle(fab.centerX, fab.centerY, z, diameter);
		 *   }
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		circle(x, y, z, d) {
			this.ellipse(x, y, z, d, d);
		}

		/**
		 * Extrude a rectangle outline at layer height `z`.
		 *
		 * The `(x, y)` anchor is interpreted per `rectMode()` (default `CORNER`, i.e. top-left).
		 * @group Shapes
		 * @param {number} x - X position of the anchor in mm (interpreted per `rectMode`).
		 * @param {number} y - Y position of the anchor in mm.
		 * @param {number} z - Layer height in mm.
		 * @param {number} w - Width in mm.
		 * @param {number} [h=w] - Height in mm. Defaults to `w` (a square).
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   fab.introLine(layerHeight);
		 *
		 *   fab.rect(50, 50, layerHeight, 80, 40);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		rect(x, y, z, w, h = w) {
			this._strokePolyline(this._rectCorners(x, y, w, h, this._rectMode), z);
		}

		/**
		 * Extrude a square outline with side `s` at layer height `z`.
		 *
		 * Using `square` is the same as making a rectangle with equal side lengths ()`rect(x, y, z, s, s)`); the `(x, y)` anchor follows
		 * `rectMode()` (default `CORNER`).
		 * @group Shapes
		 * @param {number} x - X position of the anchor in mm (interpreted per `rectMode`).
		 * @param {number} y - Y position of the anchor in mm.
		 * @param {number} z - Layer height in mm.
		 * @param {number} s - Side length in mm.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   fab.introLine(layerHeight);
		 *
		 *   fab.square(50, 50, layerHeight, 60);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		square(x, y, z, s) {
			this.rect(x, y, z, s, s);
		}

		/**
		 * Extrude a regular polygon with `n` sides, inscribed in a circle of diameter `d`.
		 *
		 * The `(x, y)` center follows `ellipseMode()` (default `CENTER`; `RADIUS` treats `d` as a
		 * radius). `rotation` (radians) turns the polygon; at 0 the first vertex points along +X.
		 * @group Shapes
		 * @param {number} x - Center X position in mm (interpreted per `ellipseMode`).
		 * @param {number} y - Center Y position in mm.
		 * @param {number} z - Layer height in mm.
		 * @param {number} d - Diameter of the circumscribing circle in mm.
		 * @param {number} n - Number of sides (e.g. 6 for a hexagon).
		 * @param {number} [rotation=0] - Rotation in radians.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   fab.introLine(layerHeight);
		 *
		 *   fab.ngon(fab.centerX, fab.centerY, layerHeight, 60, 6); // hexagon
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		ngon(x, y, z, d, n, rotation = 0) {
			const { cx, cy, rx, ry } = this._ellipseCenter(x, y, d, d, this._ellipseMode);
			this._strokePolyline(this._ellipsePoints(cx, cy, rx, ry, n, rotation), z);
		}

		/**
		 * Extrude a triangle outline through three corners, coplanar at layer height `z`.
		 * @group Shapes
		 * @param {number} x1 - First corner X in mm.
		 * @param {number} y1 - First corner Y in mm.
		 * @param {number} x2 - Second corner X in mm.
		 * @param {number} y2 - Second corner Y in mm.
		 * @param {number} x3 - Third corner X in mm.
		 * @param {number} y3 - Third corner Y in mm.
		 * @param {number} z - Layer height in mm.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   fab.introLine(layerHeight);
		 *
		 *   fab.triangle(40, 40, 100, 40, 70, 100, layerHeight);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		triangle(x1, y1, x2, y2, x3, y3, z) {
			this._strokePolyline(
				[
					{ x: x1, y: y1 },
					{ x: x2, y: y2 },
					{ x: x3, y: y3 }
				],
				z
			);
		}

		/**
		 * Extrude a quadrilateral outline through four corners, coplanar at layer height `z`.
		 * @group Shapes
		 * @param {number} x1 - First corner X in mm.
		 * @param {number} y1 - First corner Y in mm.
		 * @param {number} x2 - Second corner X in mm.
		 * @param {number} y2 - Second corner Y in mm.
		 * @param {number} x3 - Third corner X in mm.
		 * @param {number} y3 - Third corner Y in mm.
		 * @param {number} x4 - Fourth corner X in mm.
		 * @param {number} y4 - Fourth corner Y in mm.
		 * @param {number} z - Layer height in mm.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   fab.introLine(layerHeight);
		 *
		 *   fab.quad(40, 40, 110, 50, 100, 110, 30, 90, layerHeight);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		quad(x1, y1, x2, y2, x3, y3, x4, y4, z) {
			this._strokePolyline(
				[
					{ x: x1, y: y1 },
					{ x: x2, y: y2 },
					{ x: x3, y: y3 },
					{ x: x4, y: y4 }
				],
				z
			);
		}

		/**
		 * Set how the `(x, y)` and size arguments of `rect()` / `square()` are interpreted.
		 *
		 * <ul>
		 * <li>`CORNER` (default): `(x, y)` is the top-left corner; `w`/`h` are the width/height.</li>
		 * <li>`CORNERS`: `(x, y)` and `(w, h)` are two opposite corners of the rectangle.</li>
		 * <li>`CENTER`: `(x, y)` is the center; `w`/`h` are the width/height.</li>
		 * <li>`RADIUS`: `(x, y)` is the center; `w`/`h` are half the width/height.</li>
		 * </ul>
		 *
		 * Follows `rectMode()` in p5.js. Resets to `CORNER` at the start of each `fabDraw()`.
		 * @group Shapes
		 * @param {string} mode - `CORNER`, `CORNERS`, `CENTER`, or `RADIUS`.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const z = 0.2;
		 *
		 *   // Default CORNER: (x, y) is the top-left corner
		 *   fab.rect(40, 40, z, 40, 30);
		 *
		 *   // CENTER: (x, y) is the middle of the rectangle
		 *   fab.rectMode(CENTER);
		 *   fab.rect(130, 60, z, 40, 30);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		rectMode(mode) {
			this._rectMode = this._validShapeMode(
				mode,
				'rectMode',
				['corner', 'corners', 'center', 'radius'],
				this._rectMode
			);
		}

		/**
		 * Set how the `(x, y)` and size arguments of `ellipse()` / `circle()` / `ngon()` are interpreted.
		 *
		 * <ul>
		 * <li>`CENTER` (default): `(x, y)` is the center; `w`/`h` (or `d`) are the full width/height (diameters).</li>
		 * <li>`RADIUS`: `(x, y)` is the center; `w`/`h` (or `d`) are radii, so the shape is twice as large as in `CENTER`.</li>
		 * <li>`CORNER`: `(x, y)` is the top-left of the bounding box; `w`/`h` are its width/height.</li>
		 * <li>`CORNERS`: `(x, y)` and `(w, h)` are two opposite corners of the bounding box.</li>
		 * </ul>
		 *
		 * Follows `ellipseMode()` in p5.js. Resets to `CENTER` at the start of each `fabDraw()`.
		 * @group Shapes
		 * @param {string} mode - `CENTER`, `RADIUS`, `CORNER`, or `CORNERS`.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const z = 0.2;
		 *
		 *   // Default CENTER: d is a diameter -> 20mm-wide circle
		 *   fab.circle(60, 60, z, 20);
		 *
		 *   // RADIUS: d is a radius -> 40mm-wide circle (twice as big)
		 *   fab.ellipseMode(RADIUS);
		 *   fab.circle(130, 60, z, 20);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		ellipseMode(mode) {
			this._ellipseMode = this._validShapeMode(
				mode,
				'ellipseMode',
				['center', 'radius', 'corner', 'corners'],
				this._ellipseMode
			);
		}

		/**
		 * Begin an extruded path built from `vertex()` points.
		 *
		 * The first `vertex()` after `beginShape()` positions the nozzle at the start of the
		 * path; every following `vertex()` extrudes to the next point. `mode` chooses how the
		 * first move is made i.e. how the nozzle reaches the path start:
		 *
		 * <ul>
		 * <li>`TRAVEL`: retract, z-hop, and re-prime (the default; like `travelTo()`)</li>
		 * <li>`RETRACT`: retract and re-prime, no z-hop (like `retractTo()`)</li>
		 * <li>`MOVE`: a plain move with no retraction or z-hop (like `moveTo()`)</li>
		 * <li>`EXTRUDE`: extrude from the current position to the first point (like `extrudeTo()`)</li>
		 * </ul>
		 *
		 * Call `endShape()` to finish, or `endShape(CLOSE)` to extrude back to the first vertex.
		 * The functionality follows `beginShape()` / `vertex()` / `endShape()` in p5.js.
		 * @group Structure
		 * @param {string} [mode=TRAVEL] - Lead-in for the first vertex: `TRAVEL`, `RETRACT`, `MOVE`, or `EXTRUDE`.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   fab.introLine(layerHeight);
		 *
		 *   // Travel to the first point, then extrude a triangle and close it
		 *   fab.beginShape();
		 *   fab.vertex(60, 60, layerHeight);
		 *   fab.vertex(140, 60);
		 *   fab.vertex(100, 130);
		 *   fab.endShape(CLOSE);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		beginShape(mode = TRAVEL) {
			this._shapeLeadIn = mode;
			this._shapeStarted = false;
			this._shapeFirstVertex = null;
		}

		/**
		 * Add a point to the current path (between `beginShape()` and `endShape()`).
		 *
		 * The first `vertex()` moves to the point using the lead-in chosen by `beginShape()`;
		 * each later `vertex()` extrudes to the point. `z` is optional: supply it to change
		 * layer height, or omit it to stay in the current z-plane (like `extrudeToXY()`).
		 *
		 * `vertex()` takes only coordinates. To vary speed or extrusion along a path, set
		 * `printSpeed()` / `speed()` or `extrusionMultiplier()` between vertices. For a one-off
		 * explicit extrusion amount, use e.g., `extrudeTo()`.
		 * @group Structure
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} [z] - Target Z position in mm. Defaults to the current Z if omitted.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   fab.introLine(layerHeight);
		 *
		 *   // Extrude a stacked square, climbing one layer per loop
		 *   fab.beginShape();
		 *   for (let z = layerHeight; z < 20; z += layerHeight) {
		 *     fab.vertex(60, 60, z);
		 *     fab.vertex(140, 60);
		 *     fab.vertex(140, 140);
		 *     fab.vertex(60, 140);
		 *   }
		 *   fab.endShape(CLOSE);
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		vertex(x, y, z) {
			const has3D = z !== undefined;
			const resolvedZ = has3D ? z : this._plannedPosition.z;

			if (!this._shapeStarted) {
				this._shapeStarted = true;
				this._shapeFirstVertex = { x, y, z: resolvedZ };
				this._leadInTo(x, y, resolvedZ, this._shapeLeadIn);
				return;
			}

			if (has3D) this.extrudeTo(x, y, z);
			else this.extrudeToXY(x, y);
		}

		/**
		 * Finish the current path started with `beginShape()`.
		 *
		 * Pass `CLOSE` to extrude a final segment back to the first vertex, closing the loop.
		 * The functionality follows `endShape()` in p5.js.
		 * @group Structure
		 * @param {string} [mode] - Pass `CLOSE` to close the path back to the first vertex.
		 * @example
		 * function setup() {
		 *   createCanvas(windowWidth, windowHeight, WEBGL);
		 * }
		 *
		 * function fabDraw() {
		 *   fab.autoHome();
		 *   fab.setTemps(200, 60);
		 *   const layerHeight = 0.2;
		 *   fab.introLine(layerHeight);
		 *
		 *   fab.beginShape();
		 *   fab.vertex(60, 60, layerHeight);
		 *   fab.vertex(140, 60);
		 *   fab.vertex(100, 130);
		 *   fab.endShape(CLOSE); // extrude back to (60, 60)
		 * }
		 *
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		endShape(mode) {
			const isClose = mode === 'close' || (typeof CLOSE !== 'undefined' && mode === CLOSE);
			if (isClose && this._shapeFirstVertex) {
				const v = this._shapeFirstVertex;
				this.extrudeTo(v.x, v.y, v.z);
			}
			this._shapeStarted = false;
			this._shapeFirstVertex = null;
		}

		/**
		 * Set both the print and travel speed defaults simultaneously.
		 * Equivalent to calling `printSpeed(printV)` and `travelSpeed(travelV)`.
		 * One argument sets both to the same value; two arguments set each independently.
		 * Resets to printer profile defaults at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 *
		 *  All speeds will be clamped by the `maxSpeed` settings for each axis.
		 * @group Print control
		 * @param {number} printV - Print speed in mm/sec (used for extrusion moves).
		 * @param {number} [travelV=printV] - Travel speed in mm/sec (used for non-extrusion moves). Defaults to `printV` if omitted.
		 */
		speed(printV, travelV = printV) {
			this._printSpeed = this._validSpeed(printV, 'print speed', this._printSpeed);
			this._travelSpeed = this._validSpeed(travelV, 'travel speed', this._travelSpeed);
		}

		/**
		 * Set the default feedrate for extrusion moves.
		 * Applies to all subsequent extrusion moves until changed. Inline `v` on an individual extrusion command overrides for that move only.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 *
		 * All speeds will be clamped by the `maxSpeed` settings for each axis.
		 * @group Print control
		 * @param {number} v - Print speed in mm/sec.
		 */
		printSpeed(v) {
			this._printSpeed = this._validSpeed(v, 'print speed', this._printSpeed);
		}

		/**
		 * Set the default feedrate for moves without extrusion.
		 * Applies to all subsequent travel moves until changed. Inline `v` on an individual move overrides for that move only.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 *
		 *  All speeds will be clamped by the `maxSpeed` settings for each axis.
		 * @group Print control
		 * @param {number} v - Travel speed in mm/sec.
		 */
		travelSpeed(v) {
			this._travelSpeed = this._validSpeed(v, 'travel speed', this._travelSpeed);
		}

		// Friendly speed guard: a non-positive feedrate would stall the printer. Upper bounds
		// are already enforced by the per-axis maxSpeed settings during G-code generation.
		_validSpeed(v, label, fallback) {
			const n = parseFloat(v);
			if (isNaN(n) || n <= 0) {
				window.parent.postMessage(
					{
						type: 'output',
						body: `p5.fab says: ${label} must be greater than 0 (got ${v}) — keeping ${fallback}.`
					},
					'*'
				);
				return fallback;
			}
			return n;
		}

		/**
		 * Set the maximum feedrate for the X axis. Sent to firmware as `M203 X…`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Configuration
		 * @param {number} v - Max X speed in mm/s.
		 */
		maxSpeedX(v) {
			this._maxSpeedX = v;
			this._setMaxSpeeds();
		}

		/**
		 * Set the maximum feedrate for the Y axis. Sent to firmware as `M203 Y…`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Configuration
		 * @param {number} v - Max Y speed in mm/s.
		 */
		maxSpeedY(v) {
			this._maxSpeedY = v;
			this._setMaxSpeeds();
		}

		/**
		 * Set the maximum feedrate for the Z axis. Sent to firmware as `M203 Z…`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Configuration
		 * @param {number} v - Max Z speed in mm/s.
		 */
		maxSpeedZ(v) {
			this._maxSpeedZ = v;
			this._setMaxSpeeds();
		}

		/**
		 * Set the maximum feedrate for the extruder axis. Sent to firmware as `M203 E…`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Configuration
		 * @param {number} v - Max E speed in mm/s.
		 */
		maxSpeedE(v) {
			this._maxSpeedE = v;
			this._setMaxSpeeds();
		}

		/**
		 * Set the maximum acceleration for the X axis. Sent to firmware as `M201 X…`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Configuration
		 * @param {number} v - Max X acceleration in mm/s².
		 */
		maxAccelerationX(v) {
			this._maxAccelerationX = v;
			this._setMaxAccelerations();
		}

		/**
		 * Set the maximum acceleration for the Y axis. Sent to firmware as `M201 Y…`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Configuration
		 * @param {number} v - Max Y acceleration in mm/s².
		 */
		maxAccelerationY(v) {
			this._maxAccelerationY = v;
			this._setMaxAccelerations();
		}

		/**
		 * Set the maximum acceleration for the Z axis. Sent to firmware as `M201 Z…`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Configuration
		 * @param {number} v - Max Z acceleration in mm/s².
		 */
		maxAccelerationZ(v) {
			this._maxAccelerationZ = v;
			this._setMaxAccelerations();
		}

		/**
		 * Set the maximum acceleration for the extruder axis. Sent to firmware as `M201 E…`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Configuration
		 * @param {number} v - Max E acceleration in mm/s².
		 */
		maxAccelerationE(v) {
			this._maxAccelerationE = v;
			this._setMaxAccelerations();
		}

		/**
		 * Set the acceleration used for print moves. Sent to firmware as `M204 P…`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Print control
		 * @param {number} v - Print acceleration in mm/s².
		 */
		printAcceleration(v) {
			this._printAcceleration = v;
			this._setMaxAccelerations();
		}

		/**
		 * Set the acceleration used for travel moves. Sent to firmware as `M204 T…`.
		 * Resets to the printer profile default at the start of each `fabDraw()` call.
		 * Use `push()` / `pop()` to scope a temporary change.
		 * @group Print control
		 * @param {number} v - Travel acceleration in mm/s².
		 */
		travelAcceleration(v) {
			this._travelAcceleration = v;
			this._setMaxAccelerations();
		}

		/** @deprecated Use `speed()` instead. */
		setSpeed(v) {
			if (!this._deprecationWarned.has('setSpeed')) {
				this._deprecationWarned.add('setSpeed');
				window.parent.postMessage(
					{ type: 'output', body: 'p5.fab: setSpeed() is deprecated — use speed() instead.' },
					'*'
				);
			}
			this.speed(v);
		}

		_setMaxSpeeds() {
			this.enqueue(
				`M203 X${this._maxSpeedX} Y${this._maxSpeedY} Z${this._maxSpeedZ} E${this._maxSpeedE}`
			);
		}

		_setMaxAccelerations() {
			this.enqueue(
				`M201 X${this._maxAccelerationX} Y${this._maxAccelerationY} Z${this._maxAccelerationZ} E${this._maxAccelerationE}`
			);
			this.enqueue(`M204 P${this._printAcceleration} T${this._travelAcceleration}`);
		}

		_prime(de, v) {
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
			const cmd = `M201 X${x} Y${y} Z${z};`;
			this.enqueue(cmd);
		}

		/**
		 * Calculate the extrusion amount needed to move to an absolute XYZ position
		 * based on the current nozzle and filament diameters.
		 * @group Extrusion
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
		 * @group Motion
		 * @param {number} tool_idx - Zero-based tool index.
		 */
		pickupTool(tool_idx) {
			const cmd = `T${tool_idx}`;
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

	// `fab_command` (manual G-code from the editor info bar) is handled in preview.html,
	// which validates the parent origin. A listener here used a same-origin check that the
	// cross-origin sandbox parent can't satisfy, so it silently dropped every command.
})(typeof window !== 'undefined' ? window : globalThis);
