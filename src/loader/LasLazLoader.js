import { Version } from '../Version.js';
import { XHRFactory } from '../XHRFactory.js';

/**
 * laslaz code taken and adapted from plas.io js-laslaz
 *	http://plas.io/
 *  https://github.com/verma/plasio
 *
 * Thanks to Uday Verma and Howard Butler
 *
 */

export class LasLazLoader {
	constructor(version, extension) {
		if (typeof (version) === 'string') {
			this.version = new Version(version);
		} else {
			this.version = version;
		}

		this.extension = extension;
	}

	static progressCB() {

	}

	load(node) {
		if (node.loaded) {
			return;
		}

		let url = node.getURL();

		if (this.version.equalOrHigher('1.4')) {
			url += `.${this.extension}`;
		}

		const xhr = XHRFactory.createXMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.responseType = 'arraybuffer';
		xhr.overrideMimeType('text/plain; charset=x-user-defined');
		xhr.onreadystatechange = () => {
			if (xhr.readyState === 4) {
				if (xhr.status === 200 || xhr.status === 0) {
					const buffer = xhr.response;
					this.parse(node, buffer);
				} else {
					console.log(`Failed to load file! HTTP status: ${xhr.status}, file: ${url}`);
				}
			}
		};

		xhr.send(null);
	}

	async parse(node, buffer) {
		const lf = new LASFile(buffer);
		const handler = new LasLazBatcher(node);

		try {
			 await lf.open();
			 lf.isOpen = true;
		} catch (e) {
			console.log('failed to open file. :(');

			return;
		}

		const header = await lf.getHeader();

		const skip = 1;
		let totalRead = 0;
		const totalToRead = (skip <= 1 ? header.pointsCount : header.pointsCount / skip);

		let hasMoreData = true;

		while (hasMoreData) {
			const data = await lf.readData(1000 * 1000, 0, skip);

			handler.push(new LASDecoder(data.buffer,
				header.pointsFormatId,
				header.pointsStructSize,
				data.count,
				header.scale,
				header.offset,
				header.mins, header.maxs));

			totalRead += data.count;
			LasLazLoader.progressCB(totalRead / totalToRead);

			hasMoreData = data.hasMoreData;
		}

		header.totalRead = totalRead;
		header.versionAsString = lf.versionAsString;
		header.isCompressed = lf.isCompressed;

		LasLazLoader.progressCB(1);

		try {
			await lf.close();

			lf.isOpen = false;
		} catch (e) {
			console.error('failed to close las/laz file!!!');

			throw e;
		}
	}

	handle(node, url) {

	}
}

export class LasLazBatcher {
	constructor(node) {
		this.node = node;
	}

	push(lasBuffer) {
		const workerPath = `${Potree.scriptPath}/workers/LASDecoderWorker.js`;
		const worker = Potree.workerPool.getWorker(workerPath);
		const { node } = this;
		const { pointAttributes } = node.pcoGeometry;

		worker.onmessage = e => {
			const geometry = new THREE.BufferGeometry();
			const numPoints = lasBuffer.pointsCount;

			const positions = new Float32Array(e.data.position);
			const colors = new Uint8Array(e.data.color);
			const intensities = new Float32Array(e.data.intensity);
			const classifications = new Uint8Array(e.data.classification);
			const returnNumbers = new Uint8Array(e.data.returnNumber);
			const numberOfReturns = new Uint8Array(e.data.numberOfReturns);
			const pointSourceIDs = new Uint16Array(e.data.pointSourceID);
			const indices = new Uint8Array(e.data.indices);

			const bufferAttribute = new THREE.BufferAttribute(classifications, 1);

			geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
			geometry.addAttribute('color', new THREE.BufferAttribute(colors, 4, true));
			geometry.addAttribute('intensity', new THREE.BufferAttribute(intensities, 1));
			// geometry.addAttribute('classification', new THREE.BufferAttribute(classifications, 1));
			geometry.addAttribute('classification', bufferAttribute);
			geometry.addAttribute('return number', new THREE.BufferAttribute(returnNumbers, 1));
			geometry.addAttribute('number of returns', new THREE.BufferAttribute(numberOfReturns, 1));
			geometry.addAttribute('source id', new THREE.BufferAttribute(pointSourceIDs, 1));
			geometry.addAttribute('indices', new THREE.BufferAttribute(indices, 4));
			geometry.attributes.indices.normalized = true;

			for (const key in e.data.ranges) {
				const range = e.data.ranges[key];

				const attribute = pointAttributes.attributes.find(a => a.name === key);
				attribute.range[0] = Math.min(attribute.range[0], range[0]);
				attribute.range[1] = Math.max(attribute.range[1], range[1]);
			}

			const tightBoundingBox = new THREE.Box3(
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.min),
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.max),
			);

			geometry.boundingBox = this.node.boundingBox;
			this.node.tightBoundingBox = tightBoundingBox;

			this.node.geometry = geometry;
			this.node.numPoints = numPoints;
			this.node.loaded = true;
			this.node.loading = false;
			Potree.numNodesLoading--;
			this.node.mean = new THREE.Vector3(...e.data.mean);

			Potree.workerPool.returnWorker(workerPath, worker);
		};

		const message = {
			buffer: lasBuffer.arrayb,
			numPoints: lasBuffer.pointsCount,
			pointSize: lasBuffer.pointSize,
			// pointFormatID: 2,
			pointFormatID: parseInt(lasBuffer.decoder.name),
			scale: lasBuffer.scale,
			offset: lasBuffer.offset,
			mins: lasBuffer.mins,
			maxs: lasBuffer.maxs,
			commands: window.viewer.scene.pointWorkerCommands,
		};

		worker.postMessage(message, [message.buffer]);
	}
}
