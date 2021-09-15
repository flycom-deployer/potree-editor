
import {ClipVolume} from "./ClipVolume.js";
import {PolygonClipVolume} from "./PolygonClipVolume.js";
import { EventDispatcher } from "../EventDispatcher.js";
import {ClipTask} from "../defines";
import {Utils} from "../utils";

export class ClippingTool extends EventDispatcher{

	constructor(viewer){
		super();

		this.viewer = viewer;

		this.maxPolygonVertices = 100;

		this.addEventListener("start_inserting_clipping_volume", e => {
			this.viewer.dispatchEvent({
				type: "cancel_insertions"
			});
		});

		this.sceneMarker = new THREE.Scene();
		this.sceneVolume = new THREE.Scene();
		this.sceneVolume.name = "scene_clip_volume";
		this.viewer.inputHandler.registerInteractiveScene(this.sceneVolume);

		this.onRemove = e => {
			this.sceneVolume.remove(e.volume);
		};

		this.onAdd = e => {
			this.sceneVolume.add(e.volume);
		};

		this.viewer.inputHandler.addEventListener("delete", e => {
			let volumes = e.selection.filter(e => (e instanceof ClipVolume));
			volumes.forEach(e => this.viewer.scene.removeClipVolume(e));
			let polyVolumes = e.selection.filter(e => (e instanceof PolygonClipVolume));
			polyVolumes.forEach(e => this.viewer.scene.removePolygonClipVolume(e));
		});
	}

	setScene(scene){
		if(this.scene === scene){
			return;
		}

		if(this.scene){
			this.scene.removeEventListeners("clip_volume_added", this.onAdd);
			this.scene.removeEventListeners("clip_volume_removed", this.onRemove);
			this.scene.removeEventListeners("polygon_clip_volume_added", this.onAdd);
			this.scene.removeEventListeners("polygon_clip_volume_removed", this.onRemove);
		}

		this.scene = scene;

		this.scene.addEventListener("clip_volume_added", this.onAdd);
		this.scene.addEventListener("clip_volume_removed", this.onRemove);
		this.scene.addEventListener("polygon_clip_volume_added", this.onAdd);
		this.scene.addEventListener("polygon_clip_volume_removed", this.onRemove);
	}

	startInsertion(args = {}) {
		let type = args.type || null;

		if(!type) return null;

		let domElement = this.viewer.renderer.domElement;
		let canvasSize = this.viewer.renderer.getSize(new THREE.Vector2());

		let svg = $(`
		<svg height="${canvasSize.height}" width="${canvasSize.width}" style="position:absolute; pointer-events: none">

			<defs>
				 <marker id="diamond" markerWidth="24" markerHeight="24" refX="12" refY="12"
						markerUnits="userSpaceOnUse">
					<circle cx="12" cy="12" r="3" fill="white" stroke="black" stroke-width="2"/>
				</marker>
			</defs>

			<polyline fill="none" stroke="black" 
				style="stroke:rgb(0, 0, 0);
				stroke-width:6;"
				stroke-dasharray="9, 6"
				stroke-dashoffset="2"
				/>

			<polyline fill="none" stroke="black" 
				style="stroke:rgb(255, 255, 255);
				stroke-width:2;"
				stroke-dasharray="5, 10"
				marker-start="url(#diamond)" 
				marker-mid="url(#diamond)" 
				marker-end="url(#diamond)" 
				/>
		</svg>`);
		$(domElement.parentElement).append(svg);

		let polyClipVol = new PolygonClipVolume(this.viewer.scene.getActiveCamera().clone());

		this.dispatchEvent({"type": "start_inserting_clipping_volume"});

		// set current classification
		const { index, color } = this.viewer.scene.getCurrentClassification(this.viewer);
		polyClipVol.colorIndex = index;
		polyClipVol.color = [color[0], color[1], color[2]];

		this.viewer.scene.addPolygonClipVolume(polyClipVol);
		this.sceneMarker.add(polyClipVol);

		let cancel = {
			callback: null
		};

		let insertionCallback = (e) => {
			if(e.button === THREE.MOUSE.LEFT){
				polyClipVol.addMarker(e.offsetX, e.offsetY);

				// SVC Screen Line
				svg.find("polyline").each((index, target) => {
					let newPoint = svg[0].createSVGPoint();
					newPoint.x = e.offsetX;
					newPoint.y = e.offsetY;
					let polyline = target.points.appendItem(newPoint);
				});


				if(polyClipVol.markers.length > this.maxPolygonVertices){
					cancel.callback({
						forceSave: true,
						dispatch: true,
						...e,
					});
				}

				this.viewer.inputHandler.startDragging(polyClipVol.markers[polyClipVol.markers.length - 1]);
			} else if (e.button === THREE.MOUSE.RIGHT){
				cancel.callback({
					forceSave: true,
					dispatch: true,
					...e,
				});
			}
		};

		let saveCallback = (forceClip, dispatch) => {
			if (this.viewer.scene.polygonClipVolumes.length === 1) {
				// this.viewer.transformationTool.scene.visible = false;

				const boxVolume = this.viewer.scene.volumes.length === 0
					? this.viewer.scene.createVolumeBox(this.viewer, polyClipVol)
					: this.viewer.scene.volumes[0];

				boxVolume.visible = false;
				boxVolume.material.visible = false;

				this.viewer.inputHandler.deselectAll();

				if (forceClip || this.viewer.scene.isKeyDown(16)) {
					setTimeout(() => {
						this.viewer.setClipTask(ClipTask.SHOW_INSIDE);

						let selected = boxVolume;

						let alignmentArr;
						if (selected.scale.y > selected.scale.x) {
							alignmentArr = [+1, +0, +0];
						} else {
							alignmentArr = [+0, +1, +0];
						}

						let maxScale = Math.max(...selected.scale.toArray());
						let minScale = Math.min(...selected.scale.toArray());
						let handleLength = Math.abs(selected.scale.dot(new THREE.Vector3(...alignmentArr)));

						let multiplier = 2;

						if (this.viewer.scene.cameraMode === 1) {
							multiplier = 1.4;
						} else if (this.viewer.scene.cameraMode === 0) {
							multiplier = 0.8;
						}

						let alignment = new THREE.Vector3(...alignmentArr).multiplyScalar(multiplier * maxScale / handleLength);
						alignment.applyMatrix4(selected.matrixWorld);
						let newCamPos = alignment;
						let newCamTarget = selected.getWorldPosition(new THREE.Vector3());

						Utils.moveTo(this.viewer.scene, newCamPos, newCamTarget, 0);

						boxVolume.visible = true;
						boxVolume.material.visible = false;

						this.viewer.inputHandler.deselectAll();
						// this.viewer.transformationTool.scene.visible = true;

						if (dispatch) {
							this.viewer.dispatchEvent({"type": "run_last_command"});
						}
					}, 0);

				} else {
					setTimeout(() => {
						this.viewer.scene.classify(this.viewer, true);

						if (dispatch) {
							this.viewer.dispatchEvent({"type": "run_last_command"});
						}
					}, 0);
				}
			} else {
				this.viewer.scene.classify(this.viewer);

				if (dispatch) {
					this.viewer.dispatchEvent({"type": "run_last_command"});
				}
			}
		}

		cancel.callback = e => {
			const { forceSave = false, forceDelete = false, forceClip = false, dispatch = false } = e;

			svg.remove();

			if(!forceDelete && polyClipVol.markers.length > 3) {
				polyClipVol.removeLastMarker();
				polyClipVol.initialized = true;
				this.viewer.scene.polygonMaxCount++;
			} else {
				this.viewer.scene.removePolygonClipVolume(polyClipVol);
			}

			if (forceSave) {
				saveCallback(forceClip, dispatch);
			}

			this.viewer.renderer.domElement.removeEventListener("mouseup", insertionCallback, false);
			this.viewer.removeEventListener("cancel_insertions", cancel.callback);
			this.viewer.inputHandler.enabled = true;
		};

		this.viewer.addEventListener("cancel_insertions", cancel.callback);
		this.viewer.renderer.domElement.addEventListener("mouseup", insertionCallback , false);

		this.viewer.inputHandler.enabled = false;

		polyClipVol.addMarker();

		this.viewer.inputHandler.startDragging(
			polyClipVol.markers[polyClipVol.markers.length - 1]);

		return polyClipVol;
	}

	update() {
	}
};
