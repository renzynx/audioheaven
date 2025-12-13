import { serve } from "bun";
import { join } from "path";
import { existsSync } from "fs";
import { apiRoutes } from "./routes";

const isProd = process.env.NODE_ENV === "production";
const distDir = join(process.cwd(), "dist");

// Check for FFmpeg on startup
async function checkFFmpeg() {
	const ffmpegPath = process.env.FFMPEG_PATH || Bun.which("ffmpeg");

	// Also check local bin folder
	const localFFmpeg = join(
		import.meta.dir,
		"..",
		"..",
		"bin",
		process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
	);

	if (ffmpegPath) {
		console.log(`✅ FFmpeg found: ${ffmpegPath}`);
		return ffmpegPath;
	}

	if (existsSync(localFFmpeg)) {
		console.log(`✅ FFmpeg found: ${localFFmpeg}`);
		process.env.FFMPEG_PATH = localFFmpeg;
		return localFFmpeg;
	}

	console.warn("⚠️  FFmpeg not found! Audio processing will fail.");
	console.warn("   Run: bun run setup:ffmpeg");
	return null;
}

await checkFFmpeg();

const server = serve({
	routes: {
		...apiRoutes,
	},

	// Fallback handler for unmatched routes (production static file serving)
	fetch: isProd
		? async (req: Request) => {
				const url = new URL(req.url);

				// Try to serve the exact file
				let filePath = join(distDir, url.pathname);
				let file = Bun.file(filePath);

				if (await file.exists()) {
					return new Response(file);
				}

				// Fall back to index.html for SPA routing
				filePath = join(distDir, "index.html");
				file = Bun.file(filePath);
				if (await file.exists()) {
					return new Response(file, {
						headers: { "Content-Type": "text/html" },
					});
				}

				return new Response("Not Found", { status: 404 });
			}
		: undefined,

	development: !isProd && {
		hmr: true,
		console: true,
	},
});

console.log(`🚀 Server running at ${server.url}`);

export { server };
