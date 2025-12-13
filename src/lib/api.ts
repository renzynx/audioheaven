import type { EffectPreset, UploadResponse, ApiError } from "../types";

type ApiResponse<T> = T | ApiError;

// Threshold for using chunked upload (5MB)
const CHUNK_THRESHOLD = 5 * 1024 * 1024;

interface UploadConfig {
	maxFileSize: number;
	chunkSize: number;
	allowedTypes: string[];
}

interface ChunkedUploadInit {
	uploadId: string;
	chunkSize: number;
	totalChunks: number;
}

interface FinalizeResult {
	fileId: string;
	fileName: string;
	filePath: string;
}

export async function getUploadConfig(): Promise<UploadConfig> {
	const response = await fetch("/api/audio/config");
	const result = await response.json();
	if (!result.success) {
		throw new Error(result.error?.message || "Failed to get config");
	}
	return result.data;
}

export async function uploadAudio(
	file: File,
	onProgress?: (percent: number) => void,
): Promise<ApiResponse<UploadResponse>> {
	// Use chunked upload for large files
	if (file.size > CHUNK_THRESHOLD) {
		return uploadChunked(file, onProgress);
	}

	// Simple upload for small files
	const formData = new FormData();
	formData.append("file", file);

	const response = await fetch("/api/audio/upload", {
		method: "POST",
		body: formData,
	});

	return response.json();
}

async function uploadChunked(
	file: File,
	onProgress?: (percent: number) => void,
): Promise<ApiResponse<UploadResponse>> {
	try {
		// 1. Initialize upload
		const initResponse = await fetch("/api/audio/upload/init", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				fileName: file.name,
				fileSize: file.size,
				mimeType: file.type,
			}),
		});

		const initResult = await initResponse.json();
		if (!initResult.success) {
			return initResult;
		}

		const { uploadId, chunkSize, totalChunks } =
			initResult.data as ChunkedUploadInit;

		// 2. Upload chunks
		for (let i = 0; i < totalChunks; i++) {
			const start = i * chunkSize;
			const end = Math.min(start + chunkSize, file.size);
			const chunk = file.slice(start, end);

			const formData = new FormData();
			formData.append("uploadId", uploadId);
			formData.append("chunkIndex", i.toString());
			formData.append("chunk", chunk);

			const chunkResponse = await fetch("/api/audio/upload/chunk", {
				method: "POST",
				body: formData,
			});

			const chunkResult = await chunkResponse.json();
			if (!chunkResult.success) {
				// Cancel upload on error
				await cancelUpload(uploadId);
				return chunkResult;
			}

			// Report progress
			if (onProgress) {
				const progress = ((i + 1) / totalChunks) * 100;
				onProgress(progress);
			}
		}

		// 3. Finalize upload
		const finalizeResponse = await fetch("/api/audio/upload/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ uploadId }),
		});

		const finalizeResult = await finalizeResponse.json();
		if (!finalizeResult.success) {
			return finalizeResult;
		}

		const { fileId, fileName } = finalizeResult.data as FinalizeResult;

		return {
			success: true,
			data: { fileId, fileName },
		} as UploadResponse;
	} catch (err) {
		return {
			success: false,
			error: { message: err instanceof Error ? err.message : "Upload failed" },
		} as ApiError;
	}
}

export async function cancelUpload(uploadId: string): Promise<void> {
	await fetch("/api/audio/upload/cancel", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ uploadId }),
	});
}

export interface ProgressEvent {
	type: "progress" | "complete" | "error";
	progress?: number;
	result?: { downloadId: string; fileName: string };
	error?: string;
}

export async function processAudio(
	fileId: string,
	options: {
		preset: EffectPreset;
		speed?: number;
		pitch?: number;
		reverb?: number;
		bassBoost?: number;
		panSpeed?: number;
	},
): Promise<ApiResponse<{ jobId: string }>> {
	const response = await fetch("/api/audio/process", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			fileId,
			...options,
		}),
	});

	return response.json();
}

export function subscribeToProgress(
	jobId: string,
	onEvent: (event: ProgressEvent) => void,
): () => void {
	const eventSource = new EventSource(`/api/audio/process/progress/${jobId}`);

	eventSource.onmessage = (e) => {
		try {
			const data = JSON.parse(e.data) as ProgressEvent;
			onEvent(data);

			// Auto-close on complete or error
			if (data.type === "complete" || data.type === "error") {
				eventSource.close();
			}
		} catch {
			// Ignore parse errors
		}
	};

	eventSource.onerror = () => {
		eventSource.close();
	};

	// Return cleanup function
	return () => {
		eventSource.close();
	};
}

export function getDownloadUrl(downloadId: string): string {
	return `/api/audio/download/${downloadId}`;
}

export async function downloadAudio(
	downloadId: string,
	fileName: string,
): Promise<void> {
	const url = getDownloadUrl(downloadId);
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error("Download failed");
	}

	const blob = await response.blob();
	const objectUrl = URL.createObjectURL(blob);

	const a = document.createElement("a");
	a.href = objectUrl;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);

	URL.revokeObjectURL(objectUrl);
}
