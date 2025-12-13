import { join } from "path";
import { mkdir, rm, readdir, writeFile, appendFile } from "fs/promises";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./output";
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "104857600", 10); // 100MB default
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

const activeUploads = new Map<
	string,
	{
		fileName: string;
		totalChunks: number;
		receivedChunks: Set<number>;
		tempDir: string;
		createdAt: number;
	}
>();

async function ensureDirectories() {
	await mkdir(UPLOAD_DIR, { recursive: true });
	await mkdir(OUTPUT_DIR, { recursive: true });
}

function generateUploadId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function initChunkedUpload(
	fileName: string,
	fileSize: number,
): Promise<{
	uploadId: string;
	chunkSize: number;
	totalChunks: number;
}> {
	await ensureDirectories();

	if (fileSize > MAX_FILE_SIZE) {
		throw new Error(
			`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
		);
	}

	const uploadId = generateUploadId();
	const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
	const tempDir = join(UPLOAD_DIR, `temp-${uploadId}`);

	await mkdir(tempDir, { recursive: true });

	activeUploads.set(uploadId, {
		fileName,
		totalChunks,
		receivedChunks: new Set(),
		tempDir,
		createdAt: Date.now(),
	});

	return { uploadId, chunkSize: CHUNK_SIZE, totalChunks };
}

export async function uploadChunk(
	uploadId: string,
	chunkIndex: number,
	chunkData: ArrayBuffer,
): Promise<{ received: number; total: number; complete: boolean }> {
	const upload = activeUploads.get(uploadId);
	if (!upload) {
		throw new Error("Upload session not found or expired");
	}

	// Save chunk to temp file
	const chunkPath = join(
		upload.tempDir,
		`chunk-${chunkIndex.toString().padStart(6, "0")}`,
	);
	await writeFile(chunkPath, Buffer.from(chunkData));

	upload.receivedChunks.add(chunkIndex);

	const received = upload.receivedChunks.size;
	const complete = received === upload.totalChunks;

	return { received, total: upload.totalChunks, complete };
}

export async function finalizeUpload(uploadId: string): Promise<{
	fileId: string;
	fileName: string;
	filePath: string;
}> {
	const upload = activeUploads.get(uploadId);
	if (!upload) {
		throw new Error("Upload session not found or expired");
	}

	if (upload.receivedChunks.size !== upload.totalChunks) {
		throw new Error(
			`Missing chunks: received ${upload.receivedChunks.size}/${upload.totalChunks}`,
		);
	}

	// Create final file path
	const ext = upload.fileName.split(".").pop() || "mp3";
	const fileId = generateUploadId();
	const finalPath = join(UPLOAD_DIR, `${fileId}.${ext}`);

	// Read all chunks in order and write to final file
	const chunks = await readdir(upload.tempDir);
	chunks.sort(); // Ensure correct order

	// Create empty file first
	await writeFile(finalPath, Buffer.alloc(0));

	// Append each chunk
	for (const chunkFile of chunks) {
		const chunkPath = join(upload.tempDir, chunkFile);
		const chunkData = await Bun.file(chunkPath).arrayBuffer();
		await appendFile(finalPath, Buffer.from(chunkData));
	}

	// Write metadata JSON for recovery by audio service
	await writeFile(
		join(UPLOAD_DIR, `${fileId}.json`),
		JSON.stringify({ name: upload.fileName }),
	);

	// Cleanup temp directory
	await rm(upload.tempDir, { recursive: true, force: true });
	activeUploads.delete(uploadId);

	return { fileId, fileName: upload.fileName, filePath: finalPath };
}

/**
 * Cancel/abort an upload
 */
export async function cancelUpload(uploadId: string): Promise<void> {
	const upload = activeUploads.get(uploadId);
	if (upload) {
		await rm(upload.tempDir, { recursive: true, force: true });
		activeUploads.delete(uploadId);
	}
}

/**
 * Get upload status
 */
export function getUploadStatus(uploadId: string): {
	exists: boolean;
	received?: number;
	total?: number;
	complete?: boolean;
} {
	const upload = activeUploads.get(uploadId);
	if (!upload) {
		return { exists: false };
	}
	return {
		exists: true,
		received: upload.receivedChunks.size,
		total: upload.totalChunks,
		complete: upload.receivedChunks.size === upload.totalChunks,
	};
}

/**
 * Cleanup old incomplete uploads (call periodically)
 */
export async function cleanupStalledUploads(
	maxAgeMs: number = 3600000,
): Promise<void> {
	const now = Date.now();
	for (const [id, upload] of activeUploads.entries()) {
		if (now - upload.createdAt > maxAgeMs) {
			await rm(upload.tempDir, { recursive: true, force: true });
			activeUploads.delete(id);
		}
	}
}

// Export config
export { UPLOAD_DIR, OUTPUT_DIR, MAX_FILE_SIZE, CHUNK_SIZE };

export function getUploadConfig() {
	return {
		maxFileSize: MAX_FILE_SIZE,
		chunkSize: CHUNK_SIZE,
	};
}
