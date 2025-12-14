import { useRef, useState, useEffect, useCallback } from "react";
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    RotateCcw,
    SkipBack,
    SkipForward,
    Loader2,
} from "lucide-react";
import * as Tone from "tone";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import type { AudioProcessingOptions } from "../types";

interface EffectPreviewPlayerProps {
    /** URL or blob URL of the original audio */
    src: string | null;
    /** Current effect options to preview */
    effectOptions: Omit<AudioProcessingOptions, "preset"> | null;
    /** File name for display */
    fileName: string;
    /** Label above the player */
    label?: string;
}

function formatTime(seconds: number): string {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function EffectPreviewPlayer({
    src,
    effectOptions,
    fileName,
    label = "Effect Preview",
}: EffectPreviewPlayerProps) {
    // Refs for Tone.js nodes
    const playerRef = useRef<Tone.Player | null>(null);
    const pitchShiftRef = useRef<Tone.PitchShift | null>(null);
    const reverbRef = useRef<Tone.Reverb | null>(null);
    const bassFilterRef = useRef<Tone.Filter | null>(null);
    const pannerRef = useRef<Tone.Panner | null>(null);
    const lfoRef = useRef<Tone.LFO | null>(null);
    const gainRef = useRef<Tone.Gain | null>(null);

    // State
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.8);
    const [isMuted, setIsMuted] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const animationRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(0);

    // Clean up all audio nodes
    const disposeNodes = useCallback(() => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }

        lfoRef.current?.stop();
        lfoRef.current?.dispose();
        lfoRef.current = null;

        playerRef.current?.stop();
        playerRef.current?.dispose();
        playerRef.current = null;

        pitchShiftRef.current?.dispose();
        pitchShiftRef.current = null;

        reverbRef.current?.dispose();
        reverbRef.current = null;

        bassFilterRef.current?.dispose();
        bassFilterRef.current = null;

        pannerRef.current?.dispose();
        pannerRef.current = null;

        gainRef.current?.dispose();
        gainRef.current = null;
    }, []);

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

        disposeNodes();

        // Create audio chain
        const gain = new Tone.Gain(volume).toDestination();
        gainRef.current = gain;

        const panner = new Tone.Panner(0).connect(gain);
        pannerRef.current = panner;

        // Create LFO for 8D panning (but don't start it yet)
        const lfo = new Tone.LFO(0.5, -1, 1);
        lfo.connect(panner.pan);
        lfoRef.current = lfo;

        const bassFilter = new Tone.Filter({
            type: "lowshelf",
            frequency: 200,
            gain: 0,
        }).connect(panner);
        bassFilterRef.current = bassFilter;

        const reverb = new Tone.Reverb({
            decay: 2,
            wet: 0,
        }).connect(bassFilter);
        reverbRef.current = reverb;

        const pitchShift = new Tone.PitchShift({
            pitch: 0,
            windowSize: 0.1,
            delayTime: 0.1,
        }).connect(reverb);
        pitchShiftRef.current = pitchShift;

        // Load the audio
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
        }).connect(pitchShift);

        playerRef.current = player;

        return () => {
            disposeNodes();
        };
    }, [src, disposeNodes]);

    // Apply effect options when they change
    useEffect(() => {
        if (!effectOptions || !isReady) return;

        const { speed, pitch, reverb, bassBoost, panSpeed } = effectOptions;

        // Apply playback rate (speed)
        if (playerRef.current) {
            playerRef.current.playbackRate = speed;
        }

        // Apply pitch shift
        if (pitchShiftRef.current) {
            pitchShiftRef.current.pitch = pitch;
        }

        // Apply reverb (wet amount 0-1)
        if (reverbRef.current) {
            reverbRef.current.wet.value = reverb / 100;
        }

        // Apply bass boost (gain in dB)
        if (bassFilterRef.current) {
            // Map 0-100 to 0-20dB boost
            bassFilterRef.current.gain.value = (bassBoost / 100) * 20;
        }

        // Apply 8D panning
        if (lfoRef.current && panSpeed !== undefined && panSpeed > 0) {
            lfoRef.current.frequency.value = panSpeed;
            if (lfoRef.current.state !== "started") {
                lfoRef.current.start();
            }
        } else if (lfoRef.current) {
            lfoRef.current.stop();
            if (pannerRef.current) {
                pannerRef.current.pan.value = 0;
            }
        }
    }, [effectOptions, isReady]);

    // Update volume
    useEffect(() => {
        if (gainRef.current) {
            gainRef.current.gain.value = isMuted ? 0 : volume;
        }
    }, [volume, isMuted]);

    // Update time display during playback
    useEffect(() => {
        const updateTime = () => {
            if (playerRef.current && isPlaying) {
                const player = playerRef.current;
                if (player.state === "started") {
                    const elapsed = (Tone.now() - startTimeRef.current) * player.playbackRate;
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

        if (Tone.context.state !== "running") {
            await Tone.start();
        }

        if (isPlaying) {
            playerRef.current.stop();
            setIsPlaying(false);
        } else {
            const offset = currentTime;
            playerRef.current.start(undefined, offset);
            startTimeRef.current = Tone.now() - offset / playerRef.current.playbackRate;
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
                startTimeRef.current = Tone.now() - newTime / playerRef.current.playbackRate;
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
        startTimeRef.current = Tone.now();
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

    if (!src || !effectOptions) {
        return null;
    }

    return (
        <div className="w-full max-w-full bg-gradient-to-br from-primary/10 via-card to-secondary/10 border border-primary/30 rounded-xl p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-hidden box-border">
            {label && (
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <p className="text-xs uppercase tracking-wider text-primary font-semibold">
                        {label}
                    </p>
                </div>
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
                        className="h-10 w-10 sm:h-12 sm:w-12 rounded-full shrink-0 border-primary/50 hover:bg-primary/20"
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
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

                {effectOptions && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="px-2 py-1 rounded bg-muted/50">
                            {effectOptions.speed}x speed
                        </span>
                        {effectOptions.pitch !== 0 && (
                            <span className="px-2 py-1 rounded bg-muted/50">
                                {effectOptions.pitch > 0 ? "+" : ""}{effectOptions.pitch} pitch
                            </span>
                        )}
                        {effectOptions.reverb > 0 && (
                            <span className="px-2 py-1 rounded bg-muted/50">
                                {effectOptions.reverb}% reverb
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
