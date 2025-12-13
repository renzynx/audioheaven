import { useCallback, useState } from "react";
import { Upload, File, X, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { cn } from "@/lib/utils";

interface AudioUploaderProps {
	onUpload: (
		file: File,
		onProgress?: (percent: number) => void,
	) => Promise<void>;
	isUploading: boolean;
	uploadedFile: { name: string; size: number } | null;
	onClear: () => void;
	maxSizeMB?: number;
}

const ALLOWED_EXTENSIONS = [
	"mp3",
	"wav",
	"ogg",
	"flac",
	"webm",
	"aac",
	"m4a",
	"aiff",
	"aif",
	"opus",
	"wma",
	"ape",
	"tta",
	"mpc",
	"wv",
	"ac3",
	"amr",
	"3gp",
];
const DEFAULT_MAX_SIZE_MB = 100;

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AudioUploader({
	onUpload,
	isUploading,
	uploadedFile,
	onClear,
	maxSizeMB = DEFAULT_MAX_SIZE_MB,
}: AudioUploaderProps) {
	const [isDragOver, setIsDragOver] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [uploadingFileName, setUploadingFileName] = useState<string | null>(
		null,
	);

	const validateFile = useCallback(
		(file: File): string | null => {
			// Check if it's an audio file
			if (!file.type.startsWith("audio/")) {
				const ext = file.name.split(".").pop()?.toLowerCase();
				if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
					return "Only audio files are allowed";
				}
			}
			if (file.size > maxSizeMB * 1024 * 1024) {
				return `File too large. Maximum size is ${maxSizeMB}MB`;
			}
			return null;
		},
		[maxSizeMB],
	);

	const handleFile = useCallback(
		async (file: File) => {
			setError(null);
			setUploadProgress(0);

			const validationError = validateFile(file);
			if (validationError) {
				setError(validationError);
				return;
			}

			setUploadingFileName(file.name);

			try {
				await onUpload(file, (percent) => {
					setUploadProgress(percent);
				});
			} catch (err) {
				setError(err instanceof Error ? err.message : "Upload failed");
			} finally {
				setUploadingFileName(null);
				setUploadProgress(0);
			}
		},
		[onUpload, validateFile],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			setIsDragOver(false);
			const file = e.dataTransfer.files[0];
			if (file) handleFile(file);
		},
		[handleFile],
	);

	const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragOver(false);
	}, []);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) handleFile(file);
			e.target.value = "";
		},
		[handleFile],
	);

	// Show uploaded file
	if (uploadedFile) {
		return (
			<div className="bg-card border border-border rounded-xl p-6">
				<div className="flex items-center gap-4">
					<div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
						<File className="w-6 h-6 text-primary" />
					</div>
					<div className="flex-1 min-w-0">
						<p className="font-medium truncate">{uploadedFile.name}</p>
						<p className="text-sm text-muted-foreground">
							{formatFileSize(uploadedFile.size)}
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={onClear}
						className="shrink-0"
					>
						<X className="w-4 h-4" />
					</Button>
				</div>
			</div>
		);
	}

	// Show progress during upload
	if (isUploading && uploadingFileName) {
		return (
			<div className="bg-card border border-border rounded-xl p-6 space-y-4">
				<div className="flex items-center gap-4">
					<div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
						<Upload className="w-6 h-6 text-primary animate-pulse" />
					</div>
					<div className="flex-1 min-w-0">
						<p className="font-medium truncate">{uploadingFileName}</p>
						<p className="text-sm text-muted-foreground">
							Uploading... {uploadProgress.toFixed(0)}%
						</p>
					</div>
				</div>
				<Progress value={uploadProgress} className="h-2" />
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				role="button"
				tabIndex={0}
				className={cn(
					"relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer",
					isDragOver
						? "border-primary bg-primary/5 scale-[1.02]"
						: "border-border hover:border-primary/50 hover:bg-muted/50",
					isUploading && "pointer-events-none opacity-60",
				)}
			>
				<input
					type="file"
					accept="audio/*"
					onChange={handleInputChange}
					className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
					disabled={isUploading}
				/>
				<div className="space-y-4">
					<div
						className={cn(
							"w-16 h-16 mx-auto rounded-full flex items-center justify-center transition-colors",
							isDragOver ? "bg-primary/20" : "bg-muted",
						)}
					>
						<Upload
							className={cn(
								"w-8 h-8 transition-colors",
								isDragOver ? "text-primary" : "text-muted-foreground",
							)}
						/>
					</div>
					<div>
						<p className="font-medium">
							{isUploading ? "Uploading..." : "Drop your audio file here"}
						</p>
						<p className="text-sm text-muted-foreground mt-1">
							or click to browse • Any audio format • Max {maxSizeMB}MB
						</p>
					</div>
				</div>
			</div>
			{error && (
				<div className="flex items-center gap-2 text-destructive text-sm">
					<AlertCircle className="w-4 h-4" />
					<span>{error}</span>
				</div>
			)}
		</div>
	);
}
