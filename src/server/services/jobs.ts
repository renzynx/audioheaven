import { spawn, type ChildProcess } from "child_process";
import { join } from "path";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import type { AudioProcessingOptions } from "../../types";
import { getUpload, buildFilterChain, setProcessedFile } from "./audio";

export type JobStatus = "pending" | "processing" | "complete" | "error";

export interface Job {
	id: string;
	fileId: string;
	status: JobStatus;
	progress: number;
	error?: string;
	result?: { downloadId: string; fileName: string };
	subscribers: Set<(event: JobEvent) => void>;
	process?: ChildProcess;
}

export interface JobEvent {
	type: "progress" | "complete" | "error";
	progress?: number;
	result?: { downloadId: string; fileName: string };
	error?: string;
}

const jobs = new Map<string, Job>();

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function ensureTempDir(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "audioheaven-"));
}

/**
 * Start a new processing job
 */
export function startJob(
	fileId: string,
	options: AudioProcessingOptions,
): { jobId: string } {
	const upload = getUpload(fileId);
	if (!upload) {
		throw new Error("Upload not found");
	}

	const jobId = generateId();
	const job: Job = {
		id: jobId,
		fileId,
		status: "pending",
		progress: 0,
		subscribers: new Set(),
	};

	jobs.set(jobId, job);

	// Start processing in background
	processInBackground(job, upload, options);

	return { jobId };
}

/**
 * Process audio in background, emitting progress events
 */
async function processInBackground(
	job: Job,
	upload: { path: string; name: string },
	options: AudioProcessingOptions,
): Promise<void> {
	try {
		job.status = "processing";
		emitEvent(job, { type: "progress", progress: 0 });

		const downloadId = generateId();
		const tempDir = await ensureTempDir();

		const baseName = upload.name.replace(/\.[^.]+$/, "");
		const outputName = `${baseName}_${options.preset}.mp3`;
		const outputPath = join(tempDir, `processed-${downloadId}.mp3`);

		const filters = buildFilterChain(options);
		const filterArg = filters.length > 0 ? ["-af", filters.join(",")] : [];

		// Build FFmpeg command with progress output
		const args = [
			"-i",
			upload.path,
			"-y",
			"-progress",
			"pipe:1", // Output progress to stdout
			...filterArg,
			"-acodec",
			"libmp3lame",
			"-q:a",
			"2",
			outputPath,
		];

		let duration = 0;

		await new Promise<void>((resolve, reject) => {
			const ffmpeg = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
			job.process = ffmpeg;

			let stderrData = "";

			// Parse stderr for duration
			ffmpeg.stderr?.on("data", (data: Buffer) => {
				stderrData += data.toString();
				// Extract duration from stderr: Duration: 00:03:45.67
				const durationMatch = stderrData.match(
					/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/,
				);
				if (durationMatch && duration === 0) {
					const [, hours = "0", minutes = "0", seconds = "0"] = durationMatch;
					duration =
						parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
				}
			});

			// Parse stdout for progress
			ffmpeg.stdout?.on("data", (data: Buffer) => {
				const output = data.toString();
				// Parse out_time_ms from progress output
				const timeMatch = output.match(/out_time_ms=(\d+)/);
				if (timeMatch && timeMatch[1] && duration > 0) {
					const currentMs = parseInt(timeMatch[1]) / 1000000; // Convert microseconds to seconds
					const progress = Math.min(
						99,
						Math.round((currentMs / duration) * 100),
					);
					if (progress > job.progress) {
						job.progress = progress;
						emitEvent(job, { type: "progress", progress });
					}
				}
			});

			ffmpeg.on("close", (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`FFmpeg failed with code ${code}`));
				}
			});

			ffmpeg.on("error", (err) => {
				reject(new Error(`FFmpeg error: ${err.message}`));
			});
		});

		// Store processed file
		setProcessedFile(downloadId, outputPath, outputName);

		job.status = "complete";
		job.progress = 100;
		job.result = { downloadId, fileName: outputName };
		emitEvent(job, { type: "complete", result: job.result });
	} catch (err) {
		job.status = "error";
		job.error = err instanceof Error ? err.message : "Processing failed";
		emitEvent(job, { type: "error", error: job.error });
	}
}

/**
 * Emit event to all subscribers
 */
function emitEvent(job: Job, event: JobEvent): void {
	for (const callback of job.subscribers) {
		try {
			callback(event);
		} catch {
			// Ignore callback errors
		}
	}
}

/**
 * Get job by ID
 */
export function getJob(jobId: string): Job | undefined {
	return jobs.get(jobId);
}

/**
 * Subscribe to job events
 */
export function subscribeToJob(
	jobId: string,
	callback: (event: JobEvent) => void,
): () => void {
	const job = jobs.get(jobId);
	if (!job) {
		throw new Error("Job not found");
	}

	job.subscribers.add(callback);

	// If job already complete/error, immediately emit
	if (job.status === "complete" && job.result) {
		callback({ type: "complete", result: job.result });
	} else if (job.status === "error") {
		callback({ type: "error", error: job.error });
	} else {
		// Emit current progress
		callback({ type: "progress", progress: job.progress });
	}

	// Return unsubscribe function
	return () => {
		job.subscribers.delete(callback);
	};
}

/**
 * Clean up old jobs
 */
export function cleanupOldJobs(maxAgeMs: number = 3600000): void {
	const now = Date.now();
	for (const [id, _job] of jobs.entries()) {
		const timestamp = parseInt(id.split("-")[0] ?? "0", 10);
		if (now - timestamp > maxAgeMs) {
			jobs.delete(id);
		}
	}
}
