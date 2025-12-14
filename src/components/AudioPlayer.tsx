import { useRef, useState, useEffect, useCallback } from "react";
import {
	Play,
	Pause,
	Volume2,
	VolumeX,
	Download,
	RotateCcw,
} from "lucide-react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Progress } from "./ui/progress";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
	src: string | null;
	fileName: string;
	onDownload?: () => void;
	showDownload?: boolean;
	label?: string;
}

function formatTime(seconds: number): string {
	if (!isFinite(seconds)) return "0:00";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
	src,
	fileName,
	onDownload,
	showDownload = false,
	label,
}: AudioPlayerProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(1);
	const [isMuted, setIsMuted] = useState(false);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
		const handleDurationChange = () => setDuration(audio.duration);
		const handleEnded = () => setIsPlaying(false);
		const handlePlay = () => setIsPlaying(true);
		const handlePause = () => setIsPlaying(false);

		audio.addEventListener("timeupdate", handleTimeUpdate);
		audio.addEventListener("durationchange", handleDurationChange);
		audio.addEventListener("ended", handleEnded);
		audio.addEventListener("play", handlePlay);
		audio.addEventListener("pause", handlePause);

		return () => {
			audio.removeEventListener("timeupdate", handleTimeUpdate);
			audio.removeEventListener("durationchange", handleDurationChange);
			audio.removeEventListener("ended", handleEnded);
			audio.removeEventListener("play", handlePlay);
			audio.removeEventListener("pause", handlePause);
		};
	}, [src]);

	useEffect(() => {
		// Reset when source changes
		setIsPlaying(false);
		setCurrentTime(0);
		setDuration(0);
	}, [src]);

	const togglePlay = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) return;

		if (isPlaying) {
			audio.pause();
		} else {
			audio.play();
		}
	}, [isPlaying]);

	const handleSeek = useCallback((value: number[]) => {
		const audio = audioRef.current;
		if (!audio || value[0] === undefined) return;
		audio.currentTime = value[0];
		setCurrentTime(value[0]);
	}, []);

	const handleVolumeChange = useCallback((value: number[]) => {
		const audio = audioRef.current;
		if (!audio || value[0] === undefined) return;
		const newVolume = value[0];
		audio.volume = newVolume;
		setVolume(newVolume);
		setIsMuted(newVolume === 0);
	}, []);

	const toggleMute = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) return;
		if (isMuted) {
			audio.volume = volume || 1;
			setIsMuted(false);
		} else {
			audio.volume = 0;
			setIsMuted(true);
		}
	}, [isMuted, volume]);

	const handleRestart = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.currentTime = 0;
		audio.play();
	}, []);

	const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

	if (!src) {
		return (
			<div className="bg-muted/50 border border-border rounded-xl p-6 text-center text-muted-foreground">
				<p>No audio to play</p>
			</div>
		);
	}

	return (
		<div className="w-full max-w-full bg-card border border-border rounded-xl p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-hidden box-border">
			<audio ref={audioRef} src={src} preload="metadata" />

			{label && (
				<p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
					{label}
				</p>
			)}

			<div className="flex items-center gap-2 sm:gap-3">
				<Button
					variant="outline"
					size="icon"
					onClick={togglePlay}
					className="h-10 w-10 sm:h-12 sm:w-12 rounded-full shrink-0"
				>
					{isPlaying ? (
						<Pause className="w-4 h-4 sm:w-5 sm:h-5" />
					) : (
						<Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />
					)}
				</Button>

				<div className="flex-1 min-w-0 space-y-2 overflow-hidden">
					<p className="font-medium text-sm truncate">{fileName}</p>
					<div className="flex items-center gap-1.5 sm:gap-3">
						<span className="text-xs text-muted-foreground w-8 sm:w-10 text-right shrink-0">
							{formatTime(currentTime)}
						</span>
						<Slider
							value={[currentTime]}
							onValueChange={handleSeek}
							max={duration || 100}
							step={0.1}
							className="flex-1 min-w-0"
						/>
						<span className="text-xs text-muted-foreground w-8 sm:w-10 shrink-0">
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
