export default class Classificator {
  constructor(pointCloud, activeClassifications, selections, box) {
    this.pointCloud = pointCloud;
    this.activeClassifications = activeClassifications;
    this.selections = selections;

    if (box) {
      const basePoint = box.position.clone();

      this.box = new THREE.Box3();
      this.box.expandByPoint(basePoint.clone().add(
          new THREE.Vector3(
            (box.scale.x / 2) * -1,
            (box.scale.y / 2) * -1,
            (box.scale.z / 2) * -1,
      )));
      this.box.expandByPoint(basePoint.clone().add(
          new THREE.Vector3(
            (box.scale.x / 2),
            (box.scale.y / 2),
            (box.scale.z / 2),
          )
        ),
      );
    }
  }

  classifyPoints(onlyBox = false) {
    const generator = this.getIntersectingChildren(this.pointCloud.pcoGeometry.nodes.r);
    let iterator = generator.next();

    this.minPoint = undefined;
    this.maxPoint = undefined;

    while (!iterator.done) {
      if (!iterator.done) {
        try {
          this.filterSelections(iterator.value, onlyBox);
        } catch (e) {
          console.error('error getChildPoints', e);
        }
      }
      iterator = generator.next();
    }

    const {minPoint, maxPoint} = this;

    return {minPoint, maxPoint};
  }

  pointInClipPolygon(px, py, pz, polygonVertices, e) {

    const w = 1 / (e[3] * px + e[7] * py + e[11] * pz + e[15]);
    const z = (e[2] * px + e[6] * py + e[10] * pz + e[14]) * w;
    const x = (e[0] * px + e[4] * py + e[8] * pz + e[12]) * w;
    const y = (e[1] * px + e[5] * py + e[9] * pz + e[13]) * w;

    if (z < -1 || z > 1) {
        return false;
    }

    let c = false;
    const count = polygonVertices.length;
    const length = Math.min(100, count);
    for (let i = 0, j = count - 1; i < length; i++) {

        const vi = polygonVertices[i];
        const vj = polygonVertices[j];

        if (vi.y > y !== vj.y > y && x < ((vj.x - vi.x) * (y - vi.y)) / (vj.y - vi.y) + vi.x) {
            c = !c;
        }
        j = i;
    }

    return c;
  }

  filterSelections(node, onlyBox = false) {
    const matrix = new THREE.Matrix4().multiplyMatrices(
        this.pointCloud.matrixWorld,
        new THREE.Matrix4().makeTranslation(...node.boundingBox.min.toArray()),
    );

    let pos = new THREE.Vector3();

    if (node.geometry) {
      let view = new Float32Array(node.geometry.attributes.position.array);

      for (let i = 0; i < node.numPoints; i++) {
        if (!onlyBox && !this.activeClassifications.includes(node.geometry.attributes.classification.array[i].toString())) {
          continue;
        }

        pos.set(
          view[i * 3],
          view[i * 3 + 1],
          view[i * 3 + 2]);

        // from local to world
        pos.applyMatrix4(matrix);

        let clipVolumesCount = 0;
        let insideCount = 0;
    	let clipColor;
    	let _clipColor;

        for (let j = 0; j < this.selections.length; j++) {
          let inside;
          const _pos = pos.clone();

          const {type, colorIndex, matrix, vertices} = this.selections[j];

          if (type === 'box') {
              // from world to box local
              _pos.applyMatrix4(matrix);

              inside = (-0.5 <= _pos.x && _pos.x <= 0.5)
                  && (-0.5 <= _pos.y && _pos.y <= 0.5)
                  && (-0.5 <= _pos.z && _pos.z <= 0.5);

                if(inside){
                    _clipColor = colorIndex;
                }
          } else if (type === 'polygon') {
              inside = this.pointInClipPolygon(_pos.x, _pos.y, _pos.z, vertices, matrix.elements);

              if(inside){
                  _clipColor = colorIndex;
              }
          }

          if (insideCount === clipVolumesCount) {
              insideCount = insideCount + (inside ? 1 : 0);

              if(inside){
                clipColor = _clipColor;
              }
          }

          clipVolumesCount++;
        }

        if (clipVolumesCount > 0) {
          let insideAll = clipVolumesCount === insideCount;

          if (insideAll) {
            if (!this.minPoint || !this.maxPoint) {
              this.minPoint = pos.clone();
              this.maxPoint = pos.clone();
            }

            if (pos.x < this.minPoint.x) {
				this.minPoint.x = pos.x;
			}
			if (pos.y < this.minPoint.y) {
				this.minPoint.y = pos.y;
			}
			if (pos.z < this.minPoint.z) {
				this.minPoint.z = pos.z;
			}

			if (pos.x > this.maxPoint.x) {
				this.maxPoint.x = pos.x;
			}
			if (pos.y > this.maxPoint.y) {
				this.maxPoint.y = pos.y;
			}
			if (pos.z > this.maxPoint.z) {
				this.maxPoint.z = pos.z;
			}

			if (!onlyBox) {
              node.geometry.attributes.classification.array[i] = clipColor;
              // force rerender
              node.geometry.attributes.classification.version += 1;
            }
          }
        }
      }
    }

    return {};
  }

  * getIntersectingChildren(child) {
    if (this.box) {
      if (this.nodeIntersectsBox(child, this.box) /*&& child.hasChildren*/) {
        yield child;

        for (let subChild of Object.values(child.children)) {
          yield* this.getIntersectingChildren(subChild);
        }
      }
    } else {
      if (this.nodeIntersectsBox(child/*, this.box*/)/* && child.hasChildren*/) {
        yield child;

        for (let subChild of Object.values(child.children)) {
          yield* this.getIntersectingChildren(subChild);
        }
      }
    }
 }

  nodeIntersectsBox(child, box) {
    // TODO use AABB
    if (box) {
      return child.boundingBox.clone().applyMatrix4(this.pointCloud.matrixWorld).intersectsBox(box);
    }
    // return child.boundingBox.clone().applyMatrix4(this.pointCloud.matrixWorld).intersectsBox(box);
    return true;
  }
}

export { Classificator }


/*
export default class Classificator {
  constructor(boxes, pointCloud, matrixInverseBoxes, activeClassifications, vertices) {
    this.boxes = boxes;
    this.colorIndexes = boxes.map(box => box.colorIndex);
    this.matrixInverseBoxes = matrixInverseBoxes;
    this.activeClassifications = activeClassifications;
    this.vertices = vertices;

    this.count = 0;

    const box = boxes[0];
    const basePoint = box.position.clone();

    this.box = new THREE.Box3();
    this.box.expandByPoint(basePoint.clone().add(
        new THREE.Vector3(
          (box.scale.x / 2) * -1,
          (box.scale.y / 2) * -1,
          (box.scale.z / 2) * -1,
    )));
    this.box.expandByPoint(basePoint.clone().add(
        new THREE.Vector3(
          (box.scale.x / 2),
          (box.scale.y / 2),
          (box.scale.z / 2),
        )
      ),
    );

    this.pointCloud = pointCloud;
  }

  classifyPoints() {
    const generator = this.getIntersectingChildren(this.pointCloud.pcoGeometry.nodes.r);
    let iterator = generator.next();


    while (!iterator.done) {
      if (!iterator.done) {
        try {
          if (this.vertices) {
            this.filterPolygon(iterator.value);
          } else {
            this.filterPoints(iterator.value);
          }
        } catch (e) {
          console.error('error getChildPoints', e);
        }
      }
      iterator = generator.next();
    }
  }

  pointInClipPolygon(px, py, pz, polygonVertices, e) {

    const w = 1 / (e[3] * px + e[7] * py + e[11] * pz + e[15]);
    const z = (e[2] * px + e[6] * py + e[10] * pz + e[14]) * w;
    const x = (e[0] * px + e[4] * py + e[8] * pz + e[12]) * w;
    const y = (e[1] * px + e[5] * py + e[9] * pz + e[13]) * w;

    if (z < -1 || z > 1) {
        return false;
    }


    let c = false;
    const count = polygonVertices.length;
    const length = Math.min(100, count);
    for (let i = 0, j = count - 1; i < length; i++) {

        const vi = polygonVertices[i];
        const vj = polygonVertices[j];

        if (vi.y > y !== vj.y > y && x < ((vj.x - vi.x) * (y - vi.y)) / (vj.y - vi.y) + vi.x) {
            c = !c;
        }
        j = i;
    }

    return c;
}

  filterPolygon(node) {
    const matrix = new THREE.Matrix4().multiplyMatrices(
        this.pointCloud.matrixWorld,
        new THREE.Matrix4().makeTranslation(...node.boundingBox.min.toArray()),
    );

    let pos = new THREE.Vector3();

    if (node.geometry) {
      let view = new Float32Array(node.geometry.attributes.position.array);

      for (let i = 0; i < node.numPoints; i++) {
        if (!this.activeClassifications.includes(node.geometry.attributes.classification.array[i].toString())) {
          continue;
        }

        pos.set(
          view[i * 3],
          view[i * 3 + 1],
          view[i * 3 + 2]);

        // from local to world
        pos.applyMatrix4(matrix);

        let insideCount = 0;
    	let selectionBox = false;
    	let clipColor;

        for (let j = 0; j < this.boxes.length; j++) {
          const _pos = pos.clone();

          const inside = this.pointInClipPolygon(_pos.x, _pos.y, _pos.z, this.vertices[j], this.matrixInverseBoxes[j].elements);
			insideCount = insideCount + (inside ? 1 : 0);
			if(inside){
			    clipColor = this.colorIndexes[j];
			}

        }

        let insideAny = insideCount > 0;
	    // let insideAll = (this.boxes.length > 0) && (this.boxes.length === insideCount);
        let simple = true;

        if (this.boxes.length > 1) {
            simple = false;
        }

        if (simple) {
          if (insideAny) {
            node.geometry.attributes.classification.array[i] = clipColor;
            // force rerender
            node.geometry.attributes.classification.version += 1;
          }
        } else {
          if(insideAny && insideCount > 1){
            node.geometry.attributes.classification.array[i] = clipColor;
            // force rerender
            node.geometry.attributes.classification.version += 1;
          } else if(selectionBox){
              // pass through
          }
        }
      }
    }
    return {};
  }

  filterPoints(node) {
    const matrix = new THREE.Matrix4().multiplyMatrices(
        this.pointCloud.matrixWorld,
        new THREE.Matrix4().makeTranslation(...node.boundingBox.min.toArray()),
    );

    let pos = new THREE.Vector3();

    if (node.geometry) {
      let view = new Float32Array(node.geometry.attributes.position.array);

      for (let i = 0; i < node.numPoints; i++) {
        if (!this.activeClassifications.includes(node.geometry.attributes.classification.array[i].toString())) {
          continue;
        }

        pos.set(
          view[i * 3],
          view[i * 3 + 1],
          view[i * 3 + 2]);

        // from local to world
        pos.applyMatrix4(matrix);

        let insideCount = 0;
    	let selectionBox = false;
    	let clipColor;

        for (let j = 0; j < this.boxes.length; j++) {
          const _pos = pos.clone();

          // from world to box local
          _pos.applyMatrix4(this.matrixInverseBoxes[j]);

          let inside = (-0.5 <= _pos.x && _pos.x <= 0.5)
              && (-0.5 <= _pos.y && _pos.y <= 0.5)
              && (-0.5 <= _pos.z && _pos.z <= 0.5);

            if (j == 0 && inside) {
                selectionBox = true;
            }

			insideCount = insideCount + (inside ? 1 : 0);
			if(inside){
			    clipColor = this.colorIndexes[j];
			}

        }

        let insideAny = insideCount > 0;
	    // let insideAll = (this.boxes.length > 0) && (this.boxes.length === insideCount);
        let simple = true;

        if (this.boxes.length > 1) {
            simple = false;
        }

        if (simple) {
          if (insideAny) {
            node.geometry.attributes.classification.array[i] = clipColor;
            // force rerender
            node.geometry.attributes.classification.version += 1;
          }
        } else {
          if(insideAny && insideCount > 1){
            node.geometry.attributes.classification.array[i] = clipColor;
            // force rerender
            node.geometry.attributes.classification.version += 1;
          } else if(selectionBox){
              // pass through
          }
        }
      }
    }
    return {};
  }

  * getIntersectingChildren(child) {
    if (this.nodeIntersectsBox(child, this.box)/!* && child.hasChildren*!/) {
      yield child;

      // for (let subChild of _.values(child.children)) {
      for (let subChild of Object.values(child.children)) {
        yield* this.getIntersectingChildren(subChild);
      }
    }
 }

  nodeIntersectsBox(child, box) {
    // TODO use AABB
    // return child.boundingBox.clone().applyMatrix4(this.pointCloud.matrixWorld).intersectsBox(box);
    return true;
  }
}

export { Classificator }
*/
