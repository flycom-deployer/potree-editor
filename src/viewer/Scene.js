

import {Annotation} from "../Annotation.js";
import {CameraMode} from "../defines.js";
import {View} from "./View.js";
import {Utils} from "../utils.js";
import {EventDispatcher} from "../EventDispatcher.js";
import Classificator from "../modules/Classificator/Classificator";
import {BoxVolume} from "../utils/Volume";
export class Scene extends EventDispatcher{

	constructor(){
		super();

		this.keyMap = [];
		this.selections = [];

		this.annotations = new Annotation();

		this.scene = new THREE.Scene();
		this.sceneBG = new THREE.Scene();
		this.scenePointCloud = new THREE.Scene();

		this.cameraP = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 1000*1000);
		this.cameraO = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000*1000);
		this.cameraVR = new THREE.PerspectiveCamera();
		this.cameraBG = new THREE.Camera();
		this.cameraScreenSpace = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
		this.cameraMode = CameraMode.PERSPECTIVE;
		this.overrideCamera = null;
		this.pointclouds = [];

		this.measurements = [];
		this.profiles = [];
		this.volumes = [];
		this.polygonClipVolumes = [];
		this.cameraAnimations = [];
		this.orientedImages = [];
		this.images360 = [];
		this.geopackages = [];

		this.fpControls = null;
		this.orbitControls = null;
		this.earthControls = null;
		this.geoControls = null;
		this.deviceControls = null;
		this.inputHandler = null;

		this.view = new View();

		this.directionalLight = null;

		this.initialize();
		this.keyboardInit();
	}

	estimateHeightAt (position) {
		let height = null;
		let fromSpacing = Infinity;

		for (let pointcloud of this.pointclouds) {
			if (pointcloud.root.geometryNode === undefined) {
				continue;
			}

			let pHeight = null;
			let pFromSpacing = Infinity;

			let lpos = position.clone().sub(pointcloud.position);
			lpos.z = 0;
			let ray = new THREE.Ray(lpos, new THREE.Vector3(0, 0, 1));

			let stack = [pointcloud.root];
			while (stack.length > 0) {
				let node = stack.pop();
				let box = node.getBoundingBox();

				let inside = ray.intersectBox(box);

				if (!inside) {
					continue;
				}

				let h = node.geometryNode.mean.z +
					pointcloud.position.z +
					node.geometryNode.boundingBox.min.z;

				if (node.geometryNode.spacing <= pFromSpacing) {
					pHeight = h;
					pFromSpacing = node.geometryNode.spacing;
				}

				for (let index of Object.keys(node.children)) {
					let child = node.children[index];
					if (child.geometryNode) {
						stack.push(node.children[index]);
					}
				}
			}

			if (height === null || pFromSpacing < fromSpacing) {
				height = pHeight;
				fromSpacing = pFromSpacing;
			}
		}

		return height;
	}

	getBoundingBox(pointclouds = this.pointclouds){
		let box = new THREE.Box3();

		this.scenePointCloud.updateMatrixWorld(true);
		this.referenceFrame.updateMatrixWorld(true);

		for (let pointcloud of pointclouds) {
			pointcloud.updateMatrixWorld(true);

			let pointcloudBox = pointcloud.pcoGeometry.tightBoundingBox ? pointcloud.pcoGeometry.tightBoundingBox : pointcloud.boundingBox;
			let boxWorld = Utils.computeTransformedBoundingBox(pointcloudBox, pointcloud.matrixWorld);
			box.union(boxWorld);
		}

		return box;
	}

	addPointCloud (pointcloud) {
		this.pointclouds.push(pointcloud);
		this.scenePointCloud.add(pointcloud);

		this.dispatchEvent({
			type: 'pointcloud_added',
			pointcloud: pointcloud
		});
	}

	addVolume (volume, prepend = false) {
		if (prepend) {
			this.volumes.unshift(volume);

			this.selections.unshift({
				type: 0,
				index: 0
			});

			for (let i = 1; i < this.selections.length; i++) {
				const selection = this.selections[i];
				if (selection.type === 0) {
					selection.index += 1;
				}
			}
		} else {
			this.volumes.push(volume);

			this.selections.push({
				type: 0,
				index: this.volumes.length - 1
			});
		}

		this.dispatchEvent({
			'type': 'volume_added',
			'scene': this,
			'volume': volume
		});
	}

	addOrientedImages(images){
		this.orientedImages.push(images);
		this.scene.add(images.node);

		this.dispatchEvent({
			'type': 'oriented_images_added',
			'scene': this,
			'images': images
		});
	};

	removeOrientedImages(images){
		let index = this.orientedImages.indexOf(images);
		if (index > -1) {
			this.orientedImages.splice(index, 1);

			this.dispatchEvent({
				'type': 'oriented_images_removed',
				'scene': this,
				'images': images
			});
		}
	};

	add360Images(images){
		this.images360.push(images);
		this.scene.add(images.node);

		this.dispatchEvent({
			'type': '360_images_added',
			'scene': this,
			'images': images
		});
	}

	remove360Images(images){
		let index = this.images360.indexOf(images);
		if (index > -1) {
			this.images360.splice(index, 1);

			this.dispatchEvent({
				'type': '360_images_removed',
				'scene': this,
				'images': images
			});
		}
	}

	addGeopackage(geopackage){
		this.geopackages.push(geopackage);
		this.scene.add(geopackage.node);

		this.dispatchEvent({
			'type': 'geopackage_added',
			'scene': this,
			'geopackage': geopackage
		});
	};

	removeGeopackage(geopackage){
		let index = this.geopackages.indexOf(geopackage);
		if (index > -1) {
			this.geopackages.splice(index, 1);

			this.dispatchEvent({
				'type': 'geopackage_removed',
				'scene': this,
				'geopackage': geopackage
			});
		}
	};

	removeVolume (volume) {
		let index = this.volumes.indexOf(volume);
		if (index > -1) {
			this.volumes.splice(index, 1);

			this.selections = this.selections.filter(selection => !(selection.type === 0 && selection.index === index));

			this.dispatchEvent({
				'type': 'volume_removed',
				'scene': this,
				'volume': volume
			});
		}
	};

	addCameraAnimation(animation) {
		this.cameraAnimations.push(animation);
		this.dispatchEvent({
			'type': 'camera_animation_added',
			'scene': this,
			'animation': animation
		});
	};

	removeCameraAnimation(animation){
		let index = this.cameraAnimations.indexOf(volume);
		if (index > -1) {
			this.cameraAnimations.splice(index, 1);

			this.dispatchEvent({
				'type': 'camera_animation_removed',
				'scene': this,
				'animation': animation
			});
		}
	};

	addPolygonClipVolume(volume){
		if (!this.polygonMaxCount) {
			this.polygonMaxCount = 0;
		}

		this.polygonClipVolumes.push(volume);

		this.selections.push({
			type: 1,
			index: this.polygonClipVolumes.length - 1
		});

		this.dispatchEvent({
			"type": "polygon_clip_volume_added",
			"scene": this,
			"volume": volume
		});
	};

	removePolygonClipVolume(volume){
		let index = this.polygonClipVolumes.indexOf(volume);
		if (index > -1) {
			this.polygonClipVolumes.splice(index, 1);

			this.selections = this.selections.filter(selection => !(selection.type === 1 && selection.index === index));

			this.dispatchEvent({
				"type": "polygon_clip_volume_removed",
				"scene": this,
				"volume": volume
			});
		}
	};

	addMeasurement(measurement){
		measurement.lengthUnit = this.lengthUnit;
		measurement.lengthUnitDisplay = this.lengthUnitDisplay;
		this.measurements.push(measurement);
		this.dispatchEvent({
			'type': 'measurement_added',
			'scene': this,
			'measurement': measurement
		});
	};

	removeMeasurement (measurement) {
		let index = this.measurements.indexOf(measurement);
		if (index > -1) {
			this.measurements.splice(index, 1);
			this.dispatchEvent({
				'type': 'measurement_removed',
				'scene': this,
				'measurement': measurement
			});
		}
	}

	addProfile (profile) {
		this.profiles.push(profile);
		this.dispatchEvent({
			'type': 'profile_added',
			'scene': this,
			'profile': profile
		});
	}

	removeProfile (profile) {
		let index = this.profiles.indexOf(profile);
		if (index > -1) {
			this.profiles.splice(index, 1);
			this.dispatchEvent({
				'type': 'profile_removed',
				'scene': this,
				'profile': profile
			});
		}
	}

	removeAllMeasurements () {
		while (this.measurements.length > 0) {
			this.removeMeasurement(this.measurements[0]);
		}

		while (this.profiles.length > 0) {
			this.removeProfile(this.profiles[0]);
		}

		while (this.volumes.length > 0) {
			this.removeVolume(this.volumes[0]);
		}
	}

	removeAllClipVolumes(){
		// TODO
		this.selections = [];
		this.polygonMaxCount = 0;

		let clipVolumes = this.volumes.filter(volume => volume.clip === true);
		for(let clipVolume of clipVolumes){
			this.removeVolume(clipVolume);
		}

		while(this.polygonClipVolumes.length > 0){
			this.removePolygonClipVolume(this.polygonClipVolumes[0]);
		}
	}

	getActiveCamera() {

		if(this.overrideCamera){
			return this.overrideCamera;
		}

		if(this.cameraMode === CameraMode.PERSPECTIVE){
			return this.cameraP;
		}else if(this.cameraMode === CameraMode.ORTHOGRAPHIC){
			return this.cameraO;
		}else if(this.cameraMode === CameraMode.VR){
			return this.cameraVR;
		}

		return null;
	}

	initialize(){

		this.referenceFrame = new THREE.Object3D();
		this.referenceFrame.matrixAutoUpdate = false;
		this.scenePointCloud.add(this.referenceFrame);

		this.cameraP.up.set(0, 0, 1);
		this.cameraP.position.set(1000, 1000, 1000);
		this.cameraO.up.set(0, 0, 1);
		this.cameraO.position.set(1000, 1000, 1000);
		//this.camera.rotation.y = -Math.PI / 4;
		//this.camera.rotation.x = -Math.PI / 6;
		this.cameraScreenSpace.lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));

		this.directionalLight = new THREE.DirectionalLight( 0xffffff, 0.5 );
		this.directionalLight.position.set( 10, 10, 10 );
		this.directionalLight.lookAt( new THREE.Vector3(0, 0, 0));
		this.scenePointCloud.add( this.directionalLight );

		let light = new THREE.AmbientLight( 0x555555 ); // soft white light
		this.scenePointCloud.add( light );

		{ // background
			let texture = Utils.createBackgroundTexture(512, 512);

			texture.minFilter = texture.magFilter = THREE.NearestFilter;
			texture.minFilter = texture.magFilter = THREE.LinearFilter;
			let bg = new THREE.Mesh(
				new THREE.PlaneBufferGeometry(2, 2, 0),
				new THREE.MeshBasicMaterial({
					map: texture
				})
			);
			bg.material.depthTest = false;
			bg.material.depthWrite = false;
			this.sceneBG.add(bg);
		}

		// { // lights
		// 	{
		// 		let light = new THREE.DirectionalLight(0xffffff);
		// 		light.position.set(10, 10, 1);
		// 		light.target.position.set(0, 0, 0);
		// 		this.scene.add(light);
		// 	}

		// 	{
		// 		let light = new THREE.DirectionalLight(0xffffff);
		// 		light.position.set(-10, 10, 1);
		// 		light.target.position.set(0, 0, 0);
		// 		this.scene.add(light);
		// 	}

		// 	{
		// 		let light = new THREE.DirectionalLight(0xffffff);
		// 		light.position.set(0, -10, 20);
		// 		light.target.position.set(0, 0, 0);
		// 		this.scene.add(light);
		// 	}
		// }
	}

	addAnnotation(position, args = {}){
		if(position instanceof Array){
			args.position = new THREE.Vector3().fromArray(position);
		} else if (position instanceof THREE.Vector3) {
			args.position = position;
		}
		let annotation = new Annotation(args);
		this.annotations.add(annotation);

		return annotation;
	}

	getAnnotations () {
		return this.annotations;
	};

	removeAnnotation(annotationToRemove) {
		this.annotations.remove(annotationToRemove);
	}

	classify(viewer, deleteAll = false, onlyBox = false) {
		// get point cloud
		const pointCloud = viewer.scene.pointclouds[0];

		// get visible classifications
		const visibleClassifications = Object.entries(viewer.classifications)
			.filter(([, value]) => value.visible)
			.map(([key, ]) => key);

		// get active classifications
		const activeClassifications = [...(viewer.activeClassifications || visibleClassifications)]
			.filter(classification => visibleClassifications.includes(classification));

		const selections = viewer.scene.selections
			.map(({type, index}) => {
				if (type === 0) {
					const box = viewer.scene.volumes[index];
					const matrixInverse = new THREE.Matrix4().getInverse(box.matrixWorld);
					const colorIndex = box.colorIndex;

					return {
						type: 'box',
						colorIndex,
						matrix: matrixInverse,
					};
				} else if (type === 1) {
					const polygon = viewer.scene.polygonClipVolumes[index];

					let view = polygon.viewMatrix;
					let proj = polygon.projMatrix;

					const projViewMatrix = proj.clone().multiply(view);

					const flattenedVertices = [];

					for(let j = 0; j < polygon.markers.length; j++){
						flattenedVertices.push({
							x: polygon.markers[j].position.x,
							y: polygon.markers[j].position.y,
							z: polygon.markers[j].position.z,
						});
					}

					const colorIndex = polygon.colorIndex;

					return {
						type: 'polygon',
						colorIndex,
						matrix: projViewMatrix,
						vertices: flattenedVertices,
					};
				}
			});


		// viewer.activeClassifications = undefined;

		const classificator = new Classificator(pointCloud, activeClassifications, selections, viewer.scene.volumes[0]);
		const box = classificator.classifyPoints(onlyBox);

		if (onlyBox) {
			return box;
		}

		if (!viewer.scene.pointWorkerCommands) {
			viewer.scene.pointWorkerCommands = [];
		}

		const command = {
			activeClassifications,
			pointcloudOffset: pointCloud.pcoGeometry.offset,
			selections,
			// TODO zOffset = pointcloudOffset[0].z - pointcloud.position.z
			// pointcloudOffset: pointCloud.pcoGeometry.offset - pointCloud.position.z,
		};

		viewer.scene.pointWorkerCommands.push(command);

		viewer.scene.dispatchEvent({
			type: 'set_classification_command_added',
			command,
		});


		// viewer.scene.removeVolume(box);
		// [...viewer.scene.volumes].forEach(box => viewer.scene.removeVolume(box));
		// [...viewer.scene.polygonClipVolumes].forEach(box => viewer.scene.removePolygonClipVolume(box));

		if (deleteAll) {
/*
			[...viewer.scene.volumes].forEach(box => viewer.scene.removeVolume(box));
			[...viewer.scene.polygonClipVolumes].forEach(box => viewer.scene.removePolygonClipVolume(box));
			viewer.scene.selections = [];
			this.polygonMaxCount = 0;
*/
			this.removeAllClipVolumes();
		} else {
			const polygonIndex = viewer.scene.polygonClipVolumes.length - 1;
			viewer.scene.removePolygonClipVolume(viewer.scene.polygonClipVolumes[polygonIndex])
			viewer.scene.selections = viewer.scene.selections
				.filter(selection => !(selection.type === 1 && selection.index === polygonIndex));
		}
	}

	createVolumeBox(viewer, polygon) {
		const camera = this.getActiveCamera();

		const {minPoint, maxPoint} = this.classify(viewer, false, true)
		minPoint.x -= 1;
		minPoint.y -= 1;
		minPoint.z -= 1;
		maxPoint.x += 1;
		maxPoint.y += 1;
		maxPoint.z += 1;
		const center = new THREE.Vector3();
		center.x = minPoint.x + (maxPoint.x - minPoint.x)/2;
		center.y = minPoint.y + (maxPoint.y - minPoint.y)/2;
		center.z = minPoint.z + (maxPoint.z - minPoint.z)/2;

		let volume = new BoxVolume();
		volume.clip = true;
		volume.name = 'Volume';

		volume.position.set(center.x, center.y, center.z);
		volume.showVolumeLabel = false;
		volume.visible = false;
		volume.update();

		const { index, color } = this.getCurrentClassification(viewer);
		volume.colorIndex = index;
		volume.color = [color[0], color[1], color[2]];

		this.addVolume(volume, true);
		// this.add(volume);

		volume.up.copy(camera.up);
		//volume.rotation.copy(camera.rotation);
		// const z = Math.max(maxPoint.x - minPoint.x,maxPoint.y - minPoint.y, 100);
		volume.scale.set(maxPoint.x - minPoint.x,maxPoint.y - minPoint.y,maxPoint.z - minPoint.z);

		return volume;
	}


	_createVolumeBox(viewer, polygon) {
		const flattenedVertices = [];

		for(let j = 0; j < polygon.markers.length; j++){
			flattenedVertices.push({
				x: polygon.markers[j].position.x,
				y: polygon.markers[j].position.y,
				z: polygon.markers[j].position.z,
			});
		}

		const vector = new THREE.Vector3();
		const raycaster = new THREE.Raycaster();
		const dir = new THREE.Vector3();

		const camera = this.getActiveCamera();

		// vector.set( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1, 0.5 ); // z = 0.5 important!
		const points = [];

		for (let k = 0; k < flattenedVertices.length; k++) {
			vector.set( flattenedVertices[k].x, flattenedVertices[k].y, flattenedVertices[k].z); // z = 0.5 important!
			vector.unproject( camera );
			raycaster.set( camera.position, vector.sub( camera.position ).normalize());

			const intersects = raycaster.intersectObjects( this.pointclouds, true );
			const closest = intersects.reduce((p, c) => ((p.distance < c.distance) ? p : c), false);
			points.push(closest.point);
		}

		const minPoint = points[0].clone();
		const maxPoint = points[0].clone();

		for (let k = 0; k < points.length; k++) {
			const refPoint = points[k];

			if (refPoint.x < minPoint.x) {
				minPoint.x = refPoint.x;
			}
			if (refPoint.y < minPoint.y) {
				minPoint.y = refPoint.y;
			}
			if (refPoint.z < minPoint.z) {
				minPoint.z = refPoint.z;
			}

			if (refPoint.x > maxPoint.x) {
				maxPoint.x = refPoint.x;
			}
			if (refPoint.y > maxPoint.y) {
				maxPoint.y = refPoint.y;
			}
			if (refPoint.z > maxPoint.z) {
				maxPoint.z = refPoint.z;
			}
		}

		const center = new THREE.Vector3();
		center.x = minPoint.x + (maxPoint.x - minPoint.x)/2;
		center.y = minPoint.y + (maxPoint.y - minPoint.y)/2;
		center.z = minPoint.z + (maxPoint.z - minPoint.z)/2;

		let volume = new BoxVolume();
		volume.clip = true;
		volume.name = 'Volume';

		volume.position.set(center.x, center.y, center.z);
		volume.showVolumeLabel = false;
		volume.visible = true;
		volume.update();

		const classifications = Object.keys(viewer.classifications);
		const key = viewer.selectedClassification || parseInt(Math.random() * classifications.length).toString();
		// const key = classifications[selectedIndex.toString()];
		// const key = selectedIndex.toString();
		// console.log(classifications, key, this.viewer.classifications[key]);
		const color = viewer.classifications[key].color;
		volume.colorIndex = key;
		volume.color = [color[0], color[1], color[2]];

		this.addVolume(volume, true);
		// this.add(volume);

		volume.up.copy(camera.up);
		//volume.rotation.copy(camera.rotation);
		const z = Math.max(maxPoint.x - minPoint.x,maxPoint.y - minPoint.y, 100);
		volume.scale.set(maxPoint.x - minPoint.x,maxPoint.y - minPoint.y,z);

		return volume;

	}
	isKeyDown(code) {
		return this.keyMap.find(key => key === code);
	}

	keyboardInit() {
		let onDocumentKeyDown = event => {
			this.keyMap = (this.keyMap.filter(key => key !== event.keyCode) || []);
			this.keyMap.push(event.keyCode);
		};

		let onDocumentKeyUp = event => {
			const ALT = 18;
			const SHIFT = 16;

			this.keyMap = (this.keyMap.filter(key => key !== event.keyCode) || []);

			const mainKeyCode = event.keyCode;
			const alterKeyCode = event.shiftKey ? SHIFT : (event.altKey ? ALT : '');

			this.dispatchEvent({
				type: 'key_pressed',
				mainKeyCode,
				alterKeyCode,
			});
		}

		document.addEventListener("keydown", onDocumentKeyDown, false);
		document.addEventListener("keyup", onDocumentKeyUp, false);
	}

	getCurrentClassification(viewer) {
		const classifications = Object.keys(viewer.classifications);
		const index = viewer.selectedClassification || classifications[0];
		const color = viewer.classifications[index].color;

		return {
			index,
			color,
		};
	}
};
