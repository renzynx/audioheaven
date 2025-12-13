import { spawn } from "child_process";
import { existsSync } from "fs";
import { mkdir, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { AudioProcessingOptions } from "../../types";

// Use consistent upload directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./output";

const uploadedFiles = new Map<string, { path: string; name: string }>();
const processedFiles = new Map<string, { path: string; name: string }>();

/**
 * Set a processed file entry (used by jobs service)
 */
export function setProcessedFile(
	downloadId: string,
	path: string,
	name: string,
): void {
	processedFiles.set(downloadId, { path, name });
}

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function ensureDirectories(): Promise<void> {
	await mkdir(UPLOAD_DIR, { recursive: true });
	await mkdir(OUTPUT_DIR, { recursive: true });
}

async function ensureTempDir(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "audioheaven-"));
}

export async function storeUpload(
	file: File,
): Promise<{ fileId: string; fileName: string }> {
	await ensureDirectories();

	const fileId = generateId();
	const ext = file.name.split(".").pop() || "mp3";
	const filePath = join(UPLOAD_DIR, `${fileId}.${ext}`);

	// Write file to disk
	const buffer = await file.arrayBuffer();
	await Bun.write(filePath, buffer);

	// Store metadata as JSON alongside the file
	await Bun.write(
		join(UPLOAD_DIR, `${fileId}.json`),
		JSON.stringify({ name: file.name }),
	);

	uploadedFiles.set(fileId, { path: filePath, name: file.name });

	return { fileId, fileName: file.name };
}

export function getUpload(
	fileId: string,
): { path: string; name: string } | undefined {
	// Check in-memory cache first
	const cached = uploadedFiles.get(fileId);
	if (cached) return cached;

	// Try to recover from disk (for hot reload scenarios)
	const metaPath = join(UPLOAD_DIR, `${fileId}.json`);
	if (existsSync(metaPath)) {
		try {
			const meta = JSON.parse(require("fs").readFileSync(metaPath, "utf-8"));
			// Find the actual file
			const files = require("fs").readdirSync(UPLOAD_DIR);
			const audioFile = files.find(
				(f: string) => f.startsWith(fileId) && !f.endsWith(".json"),
			);
			if (audioFile) {
				const filePath = join(UPLOAD_DIR, audioFile);
				uploadedFiles.set(fileId, { path: filePath, name: meta.name });
				return { path: filePath, name: meta.name };
			}
		} catch {
			// Failed to recover
		}
	}

	return undefined;
}

export function buildFilterChain(options: AudioProcessingOptions): string[] {
	const filters: string[] = [];

	// Speed adjustment using atempo (works for 0.5-2.0 range)
	if (options.speed !== 1) {
		// atempo only works between 0.5 and 2.0, chain multiple if needed
		let speed = options.speed;
		while (speed < 0.5) {
			filters.push("atempo=0.5");
			speed /= 0.5;
		}
		while (speed > 2.0) {
			filters.push("atempo=2.0");
			speed /= 2.0;
		}
		if (speed !== 1) {
			filters.push(`atempo=${speed.toFixed(4)}`);
		}
	}

	// Pitch shifting using asetrate + aresample
	// Pitch in semitones: multiply rate by 2^(semitones/12)
	if (options.pitch !== 0) {
		const pitchFactor = Math.pow(2, options.pitch / 12);
		filters.push(`asetrate=44100*${pitchFactor.toFixed(6)}`);
		filters.push("aresample=44100");
	}

	// Reverb using aecho
	if (options.reverb > 0) {
		const intensity = options.reverb / 100;
		const decay = 0.3 + intensity * 0.4; // 0.3 to 0.7
		const delay = 50 + intensity * 100; // 50ms to 150ms
		filters.push(`aecho=0.8:0.88:${delay.toFixed(0)}:${decay.toFixed(2)}`);
	}

	// Bass boost using equalizer
	if (options.bassBoost > 0) {
		const gain = (options.bassBoost / 100) * 15; // 0 to 15 dB
		filters.push(`equalizer=f=80:width_type=o:width=2:g=${gain.toFixed(1)}`);
	}

	// 8D audio effect using apulsator for stereo panning
	if (options.preset === "8d" && options.panSpeed) {
		const hz = options.panSpeed; // oscillation frequency
		filters.push(`apulsator=mode=sine:hz=${hz}:amount=1`);
	}

	return filters;
}

/**
 * Process audio file with specified effects
 */
export async function processAudio(
	fileId: string,
	options: AudioProcessingOptions,
): Promise<{ downloadId: string; fileName: string }> {
	const upload = uploadedFiles.get(fileId);
	if (!upload) {
		throw new Error("Upload not found");
	}

	const downloadId = generateId();
	const tempDir = await ensureTempDir();

	// Generate output filename with effect name
	const baseName = upload.name.replace(/\.[^.]+$/, "");
	const outputName = `${baseName}_${options.preset}.mp3`;
	const outputPath = join(tempDir, `processed-${downloadId}.mp3`);

	const filters = buildFilterChain(options);
	const filterArg = filters.length > 0 ? ["-af", filters.join(",")] : [];

	// Build FFmpeg command
	const args = [
		"-i",
		upload.path,
		"-y", // Overwrite output
		...filterArg,
		"-acodec",
		"libmp3lame",
		"-q:a",
		"2", // High quality
		outputPath,
	];

	// Execute FFmpeg
	await new Promise<void>((resolve, reject) => {
		const ffmpeg = spawn("ffmpeg", args, { stdio: "pipe" });

		let stderr = "";
		ffmpeg.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		ffmpeg.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`FFmpeg failed: ${stderr}`));
			}
		});

		ffmpeg.on("error", (err) => {
			reject(new Error(`FFmpeg error: ${err.message}`));
		});
	});

	processedFiles.set(downloadId, { path: outputPath, name: outputName });

	return { downloadId, fileName: outputName };
}

/**
 * Get processed file for download
 */
export function getProcessedFile(
	downloadId: string,
): { path: string; name: string } | undefined {
	return processedFiles.get(downloadId);
}

/**
 * Clean up old files (call periodically)
 */
export async function cleanupOldFiles(
	maxAgeMs: number = 3600000,
): Promise<void> {
	const now = Date.now();

	// Clean uploads older than maxAge
	for (const [id, info] of uploadedFiles.entries()) {
		const timestamp = parseInt(id.split("-")[0] ?? "0", 10);
		if (now - timestamp > maxAgeMs) {
			try {
				await rm(info.path, { force: true });
				uploadedFiles.delete(id);
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	// Clean processed files older than maxAge
	for (const [id, info] of processedFiles.entries()) {
		const timestamp = parseInt(id.split("-")[0] ?? "0", 10);
		if (now - timestamp > maxAgeMs) {
			try {
				await rm(info.path, { force: true });
				processedFiles.delete(id);
			} catch {
				// Ignore cleanup errors
			}
		}
	}
}
