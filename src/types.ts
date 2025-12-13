/**
 * Shared types for AudioHeaven
 */

/** Audio effect preset names */
export type EffectPreset =
    | "nightcore"
    | "slowreverb"
    | "vaporwave"
    | "daycore"
    | "bassboost"
    | "8d"
    | "chipmunk"
    | "deepvoice"
    | "custom";

/** Audio processing options */
export interface AudioProcessingOptions {
    preset: EffectPreset;
    /** Speed multiplier (0.5 - 2.0) */
    speed: number;
    /** Pitch shift in semitones (-12 to +12) */
    pitch: number;
    /** Reverb intensity (0 - 100) */
    reverb: number;
    /** Bass boost intensity (0 - 100) */
    bassBoost: number;
    /** 8D audio panning speed */
    panSpeed?: number;
}

/** Preset configurations */
export const EFFECT_PRESETS: Record<Exclude<EffectPreset, "custom">, Omit<AudioProcessingOptions, "preset">> = {
    nightcore: { speed: 1.25, pitch: 4, reverb: 0, bassBoost: 0 },
    slowreverb: { speed: 0.85, pitch: 0, reverb: 70, bassBoost: 0 },
    vaporwave: { speed: 0.8, pitch: -3, reverb: 40, bassBoost: 0 },
    daycore: { speed: 0.9, pitch: -2, reverb: 0, bassBoost: 0 },
    bassboost: { speed: 1, pitch: 0, reverb: 0, bassBoost: 80 },
    "8d": { speed: 1, pitch: 0, reverb: 30, bassBoost: 0, panSpeed: 0.5 },
    chipmunk: { speed: 1, pitch: 8, reverb: 0, bassBoost: 0 },
    deepvoice: { speed: 1, pitch: -6, reverb: 0, bassBoost: 20 },
};

/** Upload response from server */
export interface UploadResponse {
    success: true;
    data: {
        fileId: string;
        fileName: string;
    };
}

/** Processing response from server */
export interface ProcessingResponse {
    success: true;
    data: {
        downloadId: string;
        fileName: string;
    };
}

/** API error response */
export interface ApiError {
    success: false;
    error: {
        message: string;
        code?: string;
    };
}
