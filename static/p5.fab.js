// p5.fab — a p5.js library for digital fabrication.
// https://github.com/machineagency/p5.fab
// MIT License

(function (global) {
	let _fab;
	let _once = false;

	const moveCommands = ['G0', 'G1', 'G2', 'G3'];

	//===================================
	// Prototype Functions
	//===================================
	/**
	 * Creates and returns the global `fab` object. Call this once in `setup()`.
	 *
	 * `createFab()` is a singleton — calling it multiple times returns the same
	 * instance, preserving any open serial connection across hot-reloads.
	 *
	 * **Hot-reload behavior:** In the copypastes.xyz editor, `setup()` re-runs
	 * every time you run your sketch. This means changes to `setup()` (e.g.
	 * `setPrinter()`, canvas size) take effect immediately. However, avoid
	 * creating p5.js DOM elements (`createButton()`, `createSlider()`, etc.) in
	 * `setup()` — they will be duplicated on each run.
	 *
	 * @memberof Fab
	 * @returns {Fab} The global fab instance.
	 * @example
	 * function setup() {
	 *   fab = createFab();
	 *   fab.setPrinter('ender3');
	 * }
	 */
	p5.prototype.createFab = function () {
		if (!_fab) {
			_fab = new Fab();
		}
		global.fab = _fab;
		return _fab;
	};

	p5.prototype.getSerial = function () {
		return _fab.serial;
	};

	p5.prototype.printOnOpen = function () {
		_fab.serial.on('open', () => _fab.print());
	};

	p5.RendererGL.prototype.saveShape = function () {
		// Save shape as Geometry from immediate mode
		// This may become easier in future p5 releases
		// source: https://github.com/processing/p5.js/issues/5393#issuecomment-910100074
		if (this.immediateMode.shapeMode !== 0x0000)
			// POINTS
			this._processVertices(...arguments);
		this.isBezier = false;
		this.isQuadratic = false;
		this.isCurve = false;
		this.immediateMode._bezierVertex.length = 0;
		this.immediateMode._quadraticVertex.length = 0;
		this.immediateMode._curveVertex.length = 0;

		// Patch and return geometry
		let g = this.immediateMode.geometry;
		this._savedShapesCount = this._savedShapesCount + 1 || 0;

		// Assign gid to cache buffer
		g.gid = 'saved|' + this._savedShapesCount;

		// Shadow this function to avoid losing edges when `model(...)` is called
		g._makeTriangleEdges = function () {
			return this;
		};

		// Assign a new geometry to immediateMode to avoid pointer aliasing
		this.immediateMode.geometry = new p5.Geometry();

		return g;
	};

	p5.prototype.saveShape = function () {
		if (this._renderer.isP3D) {
			return this._renderer.saveShape(...arguments);
		} else {
			console.warn("Don't use saveShape in 2D mode.");
		}
	};

	p5.prototype.reloadSketch = function () {
		if (!_fab) {
			console.warn(
				'p5.fab: fab = createFab() was not called in setup(). Creating fab automatically.'
			);
			_fab = new Fab();
			global.fab = _fab;
		}
		if (typeof fabDraw === 'function') {
			_fab.lastAsyncPosition = new XYZEFC();
			_fab.plannedPosition = new XYZEFC();
			_fab.model = '';
			_fab.commands = [];
			fabDraw();
			_fab.parseGcode();
			_fab.syncVizStream = true;
		}
	};

	// Call reloadSketch once, immediately after setup and before first draw()
	// predraw is called before every draw, so use _once to ensure we only run once
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

	//===================================
	// Fab
	// Defaults to Ender3-Pro
	//===================================
	// Printer presets — loaded eagerly from /printers/<name>.json at script startup.
	// By the time a user runs a sketch these are guaranteed to be populated.
	const printerPresets = {};
	const _presetNames = ['ender3', 'prusa_mk3', 'jubilee'];
	Promise.all(
		_presetNames.map((name) =>
			fetch(`/printers/${name}.json`)
				.then((r) => r.json())
				.then((config) => {
					printerPresets[name] = config;
				})
				.catch((e) => console.warn(`p5.fab: could not load preset "${name}"`, e))
		)
	);

	const defaultPrinterSettings = {
		name: 'ender3',
		baudRate: 115200,
		nozzleDiameter: 0.8,
		filamentDiameter: 1.75,
		maxX: 220,
		maxY: 220,
		maxZ: 250,
		autoConnect: true
	};

	class Fab {
		constructor(config = defaultPrinterSettings) {
			this.configure(config);
			if (navigator.serial) {
				this.setupSerialConnection();
			}

			// Setup machine properties and initial state
			this.commands = []; // All commands to be sent to the machine
			this.commandStream = []; // For streaming to the printer
			this.lastAsyncPosition = new XYZEFC();
			this.plannedPosition = new XYZEFC();
			this.relativePositioning = false; // Position mode for XYZ; E is always relative
			this.reportedPos = {};
			this.gotInitPosition = false;
			this.isPrinting = false;

			// Rendering info
			this.vertices = [];
			this.model = '';
			this.camera = createCamera();
			this.camera.setPosition(0, 0, 400);
			this.cameraPosition = new p5.Vector(this.camera.eyeX, this.camera.eyeY, this.camera.eyeZ);
			this.cameraOrientation = new p5.Vector(
				this.camera.centerX,
				this.camera.centerY,
				this.camera.centerZ
			);
			this.recoverCameraPosition = true;
			this.syncVizStream = true;
			this.tempQueryIntervalID = null;
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
			this.maxZ = config.maxZ;
			if (config.coordinateSystem == 'delta') {
				this._maxX = (2 * config.radius) / sqrt(2);
				this._maxY = this._maxX;
				this.centerX = 0;
				this.centerY = 0;
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
				filamentDiameter: this.filamentDiameter
			};
			console.log('FAB_CONFIG', messageData);
		}

		set nozzleDiameter(d) {
			this._nozzleDiameter = d;
			var messageData = {
				property: 'nozzleDiameter',
				value: this._nozzleDiameter
			};
			console.log('FAB_CONFIG_CHANGE', messageData);
		}

		set filamentDiameter(d) {
			this._filamentDiameter = d;
			var messageData = {
				property: 'filamentDiameter',
				value: this._filamentDiameter
			};
			console.log('FAB_CONFIG_CHANGE', messageData);
		}

		set maxX(v) {
			this._maxX = v;
			this.centerX = v / 2;
			console.log('FAB_CONFIG_CHANGE', { property: 'maxX', value: v });
		}
		get maxX() {
			return this._maxX;
		}

		set maxY(v) {
			this._maxY = v;
			this.centerY = v / 2;
			console.log('FAB_CONFIG_CHANGE', { property: 'maxY', value: v });
		}
		get maxY() {
			return this._maxY;
		}

		set maxZ(v) {
			this._maxZ = v;
			console.log('FAB_CONFIG_CHANGE', { property: 'maxZ', value: v });
		}
		get maxZ() {
			return this._maxZ;
		}

		/**
		 * Configure the fab instance for a specific printer preset, with optional overrides.
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
				const available = Object.keys(printerPresets).join(', ') || 'none loaded yet';
				console.warn(`p5.fab: unknown printer preset "${name}". Available: ${available}`);
				return;
			}
			this.configure({ ...defaultPrinterSettings, ...preset, ...overrides });
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
				console.error('p5.fab: serial connection request failed.');
			});

			this.serial.on('data', this.onData);

			this.serial.on('open', function () {
				_fab.connected = true;
				window.parent.postMessage({ type: 'fab_status', body: { event: 'connection', connected: true } });
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
				window.parent.postMessage({ type: 'fab_status', body: { event: 'connection', connected: false } });
				clearInterval(_fab.tempQueryIntervalID);
				_fab.tempQueryIntervalID = null;
			});

			if (this.autoConnect) {
				this.serial.getPorts();
			}

			this.on('ok', this.serial_ok);
		}

		enqueue(cmd) {
			this.commands.push(cmd);
		}

		print() {
			if (this.isPrinting) {
				window.parent.postMessage({ type: 'fab_status', body: { event: 'print_error', reason: 'already_printing' } });
				return;
			}
			if (this.commands.length === 0) {
				window.parent.postMessage({ type: 'fab_status', body: { event: 'print_error', reason: 'no_commands' } });
				return;
			}
			if (this.syncVizStream) {
				this.commandStream = this.commands;
				this.syncVizStream = false;
			}

			if (this.commandStream.length > 0) {
				this.isPrinting = true;
				window.parent.postMessage({ type: 'fab_status', body: { event: 'print_start' } });
				const cmd = this.commandStream[0];
				this.serial.write(cmd + '\n');
				this._postPositionFromCmd(cmd);
				this.commandStream.shift();
			} else {
				this.isPrinting = false;
				window.parent.postMessage({ type: 'fab_status', body: { event: 'print_complete' } });
			}
		}

		printStream() {
			// TODO: Do I need print() and printStream()?
			if (this.commandStream.length > 0) {
				this.isPrinting = true;
				const cmd = this.commandStream[0];
				this.serial.write(cmd + '\n');
				this._postPositionFromCmd(cmd);
				this.commandStream.shift();
			} else {
				this.isPrinting = false;
				window.parent.postMessage({ type: 'fab_status', body: { event: 'print_complete' } });
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
				window.parent.postMessage({ type: 'fab_status', body });
			}
		}

		onData = () => {
			this.serialResp += this.serial.readString();

			if (this.serialResp.slice(-1) !== '\n') return;

			const lines = this.serialResp.split('\n').map(l => l.trim()).filter(l => l.length > 0);
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
						window.parent.postMessage({ type: 'fab_status', body: { event: 'temp', ...tempBody } });
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
				this.plannedPosition.x = this.reportedPos['X'];
				this.plannedPosition.y = this.reportedPos['Y'];
				this.plannedPosition.z = this.reportedPos['Z'];
				this.lastAsyncPosition.x = this.reportedPos['X'];
				this.lastAsyncPosition.y = this.reportedPos['Y'];
				this.lastAsyncPosition.z = this.reportedPos['Z'];
				this.gotInitPosition = true;
			}

			window.parent.postMessage({
				type: 'fab_status',
				body: {
					event: 'position',
					x: parseFloat(this.reportedPos['X']),
					y: parseFloat(this.reportedPos['Y']),
					z: parseFloat(this.reportedPos['Z']),
				}
			});
		}

		parseGcode() {
			this.vertices = [];
			this.commands.forEach((cmd) => {
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

		/**
		 * Render a 3D preview of the planned toolpath. Call this inside a WEBGL p5.js `draw()` loop.
		 * @example
		 * function draw() {
		 *   background(255);
		 *   fab.render();
		 * }
		 */
		render() {
			if (this.coordinateSystem == 'delta') {
				this.drawDeltaPrinter();
			} else {
				this.drawCartesianPrinter();
			}

			// if (this.vertices.length == 0) {
			//   this.updateCameraPosition();
			//   return
			// };
			if (!this.model) {
				// Tracks current toolpath position
				// Assumes you're homed to start
				// TODO: Incorporate initial position?
				var toolpathPos = new p5.Vector(0, 0, 0);
				beginShape(LINES);
				for (let v in this.vertices) {
					v = parseInt(v);
					var vertexData = this.vertices[v];
					if (vertexData.command == 'G0') {
						// Update toolpath position
						// stroke(0,0,255);
						// vertex(toolpathPos.x, toolpathPos.y, toolpathPos.z);
						// vertex(vertexData.vertex.x, vertexData.vertex.y, vertexData.vertex.z);
						toolpathPos = toolpathPos.set([
							vertexData.vertex.x,
							vertexData.vertex.y,
							vertexData.vertex.z
						]);
						continue; // no extrusions on G0
					} else if (vertexData.command == 'G1') {
						stroke(0);
						// Draw a line between current toolpath position and next toolpath position
						vertex(toolpathPos.x, toolpathPos.y, toolpathPos.z);
						vertex(vertexData.vertex.x, vertexData.vertex.y, vertexData.vertex.z);
						toolpathPos = toolpathPos.set([
							vertexData.vertex.x,
							vertexData.vertex.y,
							vertexData.vertex.z
						]);
					}
				}
				endShape();
				this.model = saveShape();
			} else {
				model(this.model);
			}
			pop();

			// Update camera position & orientation
			if (this.recoverCameraPosition) {
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

		drawCartesianPrinter() {
			orbitControl(2, 2, 0.1);

			translate(-this.maxX / 2, 0.25 * this.maxZ, -this.maxY / 2);
			rotateY(PI);
			scale(-1, 1);
			push();
			translate(this.maxX / 2, 0, this.maxY / 2);
			rotateY(PI / 12);
			rotateX(PI / 12);
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
			orbitControl(2, 2, 0.1);

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
		 * @param {number} t - Target nozzle temperature in °C.
		 */
		setNozzleTemp(t) {
			const cmd = `M109 S${t}`;
			this.enqueue(cmd);
			return cmd;
		}

		/**
		 * Set the bed temperature and wait for it to be reached before continuing.
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
		 */
		fanOn() {
			const cmd = 'M106';
			this.enqueue(cmd);
		}

		/**
		 * Turn the part cooling fan off.
		 */
		fanOff() {
			const cmd = 'M107';
			this.enqueue(cmd);
		}

		/**
		 * Pause the print for a given duration.
		 * @param {number|null} [t=null] - Duration in seconds. Defaults to 10s if not provided.
		 */
		pausePrint(t = null) {
			const cmd = t ? `M1 S${t}` : 'M1 S10 this is a pause';
			this.commandStream.unshift(cmd);
		}

		/**
		 * Immediately stop the print and clear the command queue.
		 */
		stopPrint() {
			this.commandStream = [];
			this.isPrinting = false;
			fabDraw();
		}

		restartPrinter() {
			const cmd = 'M999';
			this.enqueue(cmd);
			this.print();
		}

		/**
		 * Print a priming line along the left edge of the bed to prepare the extruder.
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
			const cmd = `G92 X${this.plannedPosition.x} Y${this.plannedPosition.y} Z${this.plannedPosition.z} E${this.plannedPosition.e}`;
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
			this.lastAsyncPosition = { ...this.plannedPosition };
			if (!this.relativePositioning) {
				if (x !== null) {
					this.plannedPosition.x = parseFloat(x).toFixed(2);
				}
				if (y !== null) {
					this.plannedPosition.y = parseFloat(y).toFixed(2);
				}
				if (z !== null) {
					this.plannedPosition.z = parseFloat(z).toFixed(2);
				}
			} else {
				if (x !== null) {
					this.plannedPosition.x = (parseFloat(this.plannedPosition.x) + parseFloat(x)).toFixed(2);
				}
				if (y !== null) {
					this.plannedPosition.y = (parseFloat(this.plannedPosition.y) + parseFloat(y)).toFixed(2);
				}
				if (z !== null) {
					this.plannedPosition.z = (parseFloat(this.plannedPosition.z) + parseFloat(z)).toFixed(2);
				}
			}

			// E is relative
			if (e) {
				// CHANGED THIS TO toFixed(4) instead of 2
				this.plannedPosition.e = parseFloat(e).toFixed(4);
			} else {
				this.plannedPosition.e = 0;
			}

			if (v) {
				const f = this.mm_sec_to_mm_min(v);
				this.plannedPosition.f = parseFloat(f).toFixed(2);
			}

			if (comment) {
				this.plannedPosition.c = `;${comment}`;
			} else {
				this.plannedPosition.c = '';
			}
		}

		_moveXYZE({ x = null, y = null, z = null, e = null, v = null, comment = null } = {}) {
			// Handle all movement commands. Set absolute/relative mode externally.
			this.updateAsyncPosition({ x: x, y: y, z: z, e: e, v: v, comment: comment });

			// Use G1 for extrude commands
			var moveType = e ? 'G1' : 'G0';

			// Always send aboslute position?
			this.setAbsolutePositionXYZ();
			const cmd = `${moveType} X${this.plannedPosition.x} Y${this.plannedPosition.y} Z${this.plannedPosition.z} E${this.plannedPosition.e} F${this.plannedPosition.f} ${this.plannedPosition.c} `;

			this.enqueue(cmd);
			return cmd;
		}

		/**
		 * Move to an absolute XYZ position without extruding.
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
		 * Extrusion amount is calculated automatically from the move distance if not provided.
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount in mm. Calculated automatically if null.
		 * @param {boolean} [multiplier=false] - If true, treat `e` as a multiplier on the auto-calculated extrusion.
		 * @example
		 * function fabDraw() {
		 *   fab.moveExtrude(100, 100, 0.2, 1500); // extrude to (100, 100)
		 * }
		 */
		moveExtrude(x, y, z, v, e = null, multiplier = false) {
			if (e == null) {
				e = this.makeE(x, y, z);
			} else if (multiplier) {
				e = e * this.makeE(x, y, z);
			}

			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x: x, y: y, z: z, e: e, v: v });
		}

		/**
		 * Move to an absolute position with a filament retraction, z-hop, and re-prime.
		 * Use this to travel between disconnected extrusion paths without stringing.
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number} [e=8] - Amount to retract/re-prime in mm.
		 * @example
		 * function fabDraw() {
		 *   fab.moveExtrude(50, 50, 0.2, 1500);
		 *   fab.moveRetract(100, 100, 0.2, 3000); // travel without stringing
		 *   fab.moveExtrude(150, 50, 0.2, 1500);
		 * }
		 */
		moveRetract(x, y, z, v, e = 8) {
			this.moveE(-1 * e);
			this.moveZ(0.2);
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x: x, y: y, z: z, v: v });
			this.prime(e);
			this.moveZ(-0.2);
		}

		/**
		 * Move to an absolute position with a 2mm z-hop over the travel path.
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
		 * @param {number} x - Target X position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveToX(x, v) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x: x, v: v });
		}

		/**
		 * Move to an absolute Y position without extruding.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveToY(y, v) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ y: y, v: v });
		}

		/**
		 * Move to an absolute Z position without extruding.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveToZ(z, v) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ z: z, v: v });
		}

		/**
		 * Move the extruder to an absolute E position.
		 * @param {number} e - Target E position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveToE(e, v) {
			this.setAbsolutePositionXYZ();
			this._moveXYZE({ e: e, v: v });
		}

		/**
		 * Move a relative distance in X without extruding.
		 * @param {number} dx - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveX(dx, v) {
			this.move(dx, 0, 0, v);
		}

		/**
		 * Move a relative distance in Y without extruding.
		 * @param {number} dy - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveY(dy, v) {
			this.move(0, dy, 0, v);
		}

		/**
		 * Move a relative distance in Z without extruding.
		 * @param {number} dz - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveZ(dz, v) {
			this.move(0, 0, dz, v);
		}

		/**
		 * Move the extruder a relative distance in E.
		 * @param {number} de - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 */
		moveE(de, v) {
			this.setRelativePosition();
			this._moveXYZE({ e: de, v: v });
		}

		/**
		 * Move a relative distance in X while extruding.
		 * @param {number} dx - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} e - Extrusion amount in mm. Calculated automatically if null.
		 * @param {boolean} [multiplier=false] - If true, treat `e` as a multiplier on the auto-calculated extrusion.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function fabDraw() {
		 *   fab.extrudeX(50, 1500); // extrude a 50mm line in X
		 * }
		 */
		extrudeX(dx, v, e, multiplier = false, comment = '') {
			if (e == null) {
				e = this.makeE(
					parseFloat(this.plannedPosition.x) + parseFloat(dx),
					this.plannedPosition.y,
					this.plannedPosition.z
				);
			} else if (multiplier) {
				e =
					e *
					this.makeE(
						parseFloat(this.plannedPosition.x) + parseFloat(dx),
						parseFloat(this.plannedPosition.y),
						parseFloat(this.plannedPosition.z)
					);
			}

			this.setRelativePosition();
			this._moveXYZE({ x: dx, e: e, v: v, comment: comment });
		}

		/**
		 * Move a relative distance in X and Y while extruding.
		 * @param {number} dx - Distance to move in X in mm.
		 * @param {number} dy - Distance to move in Y in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} e - Extrusion amount in mm. Calculated automatically if null.
		 * @param {boolean} [multiplier=false] - If true, treat `e` as a multiplier on the auto-calculated extrusion.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function fabDraw() {
		 *   fab.extrudeXY(30, 40, 1500); // extrude diagonally
		 * }
		 */
		extrudeXY(dx, dy, v, e, multiplier = false, comment = '') {
			if (e == null) {
				e = this.makeE(
					parseFloat(this.plannedPosition.x) + parseFloat(dx),
					parseFloat(this.plannedPosition.y) + parseFloat(dy),
					this.plannedPosition.z
				);
			} else if (multiplier) {
				e =
					e *
					this.makeE(
						parseFloat(this.plannedPosition.x) + parseFloat(dx),
						parseFloat(this.plannedPosition.y) + parseFloat(dy),
						parseFloat(this.plannedPosition.z)
					);
			}

			this.setRelativePosition();
			this._moveXYZE({ x: dx, y: dy, e: e, v: v, comment: comment });
		}

		/**
		 * Move a relative distance in Y while extruding.
		 * @param {number} dy - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} e - Extrusion amount in mm. Calculated automatically if null.
		 * @param {boolean} [multiplier=false] - If true, treat `e` as a multiplier on the auto-calculated extrusion.
		 */
		extrudeY(dy, v, e, multiplier = false) {
			if (e == null) {
				e = this.makeE(
					parseFloat(this.plannedPosition.x),
					parseFloat(this.plannedPosition.y) + parseFloat(dy),
					parseFloat(this.plannedPosition.z)
				);
			} else if (multiplier) {
				e =
					e *
					this.makeE(
						parseFloat(this.plannedPosition.x),
						parseFloat(this.plannedPosition.y) + parseFloat(dy),
						parseFloat(this.plannedPosition.z)
					);
			}

			this.setRelativePosition();
			this._moveXYZE({ y: dy, e: e, v: v });
		}

		/**
		 * Move a relative distance in Z while extruding.
		 * @param {number} dz - Distance to move in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} e - Extrusion amount in mm. Calculated automatically if null.
		 * @param {boolean} [multiplier=false] - If true, treat `e` as a multiplier on the auto-calculated extrusion.
		 */
		extrudeZ(dz, v, e, multiplier = false) {
			if (e == null) {
				e = this.makeE(
					parseFloat(this.plannedPosition.x),
					parseFloat(this.plannedPosition.y),
					parseFloat(this.plannedPosition.z) + parseFloat(dz)
				);
			} else if (multiplier) {
				e =
					e *
					this.makeE(
						parseFloat(this.plannedPosition.x),
						parseFloat(this.plannedPosition.y),
						parseFloat(this.plannedPosition.z) + parseFloat(dz)
					);
			}

			this.setRelativePosition();
			this._moveXYZE({ z: dz, e: e, v: v });
		}

		/**
		 * Move to an absolute X position while extruding.
		 * @param {number} x - Target X position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} e - Extrusion amount in mm. Calculated automatically if null.
		 * @param {boolean} [multiplier=false] - If true, treat `e` as a multiplier on the auto-calculated extrusion.
		 * @param {string} [comment=''] - Optional G-code comment.
		 */
		extrudeToX(x, v, e, multiplier = false, comment = '') {
			if (e == null) {
				e = this.makeE(parseFloat(x), this.plannedPosition.y, this.plannedPosition.z);
			} else if (multiplier) {
				e =
					e *
					this.makeE(
						parseFloat(x),
						parseFloat(this.plannedPosition.y),
						parseFloat(this.plannedPosition.z)
					);
			}

			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x: x, e: e, v: v, comment: comment });
		}

		/**
		 * Move to an absolute Y position while extruding.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} e - Extrusion amount in mm. Calculated automatically if null.
		 * @param {boolean} [multiplier=false] - If true, treat `e` as a multiplier on the auto-calculated extrusion.
		 * @param {string} [comment=''] - Optional G-code comment.
		 */
		extrudeToY(y, v, e, multiplier = false, comment = '') {
			if (e == null) {
				e = this.makeE(this.plannedPosition.x, parseFloat(y), this.plannedPosition.z);
			} else if (multiplier) {
				e =
					e *
					this.makeE(
						parseFloat(this.plannedPosition.x),
						parseFloat(y),
						parseFloat(this.plannedPosition.z)
					);
			}

			this.setAbsolutePositionXYZ();
			this._moveXYZE({ y: y, e: e, v: v, comment: comment });
		}

		/**
		 * Move to an absolute XY position while extruding.
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} e - Extrusion amount in mm. Calculated automatically if null.
		 * @param {boolean} [multiplier=false] - If true, treat `e` as a multiplier on the auto-calculated extrusion.
		 * @param {string} [comment=''] - Optional G-code comment.
		 * @example
		 * function fabDraw() {
		 *   fab.extrudeToXY(100, 100, 1500); // extrude to absolute position
		 * }
		 */
		extrudeToXY(x, y, v, e, multiplier = false, comment = '') {
			if (e == null) {
				e = this.makeE(parseFloat(x), parseFloat(y), this.plannedPosition.z);
			} else if (multiplier) {
				e = e * this.makeE(parseFloat(x), parseFloat(y), parseFloat(this.plannedPosition.z));
			}

			this.setAbsolutePositionXYZ();
			this._moveXYZE({ x: x, y: y, e: e, v: v, comment: comment });
		}

		/**
		 * Move to an absolute Z position while extruding.
		 * @param {number} z - Target Z position in mm.
		 * @param {number} v - Feedrate in mm/min.
		 * @param {number|null} e - Extrusion amount in mm. Calculated automatically if null.
		 * @param {boolean} [multiplier=false] - If true, treat `e` as a multiplier on the auto-calculated extrusion.
		 * @param {string} [comment=''] - Optional G-code comment.
		 */
		extrudeToZ(z, v, e, multiplier = false, comment = '') {
			if (e == null) {
				e = this.makeE(this.plannedPosition.x, this.plannedPosition.y, parseFloat(z));
			} else if (multiplier) {
				e =
					e *
					this.makeE(
						parseFloat(this.plannedPosition.x),
						parseFloat(this.plannedPosition.y),
						parseFloat(z)
					);
			}

			this.setAbsolutePositionXYZ();
			this._moveXYZE({ z: z, e: e, v: v, comment: comment });
		}

		/**
		 * Extrude a circle centered at (x, y) at the given Z height.
		 * @param {number} x - Center X position in mm.
		 * @param {number} y - Center Y position in mm.
		 * @param {number} z - Z height in mm.
		 * @param {number} d - Diameter in mm.
		 * @param {number} [v] - Feedrate in mm/min.
		 * @param {number|null} [e=null] - Extrusion amount per segment. Calculated automatically if null.
		 * @param {boolean} [multiplier=false] - If true, treat `e` as a multiplier on auto-calculated extrusion.
		 * @example
		 * function fabDraw() {
		 *   fab.circle(110, 110, 0.2, 20, 1500);
		 * }
		 */
		circle(x, y, z, d, v, e = null, multiplier = false) {
			const r = d / 2;
			const segments = Math.max(16, Math.ceil(Math.PI * d));
			this.moveRetract(x + r, y, z, v);
			for (let i = 1; i <= segments; i++) {
				const angle = (i / segments) * Math.PI * 2;
				this.extrudeToXY(x + r * Math.cos(angle), y + r * Math.sin(angle), v, e, multiplier);
			}
		}

		/**
		 * Set the feedrate for subsequent moves.
		 * @param {number} v - Feedrate in mm/min.
		 */
		setSpeed(v) {
			this._moveXYZE({ v: v });
		}

		/**
		 * Prime the extruder by pushing filament forward. Used after a retraction.
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
		 * @param {number} a - Acceleration in mm/s².
		 */
		setStartAcceleration(a) {
			var cmd = `M204 P${a};`;
			this.enqueue(cmd);
		}

		/**
		 * Calculate the extrusion amount needed to move to an absolute XYZ position
		 * based on the current nozzle and filament diameters.
		 * @param {number} x - Target X position in mm.
		 * @param {number} y - Target Y position in mm.
		 * @param {number} z - Target Z position in mm.
		 * @returns {string} Extrusion amount in mm, fixed to 4 decimal places.
		 */
		makeE(x, y, z) {
			const dist3D = (x, y, z) =>
				sqrt(
					(x - this.plannedPosition.x) ** 2 +
						(y - this.plannedPosition.y) ** 2 +
						(z - this.plannedPosition.z) ** 2
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
		 * @param {number} tool_idx - Zero-based tool index.
		 */
		pickupTool(tool_idx) {
			var cmd = `T${tool_idx}`;
			this.enqueue(cmd);
		}

		/**
		 * Append a comment to the last command in the queue.
		 * @param {string} c - Comment text (without the leading semicolon).
		 */
		addComment(c) {
			_fab.commands[_fab.commands.length - 1] += ` ;${c}`;
			_fab.commandStream[_fab.commandStream.length - 1] += ` ;${c}`;
		}
	}

	function windowResized() {
		try {
			_fab.recoverCameraPosition = true;
			resizeCanvas(windowWidth, windowHeight);
		} catch (e) {
			console.log(e);
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
