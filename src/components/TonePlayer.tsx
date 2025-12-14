import { useRef, useState, useEffect, useCallback } from "react";
import {
	Play,
	Pause,
	Volume2,
	VolumeX,
	Download,
	RotateCcw,
	SkipBack,
	SkipForward,
} from "lucide-react";
import * as Tone from "tone";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";

interface TonePlayerProps {
	src: string | null;
	fileName: string;
	onDownload?: () => void;
	showDownload?: boolean;
	label?: string;
}

function formatTime(seconds: number): string {
	if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function TonePlayer({
	src,
	fileName,
	onDownload,
	showDownload = false,
	label,
}: TonePlayerProps) {
	const playerRef = useRef<Tone.Player | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(0.8);
	const [isMuted, setIsMuted] = useState(false);
	const [isReady, setIsReady] = useState(false);
	const animationRef = useRef<number | null>(null);

	// Initialize player when src changes
	useEffect(() => {
		if (!src) {
			setIsReady(false);
			return;
		}

		setIsLoading(true);
		setIsPlaying(false);
		setCurrentTime(0);
		setDuration(0);
		setIsReady(false);

		// Clean up previous player
		if (playerRef.current) {
			playerRef.current.stop();
			playerRef.current.dispose();
		}

		// Create new player
		const player = new Tone.Player({
			url: src,
			onload: () => {
				setDuration(player.buffer.duration);
				setIsLoading(false);
				setIsReady(true);
			},
			onerror: (err) => {
				console.error("Failed to load audio:", err);
				setIsLoading(false);
			},
		}).toDestination();

		player.volume.value = Tone.gainToDb(volume);
		playerRef.current = player;

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
			player.stop();
			player.dispose();
		};
	}, [src]);

	// Update volume
	useEffect(() => {
		if (playerRef.current) {
			playerRef.current.volume.value = isMuted
				? -Infinity
				: Tone.gainToDb(volume);
		}
	}, [volume, isMuted]);

	// Update time display during playback
	useEffect(() => {
		const updateTime = () => {
			if (playerRef.current && isPlaying) {
				const player = playerRef.current;
				if (player.state === "started") {
					// Calculate current position
					const elapsed = Tone.Transport.seconds - (player as any)._startTime;
					const pos = Math.max(0, Math.min(elapsed, duration));
					setCurrentTime(pos);

					if (pos >= duration) {
						setIsPlaying(false);
						setCurrentTime(0);
					}
				}
				animationRef.current = requestAnimationFrame(updateTime);
			}
		};

		if (isPlaying) {
			animationRef.current = requestAnimationFrame(updateTime);
		}

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
		};
	}, [isPlaying, duration]);

	const togglePlay = useCallback(async () => {
		if (!playerRef.current || !isReady) return;

		// Ensure audio context is started (required for browsers)
		if (Tone.context.state !== "running") {
			await Tone.start();
		}

		if (isPlaying) {
			playerRef.current.stop();
			setIsPlaying(false);
		} else {
			playerRef.current.start(undefined, currentTime);
			(playerRef.current as any)._startTime =
				Tone.Transport.seconds - currentTime;
			setIsPlaying(true);
		}
	}, [isPlaying, isReady, currentTime]);

	const handleSeek = useCallback(
		(value: number[]) => {
			const newTime = value[0];
			if (newTime === undefined) return;

			setCurrentTime(newTime);

			if (playerRef.current && isPlaying) {
				playerRef.current.stop();
				playerRef.current.start(undefined, newTime);
				(playerRef.current as any)._startTime =
					Tone.Transport.seconds - newTime;
			}
		},
		[isPlaying],
	);

	const handleVolumeChange = useCallback((value: number[]) => {
		const newVolume = value[0];
		if (newVolume === undefined) return;
		setVolume(newVolume);
		setIsMuted(newVolume === 0);
	}, []);

	const toggleMute = useCallback(() => {
		setIsMuted(!isMuted);
	}, [isMuted]);

	const handleRestart = useCallback(async () => {
		if (!playerRef.current || !isReady) return;

		if (Tone.context.state !== "running") {
			await Tone.start();
		}

		playerRef.current.stop();
		playerRef.current.start();
		(playerRef.current as any)._startTime = Tone.Transport.seconds;
		setCurrentTime(0);
		setIsPlaying(true);
	}, [isReady]);

	const skipBack = useCallback(() => {
		const newTime = Math.max(0, currentTime - 10);
		handleSeek([newTime]);
	}, [currentTime, handleSeek]);

	const skipForward = useCallback(() => {
		const newTime = Math.min(duration, currentTime + 10);
		handleSeek([newTime]);
	}, [currentTime, duration, handleSeek]);

	if (!src) {
		return (
			<div className="bg-muted/50 border border-border rounded-xl p-6 text-center text-muted-foreground">
				<p>No audio to play</p>
			</div>
		);
	}

	return (
		<div className="w-full max-w-full bg-card border border-border rounded-xl p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-hidden box-border">
			{label && (
				<p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
					{label}
				</p>
			)}

			<div className="flex items-center gap-2 sm:gap-3">
				<div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
					<Button
						variant="ghost"
						size="icon"
						onClick={skipBack}
						disabled={!isReady || isLoading}
						className="h-8 w-8 shrink-0"
					>
						<SkipBack className="w-4 h-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={togglePlay}
						disabled={!isReady || isLoading}
						className="h-10 w-10 sm:h-12 sm:w-12 rounded-full shrink-0"
					>
						{isLoading ? (
							<div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
						) : isPlaying ? (
							<Pause className="w-4 h-4 sm:w-5 sm:h-5" />
						) : (
							<Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />
						)}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={skipForward}
						disabled={!isReady || isLoading}
						className="h-8 w-8 shrink-0"
					>
						<SkipForward className="w-4 h-4" />
					</Button>
				</div>

				<div className="flex-1 min-w-0 space-y-2 overflow-hidden">
					<p className="font-medium text-sm truncate">{fileName}</p>
					<div className="flex items-center gap-1.5 sm:gap-3">
						<span className="text-xs text-muted-foreground w-8 sm:w-10 text-right font-mono shrink-0">
							{formatTime(currentTime)}
						</span>
						<Slider
							value={[currentTime]}
							onValueChange={handleSeek}
							max={duration || 100}
							step={0.1}
							disabled={!isReady}
							className="flex-1 min-w-0"
						/>
						<span className="text-xs text-muted-foreground w-8 sm:w-10 font-mono shrink-0">
							{formatTime(duration)}
						</span>
					</div>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-1 sm:gap-2">
					<Button variant="ghost" size="icon" onClick={toggleMute} className="shrink-0">
						{isMuted ? (
							<VolumeX className="w-4 h-4" />
						) : (
							<Volume2 className="w-4 h-4" />
						)}
					</Button>
					<Slider
						value={[isMuted ? 0 : volume]}
						onValueChange={handleVolumeChange}
						max={1}
						step={0.01}
						className="w-12 sm:w-24"
					/>
					<Button variant="ghost" size="icon" onClick={handleRestart} className="shrink-0">
						<RotateCcw className="w-4 h-4" />
					</Button>
				</div>

				{showDownload && onDownload && (
					<Button onClick={onDownload} size="sm" variant="secondary" className="shrink-0">
						<Download className="w-4 h-4 sm:mr-2" />
						<span className="hidden sm:inline">Download</span>
					</Button>
				)}
			</div>
		</div>
	);
}
