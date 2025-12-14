import { useState, useCallback, useEffect } from "react";
import { Github } from "lucide-react";
import { AudioUploader } from "./components/AudioUploader";
import { EffectsPanel } from "./components/EffectsPanel";
import { EffectPreviewPlayer } from "./components/EffectPreviewPlayer";
import {
	ProcessingStatus,
	type ProcessingState,
} from "./components/ProcessingStatus";
import { ThemeToggle } from "./components/ThemeToggle";
import {
	uploadAudio,
	processAudio,
	subscribeToProgress,
	downloadAudio,
	getUploadConfig,
} from "./lib/api";
import type { AudioProcessingOptions, EffectPreset } from "./types";
import "./index.css";

export function App() {
	// Upload state
	const [isUploading, setIsUploading] = useState(false);
	const [uploadedFile, setUploadedFile] = useState<{
		name: string;
		size: number;
	} | null>(null);
	const [fileId, setFileId] = useState<string | null>(null);
	const [originalAudioUrl, setOriginalAudioUrl] = useState<string | null>(null);

	// Processing state
	const [processingState, setProcessingState] =
		useState<ProcessingState>("idle");
	const [processingError, setProcessingError] = useState<string | undefined>();
	const [processingProgress, setProcessingProgress] = useState(0);

	// Result state
	const [downloadId, setDownloadId] = useState<string | null>(null);
	const [processedFileName, setProcessedFileName] = useState<
		string | undefined
	>();

	// Config state
	const [maxSizeMB, setMaxSizeMB] = useState(100);

	// Preview effect options (for real-time Tone.js preview)
	const [previewEffectOptions, setPreviewEffectOptions] = useState<
		Omit<AudioProcessingOptions, "preset"> | null
	>(null);

	// Fetch config on mount
	useEffect(() => {
		getUploadConfig()
			.then((config) => {
				setMaxSizeMB(Math.floor(config.maxFileSize / 1024 / 1024));
			})
			.catch(() => {
				// Keep default 100MB on error
			});
	}, []);

	const handleUpload = useCallback(
		async (file: File, onProgress?: (percent: number) => void) => {
			setIsUploading(true);
			setProcessingState("idle");
			setDownloadId(null);

			try {
				const result = await uploadAudio(file, onProgress);

				if (!result.success) {
					throw new Error(result.error?.message || "Upload failed");
				}

				setFileId(result.data.fileId);
				setUploadedFile({ name: file.name, size: file.size });

				// Create object URL for preview
				const url = URL.createObjectURL(file);
				setOriginalAudioUrl(url);
			} catch (err) {
				throw err;
			} finally {
				setIsUploading(false);
			}
		},
		[],
	);

	const handleClearUpload = useCallback(() => {
		if (originalAudioUrl) {
			URL.revokeObjectURL(originalAudioUrl);
		}
		setUploadedFile(null);
		setFileId(null);
		setOriginalAudioUrl(null);
		setProcessingState("idle");
		setDownloadId(null);
		setProcessedFileName(undefined);
		setPreviewEffectOptions(null);
	}, [originalAudioUrl]);

	const handleApplyEffect = useCallback(
		async (
			options: Omit<AudioProcessingOptions, "preset"> & {
				preset: EffectPreset;
			},
		) => {
			if (!fileId) return;

			setProcessingState("processing");
			setProcessingError(undefined);
			setProcessingProgress(0);

			try {
				// Start processing - returns immediately with jobId
				const result = await processAudio(fileId, options);

				// Response is { success, data? | error? }
				if (!("success" in result) || !result.success) {
					const errorResult = result as { error?: { message?: string } };
					throw new Error(errorResult.error?.message || "Processing failed");
				}

				const successResult = result as unknown as { data: { jobId: string } };
				const jobId = successResult.data.jobId;

				subscribeToProgress(jobId, (event) => {
					if (event.type === "progress" && event.progress !== undefined) {
						setProcessingProgress(event.progress);
					} else if (event.type === "complete" && event.result) {
						setDownloadId(event.result.downloadId);
						setProcessedFileName(event.result.fileName);
						setProcessingState("complete");
						setProcessingProgress(100);
					} else if (event.type === "error") {
						setProcessingState("error");
						setProcessingError(event.error || "Processing failed");
					}
				});
			} catch (err) {
				setProcessingState("error");
				setProcessingError(
					err instanceof Error ? err.message : "Processing failed",
				);
			}
		},
		[fileId],
	);

	const handleDownload = useCallback(() => {
		if (downloadId && processedFileName) {
			downloadAudio(downloadId, processedFileName);
		}
	}, [downloadId, processedFileName]);

	return (
		<div className="min-h-screen bg-background overflow-x-hidden">
			{/* Background gradient */}
			<div className="fixed inset-0 bg-gradient-to-br from-primary/5 via-background to-secondary/5 pointer-events-none" />
			<div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />

			<div className="relative z-10">
				{/* Header */}
				<header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-20">
					<div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between">
						<div className="flex items-center gap-3">
							<h1 className="text-xl sm:text-2xl font-bold tracking-tight">AudioHeaven</h1>
						</div>
						<div className="flex items-center gap-2">
							<ThemeToggle />
							<a
								href="https://github.com"
								target="_blank"
								rel="noopener noreferrer"
								className="text-muted-foreground hover:text-foreground transition-colors"
							>
								<Github className="w-5 h-5" />
							</a>
						</div>
					</div>
				</header>

				{/* Main Content */}
				<main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-4xl">
					<div className="space-y-6 sm:space-y-8">
						{/* Hero Section */}
						<div className="text-center space-y-4 py-8">
							<h2 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
								Transform Your Audio
							</h2>
							<p className="text-lg text-muted-foreground max-w-2xl mx-auto">
								Apply Nightcore, Slow+Reverb, and more effects to any audio
								file. Powered by FFmpeg for high-quality processing.
							</p>
						</div>

						{/* Upload Section */}
						<section className="space-y-4">
							<h3 className="text-lg font-semibold flex items-center gap-2">
								<span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
									1
								</span>
								Upload Your Audio
							</h3>
							<AudioUploader
								onUpload={handleUpload}
								isUploading={isUploading}
								uploadedFile={uploadedFile}
								onClear={handleClearUpload}
								maxSizeMB={maxSizeMB}
							/>
						</section>

						{/* Effects Section */}
						<section className="space-y-4">
							<h3 className="text-lg font-semibold flex items-center gap-2">
								<span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
									2
								</span>
								Choose Effect
							</h3>
							<EffectsPanel
								onApply={handleApplyEffect}
								onPreviewChange={setPreviewEffectOptions}
								isProcessing={processingState === "processing"}
								disabled={!fileId}
							/>
						</section>

						{/* Real-time Effect Preview */}
						{originalAudioUrl && uploadedFile && previewEffectOptions && (
							<EffectPreviewPlayer
								src={originalAudioUrl}
								effectOptions={previewEffectOptions}
								fileName={uploadedFile.name}
								label="Effect Preview (Real-time)"
							/>
						)}

						{/* Processing Status */}
						<ProcessingStatus
							state={processingState}
							progress={processingProgress}
							errorMessage={processingError}
							fileName={processedFileName}
							onDownload={handleDownload}
						/>

					</div>
				</main>

				{/* Footer */}
				<footer className="border-t border-border/50 mt-16">
					<div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
						<p>
							AudioHeaven • Made with ♥ • Audio processing powered by FFmpeg
						</p>
					</div>
				</footer>
			</div>
		</div>
	);
}

export default App;
