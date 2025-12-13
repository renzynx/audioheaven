import { error, success } from "../utils";
import { storeUpload, getUpload, getProcessedFile } from "../services/audio";
import { startJob, subscribeToJob, getJob } from "../services/jobs";
import {
	initChunkedUpload,
	uploadChunk,
	finalizeUpload,
	cancelUpload,
	getUploadStatus,
	getUploadConfig,
	MAX_FILE_SIZE,
} from "../services/upload";
import { EFFECT_PRESETS, type AudioProcessingOptions } from "../../types";

/** All FFmpeg supported audio MIME types */
const ALLOWED_TYPES = [
	// Common formats
	"audio/mpeg",
	"audio/mp3",
	"audio/wav",
	"audio/wave",
	"audio/x-wav",
	"audio/ogg",
	"audio/vorbis",
	"audio/flac",
	"audio/x-flac",
	"audio/webm",
	"audio/aac",
	"audio/mp4",
	"audio/x-m4a",
	"audio/m4a",
	"audio/aiff",
	"audio/x-aiff",
	"audio/opus",
	"audio/x-opus",
	"audio/amr",
	"audio/3gpp",
	"audio/3gpp2",
	"audio/ac3",
	"audio/eac3",
	"audio/x-ms-wma",
	"audio/x-matroska",
	"audio/ape",
	"audio/x-ape",
	"audio/x-tta",
	"audio/speex",
	"audio/x-speex",
	"audio/musepack",
	"audio/x-musepack",
	"audio/wavpack",
	"audio/x-wavpack",
];

export const audioRoutes = {
	/**
	 * Get upload configuration
	 */
	"/api/audio/config": {
		GET() {
			return success({
				...getUploadConfig(),
				allowedTypes: ALLOWED_TYPES,
			});
		},
	},

	/**
	 * Initialize a chunked upload
	 */
	"/api/audio/upload/init": {
		async POST(req: Request) {
			try {
				const { fileName, fileSize, mimeType } = await req.json();

				if (!fileName || !fileSize) {
					return error("fileName and fileSize required", { status: 400 });
				}

				// Allow any audio type - FFmpeg will handle conversion
				if (mimeType && !mimeType.startsWith("audio/")) {
					return error("Only audio files are allowed", { status: 400 });
				}

				if (fileSize > MAX_FILE_SIZE) {
					return error(
						`File too large. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
						{ status: 400 },
					);
				}

				const result = await initChunkedUpload(fileName, fileSize);
				return success(result);
			} catch (err) {
				console.error("Init upload error:", err);
				return error(
					err instanceof Error ? err.message : "Failed to init upload",
					{ status: 500 },
				);
			}
		},
	},

	/**
	 * Upload a chunk
	 */
	"/api/audio/upload/chunk": {
		async POST(req: Request) {
			try {
				const formData = await req.formData();
				const uploadId = formData.get("uploadId") as string;
				const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
				const chunk = formData.get("chunk") as File;

				if (!uploadId || Number.isNaN(chunkIndex) || !chunk) {
					return error("uploadId, chunkIndex, and chunk required", {
						status: 400,
					});
				}

				const chunkData = await chunk.arrayBuffer();
				const result = await uploadChunk(uploadId, chunkIndex, chunkData);
				return success(result);
			} catch (err) {
				console.error("Chunk upload error:", err);
				return error(
					err instanceof Error ? err.message : "Failed to upload chunk",
					{ status: 500 },
				);
			}
		},
	},

	/**
	 * Finalize chunked upload
	 */
	"/api/audio/upload/finalize": {
		async POST(req: Request) {
			try {
				const { uploadId } = await req.json();

				if (!uploadId) {
					return error("uploadId required", { status: 400 });
				}

				const result = await finalizeUpload(uploadId);
				return success(result);
			} catch (err) {
				console.error("Finalize error:", err);
				return error(
					err instanceof Error ? err.message : "Failed to finalize upload",
					{ status: 500 },
				);
			}
		},
	},

	/**
	 * Cancel/abort an upload
	 */
	"/api/audio/upload/cancel": {
		async POST(req: Request) {
			try {
				const { uploadId } = await req.json();
				await cancelUpload(uploadId);
				return success({ cancelled: true });
			} catch (_err) {
				return error("Failed to cancel upload", { status: 500 });
			}
		},
	},

	/**
	 * Get upload status
	 */
	"/api/audio/upload/status/:id": async (
		req: Request & { params: { id: string } },
	) => {
		const status = getUploadStatus(req.params.id);
		return success(status);
	},

	/**
	 * Simple single-file upload (for small files)
	 */
	"/api/audio/upload": {
		async POST(req: Request) {
			try {
				const formData = await req.formData();
				const file = formData.get("file") as File | null;

				if (!file) {
					return error("No file provided", { status: 400 });
				}

				// Allow any audio type - FFmpeg handles conversion
				if (!file.type.startsWith("audio/")) {
					return error("Only audio files are allowed", { status: 400 });
				}

				if (file.size > MAX_FILE_SIZE) {
					return error(
						`File too large. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
						{ status: 400 },
					);
				}

				const result = await storeUpload(file);
				return success(result);
			} catch (err) {
				console.error("Upload error:", err);
				return error("Failed to upload file", { status: 500 });
			}
		},
	},

	"/api/audio/process": {
		async POST(req: Request) {
			try {
				const body = await req.json();
				const { fileId, preset, speed, pitch, reverb, bassBoost, panSpeed } =
					body;

				if (!fileId) {
					return error("No fileId provided", { status: 400 });
				}

				const upload = getUpload(fileId);
				if (!upload) {
					return error("File not found. Please upload again.", { status: 404 });
				}

				let options: AudioProcessingOptions;

				if (preset === "custom") {
					options = {
						preset: "custom",
						speed: speed ?? 1,
						pitch: pitch ?? 0,
						reverb: reverb ?? 0,
						bassBoost: bassBoost ?? 0,
						panSpeed,
					};
				} else if (
					preset &&
					EFFECT_PRESETS[preset as keyof typeof EFFECT_PRESETS]
				) {
					options = {
						preset,
						...EFFECT_PRESETS[preset as keyof typeof EFFECT_PRESETS],
					};
				} else {
					return error("Invalid preset", { status: 400 });
				}

				// Start job in background and return immediately
				const { jobId } = startJob(fileId, options);
				return success({ jobId });
			} catch (err) {
				console.error("Processing error:", err);
				return error(
					err instanceof Error ? err.message : "Failed to start processing",
					{ status: 500 },
				);
			}
		},
	},

	"/api/audio/process/progress/:jobId": (
		req: Request & { params: { jobId: string } },
	) => {
		const { jobId } = req.params;

		const job = getJob(jobId);
		if (!job) {
			return error("Job not found", { status: 404 });
		}

		// Create SSE stream
		const stream = new ReadableStream({
			start(controller) {
				const encoder = new TextEncoder();

				const sendEvent = (data: object) => {
					const message = `data: ${JSON.stringify(data)}\n\n`;
					controller.enqueue(encoder.encode(message));
				};

				const unsubscribe = subscribeToJob(jobId, (event) => {
					sendEvent(event);

					// Close stream on complete or error
					if (event.type === "complete" || event.type === "error") {
						setTimeout(() => {
							unsubscribe();
							controller.close();
						}, 100);
					}
				});

				// Handle client disconnect
				req.signal?.addEventListener("abort", () => {
					unsubscribe();
					controller.close();
				});
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	},

	"/api/audio/download/:id": async (
		req: Request & { params: { id: string } },
	) => {
		try {
			const file = getProcessedFile(req.params.id);

			if (!file) {
				return error("File not found or expired", { status: 404 });
			}

			const fileContent = await Bun.file(file.path).arrayBuffer();

			return new Response(fileContent, {
				headers: {
					"Content-Type": "audio/mpeg",
					"Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
				},
			});
		} catch (err) {
			console.error("Download error:", err);
			return error("Failed to download file", { status: 500 });
		}
	},
};
