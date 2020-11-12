import { EventDispatcher } from "../../EventDispatcher.js";

let sg = new THREE.SphereGeometry(1, 20, 20);
let sgHigh = new THREE.SphereGeometry(1, 128, 128);

let sm = new THREE.MeshBasicMaterial({side: THREE.BackSide});
let smHovered = new THREE.MeshBasicMaterial({side: THREE.BackSide, color: 0xff0000});

let raycaster = new THREE.Raycaster();
let currentlyHovered = null;

let previousView = {
	controls: null,
	position: null,
	target: null,
};

const timeout = 0;

export class Image360{
	constructor(file, time, longitude, latitude, altitude, course, pitch, roll){
		this.file = file;
		this.time = time;
		this.longitude = longitude;
		this.latitude = latitude;
		this.altitude = altitude;
		this.course = course;
		this.pitch = pitch;
		this.roll = roll;
		this.mesh = null;
	}
};

export class Images360 extends EventDispatcher{
	constructor(viewer){
		super();

		this.viewer = viewer;
		this.selectingEnabled = true;

		this.images = [];
		this.node = new THREE.Object3D();
		this.sphere = new THREE.Mesh(sgHigh, sm);
		this.sphere.visible = false;
		this.sphere.scale.set(1000, 1000, 1000);
		this.node.add(this.sphere);

		this._visible = true;

		this.focusedImage = null;
		this.nextPreviousDirection;
		this.oldFov = 0;
		this.oldSpeed = 0;
		this.oldEdlOpacity = 0;

		this.zoomOn = e => {
			const minFov = 20.0;
			const maxFov = 100.0

			let fov = this.viewer.getFOV() - e.delta;

			if (fov > maxFov) {
				fov = maxFov;
			}

			if (fov < minFov) {
				fov = minFov;
			}

			this.viewer.setFOV(fov);
		};

		this.keyDown = e => {
			const deltaStep = 5;
			const yawStep = Math.PI/18.0;
    		const keyCode = parseInt(e.which);

    		// up, W
    		if (keyCode === 87 || keyCode === 38) {
        		this.focusNearestImage(true)
			// down, S
    		} else if (keyCode == 83 || keyCode === 40) {
        		this.focusNearestImage(false)
			// left
    		} else if (keyCode == 37) {
				this.viewer.orbitControls.yawDelta -= yawStep;
			// right
    		} else if (keyCode == 39) {
				this.viewer.orbitControls.yawDelta += yawStep;
			// +
    		} else if (keyCode == 187) {
    			e.delta = deltaStep;
        		this.zoomOn(e)
			// -
    		} else if (keyCode == 189) {
    			e.delta = -deltaStep;
        		this.zoomOn(e)
    		}
		};

		let elUnfocus = document.createElement("button");
		elUnfocus.innerHTML = "x";
		elUnfocus.style.position = "absolute";
		elUnfocus.style.right = "10px";
		elUnfocus.style.bottom = "20px";
		elUnfocus.style.zIndex = "10000";
		elUnfocus.style.fontSize = "1.5em";
		elUnfocus.style.cursor = "pointer";
		elUnfocus.style.paddingBottom = "2px";
		elUnfocus.addEventListener("click", () => this.exit());
		this.elUnfocus = elUnfocus;

		let elPrev = document.createElement("button");
		elPrev.innerHTML = "&darr;";
		elPrev.style.position = "absolute";
		elPrev.style.right = "10px";
		elPrev.style.bottom = "60px";
		elPrev.style.zIndex = "10000";
		elPrev.style.fontSize = "1.5em";
		elPrev.style.cursor = "pointer";
		elPrev.style.paddingBottom = "2px";
		elPrev.addEventListener("click", () => this.focusNearestImage(false));
		this.elPrev = elPrev;

		let elNext = document.createElement("button");
		elNext.innerHTML = "&uarr;";
		elNext.style.position = "absolute";
		elNext.style.right = "10px";
		elNext.style.bottom = "100px";
		elNext.style.zIndex = "10000";
		elNext.style.fontSize = "1.5em";
		elNext.style.cursor = "pointer";
		elNext.style.paddingBottom = "2px";
		elNext.addEventListener("click", () => this.focusNearestImage(true));
		this.elNext = elNext;

		this.domRoot = viewer.renderer.domElement.parentElement;
		this.domRoot.appendChild(elUnfocus);
		this.domRoot.appendChild(elNext);
		this.domRoot.appendChild(elPrev);

		this.elUnfocus.style.display = "none";
		this.elNext.style.display = "none";
		this.elPrev.style.display = "none";

		viewer.addEventListener("update", () => {
			this.update(viewer);
		});
		viewer.inputHandler.addInputListener(this);

		this.addEventListener("mousedown", () => {
			if(currentlyHovered){
				this.focus(currentlyHovered.image360);
			}
		});
	};

	set visible(visible){
		if(this._visible === visible){
			return;
		}


		for(const image of this.images){
			image.mesh.visible = visible && (this.focusedImage == null);
		}

		this.sphere.visible = visible && (this.focusedImage != null);
		this._visible = visible;
		this.dispatchEvent({
			type: "visibility_changed",
			images: this,
		});
	}

	get visible(){
		return this._visible;
	}

	focusExtern(image360) {
		this.nextPreviousDirection = null;
		this.focus(image360);
	}

	focus(image360){
		if (this.focusedImage === null) {
			// save old fov
			if (!this.oldFov) {
				this.oldFov = this.viewer.getFOV();
			}

			// save old speed
			if (!this.oldSpeed) {
				this.oldSpeed = this.viewer.getMoveSpeed();
			}

			// save old opacity
			if (!this.oldEdlOpacity) {
				this.oldEdlOpacity = this.viewer.getEDLOpacity();
			}

			this.addEventListener('mousewheel', this.zoomOn);
			document.addEventListener("keydown", this.keyDown, false);

			previousView = {
				controls: this.viewer.controls,
				position: this.viewer.scene.view.position.clone(),
				target: viewer.scene.view.getPivot(),
			};

			this.viewer.setControls(this.viewer.orbitControls);
			this.viewer.orbitControls.doubleClockZoomEnabled = false;

			for(let image of this.images){
				image.mesh.visible = false;
			}

			this.selectingEnabled = false;

			this.sphere.visible = false;
		}

		this.load(image360).then( () => {
			this.sphere.visible = true;
			this.sphere.material.map = image360.texture;
			this.sphere.material.needsUpdate = true;

			{ // orientation
				let {course, pitch, roll} = image360;
				this.sphere.rotation.set(
					THREE.Math.degToRad(+roll + 90),
					THREE.Math.degToRad(-pitch),
					THREE.Math.degToRad(-course + 90),
					"ZYX"
				);
			}

			this.sphere.position.set(...image360.position);

			let target = new THREE.Vector3(...image360.position);

			let dir;
			let optionalTarget;

			// calculate direction
			if (this.nextPreviousDirection) {
				dir = this.nextPreviousDirection.clone().normalize();
			} else {
				// camera source is image position, optional target is target for camera
				if (image360.target) {
					// set z coordinate from image z position, go 3 meter down
					const { x, y, z = image360.position[2] } = image360.target;
					optionalTarget = new THREE.Vector3(x, y, z - 3);
					dir = optionalTarget.clone().sub(target).normalize();
					// set point cloud opacity
                    this.viewer.setEDLOpacity(0);

                    if (this.viewer.getFOV() > 20) {
						this.viewer.setFOV(20);
					}
				} else {
					dir = target.clone().sub(viewer.scene.view.position).normalize();
					dir.z = 0;
				}
			}

			let move = dir.multiplyScalar(0.000001);
			let newCamPos = target.clone().sub(move);

			viewer.scene.view.setView(
				newCamPos,
				target,
				timeout
			);

			this.focusedImage = image360;

			this.elUnfocus.style.display = "";
			this.elNext.style.display = "";
			this.elPrev.style.display = "";

			viewer.scene.dispatchEvent({
				type: '360_image_focus',
				scene: viewer.scene,
				image: this.focusedImage,
			});
		});
	}

	unfocus(){
		this.removeEventListener('mousewheel', this.zoomOn);
		document.removeEventListener("keydown", this.keyDown);

		this.selectingEnabled = true;

		let image = this.focusedImage;

		if(image === null){
			return;
		}

		this.sphere.material.map = null;
		this.sphere.material.needsUpdate = true;
		this.sphere.visible = false;

		viewer.orbitControls.doubleClockZoomEnabled = true;
		viewer.setControls(previousView.controls);

		viewer.scene.view.setView(
			previousView.position,
			previousView.target,
			timeout
		);

		viewer.scene.dispatchEvent({
			type: '360_image_unfocus',
			scene: viewer.scene,
			image: this.focusedImage,
		});

		this.focusedImage = null;

		for (let image of this.images) {
			image.mesh.visible = this.visible;
		}

		this.elUnfocus.style.display = "none";
		this.elNext.style.display = "none";
		this.elPrev.style.display = "none";

		// restore old fov
		this.viewer.setFOV(this.oldFov);
		this.oldFov = 0;

		// restore old speed
		this.viewer.setMoveSpeed(this.oldSpeed);
		this.oldSpeed = 0;

		// restore old opacity
		this.viewer.setEDLOpacity(this.oldEdlOpacity);
		this.oldEdlOpacity = 0;
	}

	focusNearestImage(forward) {
		const nearestImage = this.getNearestImage(forward);

		if (nearestImage) {
			this.focus(nearestImage);
		}
	}

	distance(point1, point2) {
		return Math.sqrt((point1[0] - point2[0]) ** 2 + (point1[1] - point2[1]) ** 2);
	}

	getNearestImage(forward) {
		const distance = 1;

		const position = this.viewer.scene.view.position.clone();
		const target = this.viewer.scene.view.getPivot();
		let dir = target.clone().sub(position).normalize();

		this.nextPreviousDirection = dir.clone();

		if (!forward) {
			dir.x = -dir.x;
			dir.y = -dir.y;
		}

		position.add( dir.multiplyScalar(distance) );

		let minDistance = -1;
		let minImage;

		for(let image of this.images){
			const imagePosition =  new THREE.Vector3(...image.position);
			let imageDirection = imagePosition.clone().sub(position).normalize();

			const distance = this.distance(image.position, [position.x, position.y]);

			let direction = dir.clone();
			direction.z = 0;
			imageDirection.z = 0;

			const angle = imageDirection.angleTo(direction);

			if ((this.focusedImage !== image) && (minDistance === -1 || distance < minDistance) && angle < Math.PI/2) {
				minDistance = distance;
				minImage = image;
			}
		}

		return minImage;
	}

	exit(forward) {
		this.nextPreviousDirection = null;

		this.unfocus();
	}

	load(image360){
		return new Promise(resolve => {
			if (image360.texture) {
				resolve(true);
			} else {
				let texture = new THREE.TextureLoader().load(image360.file, resolve);
				texture.wrapS = THREE.RepeatWrapping;
				texture.repeat.x = -1;

				image360.texture = texture;
			}
		});
	}

	handleHovering(){
		let mouse = viewer.inputHandler.mouse;
		let camera = viewer.scene.getActiveCamera();
		let domElement = viewer.renderer.domElement;

		let ray = Potree.Utils.mouseToRay(mouse, camera, domElement.clientWidth, domElement.clientHeight);

		raycaster.ray.copy(ray);
		let intersections = raycaster.intersectObjects(this.node.children);

		if(intersections.length === 0){
			return;
		}

		let intersection = intersections[0];
		currentlyHovered = intersection.object;
		currentlyHovered.material = smHovered;
	}

	update(){
		let {viewer} = this;

		if(currentlyHovered){
			currentlyHovered.material = sm;
			currentlyHovered = null;
		}

		if(this.selectingEnabled){
			this.handleHovering();
		}

	}

};


export class Images360Loader{

	static async load(url, viewer, params = {}){

		if(!params.transform){
			params.transform = {
				forward: a => a,
			};
		}

		let response = await fetch(`${url}/coordinates.txt`);
		let text = await response.text();

		let lines = text.split(/\r?\n/);
		let coordinateLines = lines.slice(1);

		let images360 = new Images360(viewer);

		for(let line of coordinateLines){

			if(line.trim().length === 0){
				continue;
			}

			let tokens = line.split(/\t/);

			let [filename, time, long, lat, alt, course, pitch, roll] = tokens;
			time = parseFloat(time);
			long = parseFloat(long);
			lat = parseFloat(lat);
			alt = parseFloat(alt);
			course = parseFloat(course);
			pitch = parseFloat(pitch);
			roll = parseFloat(roll);

			filename = filename.replace(/"/g, "");
			let file = `${url}/${filename}`;

			let image360 = new Image360(file, time, long, lat, alt, course, pitch, roll);

			let xy = params.transform.forward([long, lat]);
			let position = [...xy, alt];
			image360.position = position;

			images360.images.push(image360);
		}

		Images360Loader.createSceneNodes(images360, params.transform);

		return images360;

	}

	static createSceneNodes(images360, transform){
		for(let image360 of images360.images){
			let {longitude, latitude, altitude} = image360;
			let xy = transform.forward([longitude, latitude]);

			let mesh = new THREE.Mesh(sg, sm);
			mesh.position.set(...xy, altitude);
			mesh.scale.set(1, 1, 1);
			mesh.material.transparent = true;
			mesh.material.opacity = 0.75;
			mesh.image360 = image360;

			{ // orientation
				var {course, pitch, roll} = image360;
				mesh.rotation.set(
					THREE.Math.degToRad(+roll + 90),
					THREE.Math.degToRad(-pitch),
					THREE.Math.degToRad(-course + 90),
					"ZYX"
				);
			}

			images360.node.add(mesh);

			image360.mesh = mesh;
			// image360.mesh.visible = viewer.orbitControls.doubleClockZoomEnabled;
			image360.mesh.visible = viewer.orbitControls.doubleClockZoomEnabled && images360.visible;
		}
	}
};
