import {ClipVolume} from "./ClipVolume.js";
import {PolygonClipVolume} from "./PolygonClipVolume.js";
import { EventDispatcher } from "../EventDispatcher.js";
import {ClipTask} from "../defines.js"
import {Utils} from "../utils";

export class ScreenDynamicBoxSelectTool extends EventDispatcher{

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

		let dropped = false;
		let points = 0;
		let pointsArr = [];

		let drag = e =>{
			svg.find("polyline").each((index, target) => {
				let startPoint;

				this.lastPoint = {
					x: e.offsetX,
					y: e.offsetY,
				};

				for (let k = 0; k < target.points.numberOfItems; k++) {
					const endPoint = {
						x: e.offsetX,
						y: e.offsetY,
					};

					const point = target.points.getItem(k);

					let newPoint = svg[0].createSVGPoint();

					if (points === 1) {
						startPoint = pointsArr[0];

						if (k === 0) {
							newPoint.x = startPoint.x;
							newPoint.y = startPoint.y;
						}

						if (k === 1) {
							newPoint.x = startPoint.x;
							newPoint.y = startPoint.y;
						}

						if (k === 2) {
							newPoint.x = endPoint.x;
							newPoint.y = endPoint.y;
						}

						if (k === 3) {
							newPoint.x = endPoint.x;
							newPoint.y = endPoint.y;
						}

						if (k === 4) {
							newPoint.x = startPoint.x;
							newPoint.y = startPoint.y;
						}
					} else if (points === 2) {
						const {x: x1, y: y1 } = pointsArr[0];
						const {x: x2, y: y2 } = pointsArr[1];
						const {x, y } = endPoint;

						const { x: xx, y: yy, distance } = this.pointDistance(x, y, x1, y1, x2, y2);

						const positiveVector = {
							x: x - xx,
							y: y - yy,
						};

						if (k === 0) {
							newPoint.x = x1 + positiveVector.x;
							newPoint.y = y1 + positiveVector.y;
						}

						if (k === 1) {
							newPoint.x = x2 + positiveVector.x;
							newPoint.y = y2 + positiveVector.y;
						}

						if (k === 2) {
							newPoint.x = x2 - positiveVector.x;
							newPoint.y = y2 - positiveVector.y;
						}

						if (k === 3) {
							newPoint.x = x1 - positiveVector.x;
							newPoint.y = y1 - positiveVector.y;
						}

						if (k === 4) {
							newPoint.x = x1 + positiveVector.x;
							newPoint.y = y1 + positiveVector.y;
						}
					}

					target.points.replaceItem(newPoint, k);
					polyClipVol.updateMarker(newPoint.x, newPoint.y, k)
				}
			});
		};

		let drop = e => {
			dropped = true;

			this.viewer.renderer.domElement.removeEventListener("mousemove", drag);
			this.viewer.renderer.domElement.removeEventListener("mouseup", drop);
		};

		let insertionCallback = (e) => {
			if(e.button === THREE.MOUSE.LEFT ){
/*
				if (dropped) {
					// this.viewer.inputHandler.startDragging(polyClipVol.markers[polyClipVol.markers.length - 1]);
					return;
				}
*/


/*
				this.viewer.renderer.domElement.addEventListener("mousemove", drag , false);
				this.viewer.renderer.domElement.addEventListener("mouseup", drop , false);
*/

				points++;
				pointsArr.push({
					x: e.offsetX,
					y: e.offsetY,
				});


				if (points === 3) {
					this.viewer.renderer.domElement.removeEventListener("mousemove", drag);
				}

				if (points > 1) {
					return;
				}

				this.viewer.renderer.domElement.addEventListener("mousemove", drag , false);

				polyClipVol.addMarker(e.offsetX, e.offsetY);
				polyClipVol.addMarker(e.offsetX, e.offsetY);
				polyClipVol.addMarker(e.offsetX, e.offsetY);
				polyClipVol.addMarker(e.offsetX, e.offsetY);
				polyClipVol.addMarker(e.offsetX, e.offsetY);

				// SVC Screen Line
				svg.find("polyline").each((index, target) => {
					let newPoint = svg[0].createSVGPoint();
					newPoint.x = e.offsetX;
					newPoint.y = e.offsetY;
					let polyline = target.points.appendItem(newPoint);
				});

				svg.find("polyline").each((index, target) => {
					let newPoint = svg[0].createSVGPoint();
					newPoint.x = e.offsetX;
					newPoint.y = e.offsetY;
					let polyline = target.points.appendItem(newPoint);
				});

				svg.find("polyline").each((index, target) => {
					let newPoint = svg[0].createSVGPoint();
					newPoint.x = e.offsetX;
					newPoint.y = e.offsetY;
					let polyline = target.points.appendItem(newPoint);
				});

				svg.find("polyline").each((index, target) => {
					let newPoint = svg[0].createSVGPoint();
					newPoint.x = e.offsetX;
					newPoint.y = e.offsetY;
					let polyline = target.points.appendItem(newPoint);
				});

				svg.find("polyline").each((index, target) => {
					let newPoint = svg[0].createSVGPoint();
					newPoint.x = e.offsetX;
					newPoint.y = e.offsetY;
					let polyline = target.points.appendItem(newPoint);
				});

				// this.viewer.inputHandler.startDragging(polyClipVol.markers[polyClipVol.markers.length - 1]);
			} else if (e.button === THREE.MOUSE.RIGHT){
				if (points === 2) {
					points++;
					pointsArr.push({
						x: e.offsetX,
						y: e.offsetY,
					});
					this.viewer.renderer.domElement.removeEventListener("mousemove", drag);
				}

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

						boxVolume.material.visible = false;
						boxVolume.visible = true;

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
		};

		cancel.callback = e => {
			const { forceSave = false, forceDelete = false, forceClip = false, dispatch = false } = e;

			svg.remove();

			if (points === 2 && this.lastPoint) {
				points++;
				pointsArr.push({
					x: this.lastPoint.x,
					y: this.lastPoint.y,
				});
				this.viewer.renderer.domElement.removeEventListener("mousemove", drag);
			}

			if(!forceDelete && polyClipVol.markers.length > 4 && points > 2) {
				// polyClipVol.removeLastMarker();
				polyClipVol.initialized = true;
				this.viewer.scene.polygonMaxCount++;
			} else {
				this.viewer.scene.removePolygonClipVolume(polyClipVol);
			}

			this.viewer.removeEventListener("cancel_insertions", cancel.callback);
			this.viewer.renderer.domElement.removeEventListener("mouseup", insertionCallback);

			if (forceSave) {
				saveCallback(forceClip, dispatch);
			}

			this.viewer.inputHandler.enabled = true;
		};

		this.viewer.addEventListener("cancel_insertions", cancel.callback);
		this.viewer.renderer.domElement.addEventListener("mouseup", insertionCallback , false);

		this.viewer.inputHandler.enabled = false;

		return polyClipVol;
	}

	update() {
	}

	    /**
     * Calculates the point of the intersection between line from location perpendicular to the line [x1, y1], [x2, y2]
     * and various distances.
     * @param x
     * @param y
     * @param x1
     * @param y1
     * @param x2
     * @param y2
     * @returns {{distance2: number, distance1: number, distance: number, x, y}}
     */
    pointDistance(x, y, x1, y1, x2, y2) {
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        // in case of 0 length line
        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx;
        let yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = x - xx;
        const dy = y - yy;

        const dx1 = x1 - xx;
        const dy1 = y1 - yy;

        const dx2 = x2 - xx;
        const dy2 = y2 - yy;

        return {
            x: xx,
            y: yy,
            distance: Math.sqrt(dx * dx + dy * dy),
            distance1: Math.sqrt(dx1 * dx1 + dy1 * dy1),
            distance2: Math.sqrt(dx2 * dx2 + dy2 * dy2),
        };
    }

};
