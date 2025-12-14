import { readdir, stat, unlink, rm } from "fs/promises";
import { join } from "path";
import { cleanupOldJobs } from "./jobs";

const UPLOADS_DIR = join(process.cwd(), "uploads");
const OUTPUT_DIR = join(process.cwd(), "output");
const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // Run every minute

let cleanupTimer: Timer | null = null;

async function cleanupDirectory(dir: string, maxAgeMs: number): Promise<number> {
    let deletedCount = 0;
    const now = Date.now();

    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            try {
                if (entry.isDirectory()) {
                    // For directories (like chunk temp dirs), check if empty or old
                    const dirStat = await stat(fullPath);
                    if (now - dirStat.mtimeMs > maxAgeMs) {
                        try {
                            await rm(fullPath, { recursive: true });
                            deletedCount++;
                        } catch {
                            // Directory not empty or other error, skip
                        }
                    }
                } else if (entry.isFile()) {
                    const fileStat = await stat(fullPath);
                    if (now - fileStat.mtimeMs > maxAgeMs) {
                        await unlink(fullPath);
                        deletedCount++;
                    }
                }
            } catch {
                // Skip files we can't stat or delete
            }
        }
    } catch {
        // Directory doesn't exist or can't be read
    }

    return deletedCount;
}

async function runCleanup(): Promise<void> {
    const uploadsDeleted = await cleanupDirectory(UPLOADS_DIR, MAX_AGE_MS);
    const outputDeleted = await cleanupDirectory(OUTPUT_DIR, MAX_AGE_MS);
    cleanupOldJobs(MAX_AGE_MS);

    const total = uploadsDeleted + outputDeleted;
    if (total > 0) {
        console.log(`🧹 Cleanup: removed ${total} old files (${uploadsDeleted} uploads, ${outputDeleted} output)`);
    }
}

export function startCleanupJob(): void {
    if (cleanupTimer) {
        return;
    }

    // Run immediately on startup
    runCleanup();

    // Schedule periodic cleanup
    cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
    console.log("🧹 File cleanup job started (removes files older than 15 minutes)");
}

export function stopCleanupJob(): void {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
    }
}
