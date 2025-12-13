#!/usr/bin/env bun
/**
 * FFmpeg Setup Script
 * Checks if FFmpeg is installed and downloads it if missing
 */

import { mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const FFMPEG_DIR = join(import.meta.dir, "..", "bin");

// FFmpeg download URLs by platform
const FFMPEG_URLS: Record<string, { url: string; name: string }> = {
	"win32-x64": {
		url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
		name: "ffmpeg.exe",
	},
	"linux-x64": {
		url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz",
		name: "ffmpeg",
	},
	"darwin-x64": {
		url: "https://evermeet.cx/ffmpeg/getrelease/zip",
		name: "ffmpeg",
	},
	"darwin-arm64": {
		url: "https://www.osxexperts.net/ffmpeg7arm.zip",
		name: "ffmpeg",
	},
};

async function checkFFmpeg(): Promise<string | null> {
	// First check if ffmpeg is in system PATH
	const systemFFmpeg = Bun.which("ffmpeg");
	if (systemFFmpeg) {
		console.log(`✅ FFmpeg found in PATH: ${systemFFmpeg}`);
		return systemFFmpeg;
	}

	// Check if we have a local copy
	const localFFmpeg = join(
		FFMPEG_DIR,
		process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
	);
	if (existsSync(localFFmpeg)) {
		console.log(`✅ FFmpeg found locally: ${localFFmpeg}`);
		return localFFmpeg;
	}

	return null;
}

async function downloadFFmpeg(): Promise<string> {
	const platform = process.platform;
	const arch = process.arch;
	const key = `${platform}-${arch}`;

	const config = FFMPEG_URLS[key];
	if (!config) {
		throw new Error(
			`Unsupported platform: ${platform}-${arch}. Please install FFmpeg manually.`,
		);
	}

	console.log(`📥 Downloading FFmpeg for ${platform}-${arch}...`);
	console.log(`   URL: ${config.url}`);

	await mkdir(FFMPEG_DIR, { recursive: true });

	const response = await fetch(config.url);
	if (!response.ok) {
		throw new Error(`Failed to download FFmpeg: ${response.statusText}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	const archivePath = join(
		FFMPEG_DIR,
		config.url.endsWith(".zip") ? "ffmpeg.zip" : "ffmpeg.tar.xz",
	);

	await Bun.write(archivePath, arrayBuffer);
	console.log(
		`   Downloaded: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`,
	);

	// Extract based on file type
	console.log(`📦 Extracting...`);

	if (archivePath.endsWith(".zip")) {
		// Use unzip for ZIP files
		const proc = Bun.spawn(
			[
				"powershell",
				"-Command",
				`Expand-Archive -Path "${archivePath}" -DestinationPath "${FFMPEG_DIR}" -Force`,
			],
			{
				cwd: FFMPEG_DIR,
				stdout: "inherit",
				stderr: "inherit",
			},
		);
		await proc.exited;

		// Find and move ffmpeg.exe to bin folder
		const { stdout } = Bun.spawn([
			"powershell",
			"-Command",
			`Get-ChildItem -Path "${FFMPEG_DIR}" -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1 -ExpandProperty FullName`,
		]);
		const ffmpegPath = (await new Response(stdout).text()).trim();

		if (ffmpegPath && existsSync(ffmpegPath)) {
			const destPath = join(FFMPEG_DIR, "ffmpeg.exe");
			await Bun.write(destPath, Bun.file(ffmpegPath));
			console.log(`   Extracted to: ${destPath}`);
		}
	} else if (archivePath.endsWith(".tar.xz")) {
		// Use tar for .tar.xz files
		const proc = Bun.spawn(
			["tar", "-xf", archivePath, "-C", FFMPEG_DIR, "--strip-components=2"],
			{
				cwd: FFMPEG_DIR,
				stdout: "inherit",
				stderr: "inherit",
			},
		);
		await proc.exited;
	}

	// Clean up archive
	(await Bun.file(archivePath).delete?.()) ?? null;

	const localFFmpeg = join(FFMPEG_DIR, config.name);

	// Make executable on Unix
	if (platform !== "win32") {
		Bun.spawn(["chmod", "+x", localFFmpeg]);
	}

	console.log(`✅ FFmpeg installed to: ${localFFmpeg}`);
	return localFFmpeg;
}

async function getFFmpegVersion(ffmpegPath: string): Promise<string> {
	const proc = Bun.spawn([ffmpegPath, "-version"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = await new Response(proc.stdout).text();
	const versionMatch = output.match(/ffmpeg version (\S+)/);
	return versionMatch?.[1] ?? "unknown";
}

async function main() {
	console.log("🎬 AudioHeaven FFmpeg Setup\n");

	try {
		let ffmpegPath = await checkFFmpeg();

		if (!ffmpegPath) {
			console.log("⚠️  FFmpeg not found. Downloading...\n");
			ffmpegPath = await downloadFFmpeg();
		}

		const version = await getFFmpegVersion(ffmpegPath);
		console.log(`\n✅ FFmpeg ready! Version: ${version}`);
		console.log(`   Path: ${ffmpegPath}`);

		// Suggest adding to PATH if using local copy
		if (ffmpegPath.includes(FFMPEG_DIR)) {
			console.log(
				`\n💡 Tip: Add "${FFMPEG_DIR}" to your PATH for easier access.`,
			);
		}

		return ffmpegPath;
	} catch (error) {
		console.error(
			"\n❌ Error:",
			error instanceof Error ? error.message : error,
		);
		console.log("\n📝 Manual installation:");
		console.log("   Windows: choco install ffmpeg");
		console.log("   macOS:   brew install ffmpeg");
		console.log("   Linux:   sudo apt install ffmpeg");
		process.exit(1);
	}
}

// Run if executed directly
if (import.meta.main) {
	main();
}

export { checkFFmpeg, downloadFFmpeg, getFFmpegVersion };
