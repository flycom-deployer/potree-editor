importScripts('./ClassificatorWorker.js')

function readUsingTempArrays(event) {
	performance.mark('laslaz-start');

	const { buffer } = event.data;
	const { numPoints } = event.data;
	const sourcePointSize = event.data.pointSize;
	const { pointFormatID } = event.data;
	const { scale } = event.data;
	const { offset } = event.data;

	const temp = new ArrayBuffer(4);
	const tempUint8 = new Uint8Array(temp);
	const tempUint16 = new Uint16Array(temp);
	const tempInt32 = new Int32Array(temp);
	const sourceUint8 = new Uint8Array(buffer);
	const sourceView = new DataView(buffer);

	const targetPointSize = 20;
	const targetBuffer = new ArrayBuffer(numPoints * targetPointSize);
	const targetView = new DataView(targetBuffer);

	const tightBoundingBox = {
		min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
		max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
	};

	const mean = [0, 0, 0];

	const pBuff = new ArrayBuffer(numPoints * 3 * 4);
	const cBuff = new ArrayBuffer(numPoints * 4);
	const iBuff = new ArrayBuffer(numPoints * 4);
	const clBuff = new ArrayBuffer(numPoints);
	const rnBuff = new ArrayBuffer(numPoints);
	const nrBuff = new ArrayBuffer(numPoints);
	const psBuff = new ArrayBuffer(numPoints * 2);

	const positions = new Float32Array(pBuff);
	const colors = new Uint8Array(cBuff);
	const intensities = new Float32Array(iBuff);
	const classifications = new Uint8Array(clBuff);
	const returnNumbers = new Uint8Array(rnBuff);
	const numberOfReturns = new Uint8Array(nrBuff);
	const pointSourceIDs = new Uint16Array(psBuff);

	for (let i = 0; i < numPoints; i++) {
		// POSITION
		tempUint8[0] = sourceUint8[i * sourcePointSize + 0];
		tempUint8[1] = sourceUint8[i * sourcePointSize + 1];
		tempUint8[2] = sourceUint8[i * sourcePointSize + 2];
		tempUint8[3] = sourceUint8[i * sourcePointSize + 3];
		let x = tempInt32[0];

		tempUint8[0] = sourceUint8[i * sourcePointSize + 4];
		tempUint8[1] = sourceUint8[i * sourcePointSize + 5];
		tempUint8[2] = sourceUint8[i * sourcePointSize + 6];
		tempUint8[3] = sourceUint8[i * sourcePointSize + 7];
		let y = tempInt32[0];

		tempUint8[0] = sourceUint8[i * sourcePointSize + 8];
		tempUint8[1] = sourceUint8[i * sourcePointSize + 9];
		tempUint8[2] = sourceUint8[i * sourcePointSize + 10];
		tempUint8[3] = sourceUint8[i * sourcePointSize + 11];
		let z = tempInt32[0];

		x = x * scale[0] + offset[0] - event.data.mins[0];
		y = y * scale[1] + offset[1] - event.data.mins[1];
		z = z * scale[2] + offset[2] - event.data.mins[2];

		positions[3 * i + 0] = x;
		positions[3 * i + 1] = y;
		positions[3 * i + 2] = z;

		mean[0] += x / numPoints;
		mean[1] += y / numPoints;
		mean[2] += z / numPoints;

		tightBoundingBox.min[0] = Math.min(tightBoundingBox.min[0], x);
		tightBoundingBox.min[1] = Math.min(tightBoundingBox.min[1], y);
		tightBoundingBox.min[2] = Math.min(tightBoundingBox.min[2], z);

		tightBoundingBox.max[0] = Math.max(tightBoundingBox.max[0], x);
		tightBoundingBox.max[1] = Math.max(tightBoundingBox.max[1], y);
		tightBoundingBox.max[2] = Math.max(tightBoundingBox.max[2], z);

		// INTENSITY
		tempUint8[0] = sourceUint8[i * sourcePointSize + 12];
		tempUint8[1] = sourceUint8[i * sourcePointSize + 13];
		const intensity = tempUint16[0];
		intensities[i] = intensity;

		// RETURN NUMBER, stored in the first 3 bits - 00000111
		const returnNumber = sourceUint8[i * sourcePointSize + 14] & 0b111;
		returnNumbers[i] = returnNumber;

		// NUMBER OF RETURNS, stored in 00111000
		numberOfReturns[i] = (sourceUint8[i * pointSize + 14] & 0b111000) >> 3;

		debugger;

		// CLASSIFICATION
		const classification = sourceUint8[i * sourcePointSize + 15];
		classifications[i] = classification;

		// POINT SOURCE ID
		tempUint8[0] = sourceUint8[i * sourcePointSize + 18];
		tempUint8[1] = sourceUint8[i * sourcePointSize + 19];
		const pointSourceID = tempUint16[0];
		pointSourceIDs[i] = pointSourceID;

		// COLOR, if available
		if (pointFormatID === 2) {
			tempUint8[0] = sourceUint8[i * sourcePointSize + 20];
			tempUint8[1] = sourceUint8[i * sourcePointSize + 21];
			let r = tempUint16[0];

			tempUint8[0] = sourceUint8[i * sourcePointSize + 22];
			tempUint8[1] = sourceUint8[i * sourcePointSize + 23];
			let g = tempUint16[0];

			tempUint8[0] = sourceUint8[i * sourcePointSize + 24];
			tempUint8[1] = sourceUint8[i * sourcePointSize + 25];
			let b = tempUint16[0];

			r /= 256;
			g /= 256;
			b /= 256;
			colors[4 * i + 0] = r;
			colors[4 * i + 1] = g;
			colors[4 * i + 2] = b;
		}
	}

	const indices = new ArrayBuffer(numPoints * 4);
	const iIndices = new Uint32Array(indices);
	for (let i = 0; i < numPoints; i++) {
		iIndices[i] = i;
	}

	performance.mark('laslaz-end');
	performance.measure('laslaz', 'laslaz-start', 'laslaz-end');

	const measure = performance.getEntriesByType('measure')[0];
	const dpp = 1000 * measure.duration / numPoints;
	const debugMessage = `${measure.duration.toFixed(3)} ms, ${numPoints} points, ${dpp.toFixed(3)} micros / point`;

	performance.clearMarks();
	performance.clearMeasures();

	const message = {
		mean,
		position: pBuff,
		color: cBuff,
		intensity: iBuff,
		classification: clBuff,
		returnNumber: rnBuff,
		numberOfReturns: nrBuff,
		pointSourceID: psBuff,
		tightBoundingBox,
		indices,
	};

	const transferables = [
		message.position,
		message.color,
		message.intensity,
		message.classification,
		message.returnNumber,
		message.numberOfReturns,
		message.pointSourceID,
		message.indices];

	debugger;

	postMessage(message, transferables);
}

function readUsingDataView(event) {
	performance.mark('laslaz-start');

	const { buffer } = event.data;
	const { numPoints } = event.data;
	const sourcePointSize = event.data.pointSize;
	const { pointFormatID } = event.data;
	const { scale } = event.data;
	const { offset } = event.data;
	const { commands } = event.data;

	const sourceUint8 = new Uint8Array(buffer);
	const sourceView = new DataView(buffer);

	const targetPointSize = 40;
	const targetBuffer = new ArrayBuffer(numPoints * targetPointSize);
	const targetView = new DataView(targetBuffer);

	const tightBoundingBox = {
		min: [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
		max: [-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE],
	};

	const mean = [0, 0, 0];

	const pBuff = new ArrayBuffer(numPoints * 3 * 4);
	const cBuff = new ArrayBuffer(numPoints * 4);
	const iBuff = new ArrayBuffer(numPoints * 4);
	const clBuff = new ArrayBuffer(numPoints);
	const rnBuff = new ArrayBuffer(numPoints);
	const nrBuff = new ArrayBuffer(numPoints);
	const psBuff = new ArrayBuffer(numPoints * 2);

	const positions = new Float32Array(pBuff);
	const colors = new Uint8Array(cBuff);
	const intensities = new Float32Array(iBuff);
	const classifications = new Uint8Array(clBuff);
	const returnNumbers = new Uint8Array(rnBuff);
	const numberOfReturns = new Uint8Array(nrBuff);
	const pointSourceIDs = new Uint16Array(psBuff);

	const rangeIntensity = [Infinity, -Infinity];
	const rangeClassification = [Infinity, -Infinity];
	const rangeReturnNumber = [Infinity, -Infinity];
	const rangeNumberOfReturns = [Infinity, -Infinity];
	const rangeSourceID = [Infinity, -Infinity];

	for (let i = 0; i < numPoints; i++) {
		// POSITION
		const ux = sourceView.getInt32(i * sourcePointSize + 0, true);
		const uy = sourceView.getInt32(i * sourcePointSize + 4, true);
		const uz = sourceView.getInt32(i * sourcePointSize + 8, true);

		x = ux * scale[0] + offset[0] - event.data.mins[0];
		y = uy * scale[1] + offset[1] - event.data.mins[1];
		z = uz * scale[2] + offset[2] - event.data.mins[2];

		positions[3 * i + 0] = x;
		positions[3 * i + 1] = y;
		positions[3 * i + 2] = z;

		mean[0] += x / numPoints;
		mean[1] += y / numPoints;
		mean[2] += z / numPoints;

		tightBoundingBox.min[0] = Math.min(tightBoundingBox.min[0], x);
		tightBoundingBox.min[1] = Math.min(tightBoundingBox.min[1], y);
		tightBoundingBox.min[2] = Math.min(tightBoundingBox.min[2], z);

		tightBoundingBox.max[0] = Math.max(tightBoundingBox.max[0], x);
		tightBoundingBox.max[1] = Math.max(tightBoundingBox.max[1], y);
		tightBoundingBox.max[2] = Math.max(tightBoundingBox.max[2], z);

		// INTENSITY
		const intensity = sourceView.getUint16(i * sourcePointSize + 12, true);
		intensities[i] = intensity;
		rangeIntensity[0] = Math.min(rangeIntensity[0], intensity);
		rangeIntensity[1] = Math.max(rangeIntensity[1], intensity);

		// RETURN NUMBER, stored in the first 3 bits - 00000111
		// number of returns stored in next 3 bits   - 00111000
		const returnNumberAndNumberOfReturns = sourceView.getUint8(i * sourcePointSize + 14, true);
		const returnNumber = returnNumberAndNumberOfReturns & 0b0111;
		const numberOfReturn = (returnNumberAndNumberOfReturns & 0b00111000) >> 3;
		returnNumbers[i] = returnNumber;
		numberOfReturns[i] = numberOfReturn;
		rangeReturnNumber[0] = Math.min(rangeReturnNumber[0], returnNumber);
		rangeReturnNumber[1] = Math.max(rangeReturnNumber[1], returnNumber);
		rangeNumberOfReturns[0] = Math.min(rangeNumberOfReturns[0], numberOfReturn);
		rangeNumberOfReturns[1] = Math.max(rangeNumberOfReturns[1], numberOfReturn);

		// CLASSIFICATION
		const classification = sourceView.getUint8(i * sourcePointSize + 15, true);
		classifications[i] = classification;

		rangeClassification[0] = Math.min(rangeClassification[0], classification);
		rangeClassification[1] = Math.max(rangeClassification[1], classification);

		// POINT SOURCE ID
		const pointSourceID = sourceView.getUint16(i * sourcePointSize + 18, true);
		pointSourceIDs[i] = pointSourceID;
		rangeSourceID[0] = Math.min(rangeSourceID[0], pointSourceID);
		rangeSourceID[1] = Math.max(rangeSourceID[1], pointSourceID);

		// COLOR, if available
		/*
		if (pointFormatID === 2) {
			let r = sourceView.getUint16(i * sourcePointSize + 20, true) / 256;
			let g = sourceView.getUint16(i * sourcePointSize + 22, true) / 256;
			let b = sourceView.getUint16(i * sourcePointSize + 24, true) / 256;

			colors[4 * i + 0] = r;
			colors[4 * i + 1] = g;
			colors[4 * i + 2] = b;
			colors[4 * i + 3] = 255;
		}
		*/
		// COLOR, if available
		let startOffset = 0;

		if (pointFormatID === 2) {
			startOffset = 20;
		}
		if (pointFormatID === 3 || pointFormatID === 5) {
			startOffset = 28;
		}

		if (startOffset > 0) {
			const r = sourceView.getUint16(i * sourcePointSize + startOffset, true) / 256;
			const g = sourceView.getUint16(i * sourcePointSize + startOffset + 2, true) / 256;
			const b = sourceView.getUint16(i * sourcePointSize + startOffset + 4, true) / 256;

			colors[4 * i + 0] = r;
			colors[4 * i + 1] = g;
			colors[4 * i + 2] = b;
			colors[4 * i + 3] = 255;
		}
	}

	if (commands) {
		for (let i = 0; i < numPoints; i++) {
			const x = positions[3 * i + 0];
			const y = positions[3 * i + 1];
			const z = positions[3 * i + 2];

			// TODO select intersected with box nodes
			const newClassification = classifyPoint(x + event.data.mins[0], y + event.data.mins[1], z + event.data.mins[2], commands, classifications[i]);

			if (newClassification !== classifications[i]) {
				classifications[i] = newClassification || classifications[i];
			}
		}
	}

	const indices = new ArrayBuffer(numPoints * 4);
	const iIndices = new Uint32Array(indices);
	for (let i = 0; i < numPoints; i++) {
		iIndices[i] = i;
	}

	performance.mark('laslaz-end');
	performance.clearMarks();
	performance.clearMeasures();

	const ranges = {
		intensity: rangeIntensity,
		classification: rangeClassification,
		'return number': rangeReturnNumber,
		'number of returns': rangeNumberOfReturns,
		'source id': rangeSourceID,
	};

	const message = {
		mean,
		position: pBuff,
		color: cBuff,
		intensity: iBuff,
		classification: clBuff,
		returnNumber: rnBuff,
		numberOfReturns: nrBuff,
		pointSourceID: psBuff,
		tightBoundingBox,
		indices,
		ranges,
	};

	const transferables = [
		message.position,
		message.color,
		message.intensity,
		message.classification,
		message.returnNumber,
		message.numberOfReturns,
		message.pointSourceID,
		message.indices];

	postMessage(message, transferables);
}

onmessage = readUsingDataView;
