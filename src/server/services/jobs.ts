import { spawn, type ChildProcess } from "child_process";
import { join } from "path";
import { mkdir } from "fs/promises";
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

const OUTPUT_DIR = join(process.cwd(), "output");

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function ensureOutputDir(): Promise<string> {
	await mkdir(OUTPUT_DIR, { recursive: true });
	return OUTPUT_DIR;
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

async function processInBackground(
	job: Job,
	upload: { path: string; name: string },
	options: AudioProcessingOptions,
): Promise<void> {
	try {
		job.status = "processing";
		emitEvent(job, { type: "progress", progress: 0 });

		const downloadId = generateId();
		const outputDir = await ensureOutputDir();

		const baseName = upload.name.replace(/\.[^.]+$/, "");
		const outputName = `${baseName}_${options.preset}.mp3`;
		const outputPath = join(outputDir, `${outputName.replace(/\.mp3$/, "")}-${downloadId}.mp3`);

		const filters = buildFilterChain(options);
		const filterArg = filters.length > 0 ? ["-af", filters.join(",")] : [];

		const args = [
			"-i",
			upload.path,
			"-y",
			...filterArg,
			"-acodec",
			"libmp3lame",
			"-q:a",
			"2",
			outputPath,
		];

		let duration = 0;
		let lastProgress = 0;

		await new Promise<void>((resolve, reject) => {
			const ffmpeg = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
			job.process = ffmpeg;

			ffmpeg.stderr?.on("data", (data: Buffer) => {
				const output = data.toString();

				// Parse duration from the initial file info
				if (duration === 0) {
					const durationMatch = output.match(
						/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/,
					);
					if (durationMatch) {
						const [, hours = "0", mins = "0", secs = "0", centis = "0"] = durationMatch;
						duration =
							parseInt(hours) * 3600 +
							parseInt(mins) * 60 +
							parseInt(secs) +
							parseInt(centis) / 100;
					}
				}

				const timeMatch = output.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
				if (timeMatch && duration > 0) {
					const [, h = "0", m = "0", s = "0", cs = "0"] = timeMatch;
					const currentSec = parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(cs) / 100;
					const progress = Math.min(99, Math.round((currentSec / duration) * 100));
					if (progress > lastProgress) {
						lastProgress = progress;
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

function emitEvent(job: Job, event: JobEvent): void {
	for (const callback of job.subscribers) {
		try {
			callback(event);
		} catch {
			// Ignore callback errors
		}
	}
}

export function getJob(jobId: string): Job | undefined {
	return jobs.get(jobId);
}

export function subscribeToJob(
	jobId: string,
	callback: (event: JobEvent) => void,
): () => void {
	const job = jobs.get(jobId);
	if (!job) {
		throw new Error("Job not found");
	}

	job.subscribers.add(callback);

	return () => {
		job.subscribers.delete(callback);
	};
}

export function cleanupOldJobs(maxAgeMs: number = 3600000): void {
	const now = Date.now();
	for (const [id, _job] of jobs.entries()) {
		const timestamp = parseInt(id.split("-")[0] ?? "0", 10);
		if (now - timestamp > maxAgeMs) {
			jobs.delete(id);
		}
	}
}
