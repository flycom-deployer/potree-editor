function classifyPoint(x, y, z, commands, classification) {
	let newClassification = classification;

	for (let i = 0; i < commands.length; i++) {
		const {activeClassifications, selections} = commands[i];

		if (!activeClassifications.includes(newClassification.toString())) {
			continue;
		}

		let clipVolumesCount = 0;
		let insideCount = 0;
		let clipColor;
		let _clipColor;

		for (let j = 0; j < selections.length; j++) {
			let inside;
			const {type, targetClassification, matrix, vertices} = selections[j];

			if (type === 'box') {
				// from world to box local
				const [x1, y1, z1, w1] = multiplyMatrixAndPoint(matrix.elements, [x, y, z, 1]);

				inside = (-0.5 <= x1 && x1 <= 0.5)
					&& (-0.5 <= y1 && y1 <= 0.5)
					&& (-0.5 <= z1 && z1 <= 0.5);

				if (inside) {
					_clipColor = targetClassification;
				}
			} else if (type === 'polygon') {
				inside = pointInClipPolygon(x, y, z, vertices, matrix.elements);

				if (inside) {
					_clipColor = targetClassification;
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
			  let insideAll = clipVolumesCount == insideCount;

			  if (insideAll) {
				newClassification = clipColor;
			}
		}
	}

	return newClassification;
}

function multiplyMatrixAndPoint(matrix, [x, y, z, w]) {
    const resultX = x * matrix[0] + y * matrix[4] + z * matrix[8] + w * matrix[12];
    const resultY = x * matrix[1] + y * matrix[5] + z * matrix[9] + w * matrix[13];
    const resultZ = x * matrix[2] + y * matrix[6] + z * matrix[10] + w * matrix[14];
    const resultW = x * matrix[3] + y * matrix[7] + z * matrix[11] + w * matrix[15];

    return [resultX, resultY, resultZ, resultW];
}

function pointInClipPolygon(px, py, pz, polygonVertices, e) {

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
