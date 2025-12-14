import { useState, useCallback, useEffect } from "react";
import {
	Zap,
	Clock,
	Disc3,
	Moon,
	Volume2,
	Headphones,
	Mic2,
	VolumeX,
	Sliders,
} from "lucide-react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";
import { cn } from "@/lib/utils";
import {
	EFFECT_PRESETS,
	type EffectPreset,
	type AudioProcessingOptions,
} from "../types";

interface EffectsPanelProps {
	onApply: (
		options: Omit<AudioProcessingOptions, "preset"> & { preset: EffectPreset },
	) => void;
	/** Called when effect options change for real-time preview */
	onPreviewChange?: (options: Omit<AudioProcessingOptions, "preset"> | null) => void;
	isProcessing: boolean;
	disabled: boolean;
}

const PRESETS: {
	id: Exclude<EffectPreset, "custom">;
	name: string;
	icon: React.ReactNode;
	description: string;
	color: string;
}[] = [
		{
			id: "nightcore",
			name: "Nightcore",
			icon: <Zap className="w-5 h-5" />,
			description: "Speed up + higher pitch",
			color: "from-pink-500 to-purple-500",
		},
		{
			id: "slowreverb",
			name: "Slow + Reverb",
			icon: <Clock className="w-5 h-5" />,
			description: "Slow down + echo",
			color: "from-blue-500 to-cyan-500",
		},
		{
			id: "vaporwave",
			name: "Vaporwave",
			icon: <Disc3 className="w-5 h-5" />,
			description: "Slow + lower pitch",
			color: "from-purple-500 to-pink-500",
		},
		{
			id: "daycore",
			name: "Daycore",
			icon: <Moon className="w-5 h-5" />,
			description: "Slightly slowed",
			color: "from-orange-400 to-yellow-400",
		},
		{
			id: "bassboost",
			name: "Bass Boost",
			icon: <Volume2 className="w-5 h-5" />,
			description: "Enhanced bass",
			color: "from-red-500 to-orange-500",
		},
		{
			id: "8d",
			name: "8D Audio",
			icon: <Headphones className="w-5 h-5" />,
			description: "Surround panning",
			color: "from-green-400 to-teal-500",
		},
		{
			id: "chipmunk",
			name: "Chipmunk",
			icon: <Mic2 className="w-5 h-5" />,
			description: "High pitched voice",
			color: "from-amber-400 to-orange-400",
		},
		{
			id: "deepvoice",
			name: "Deep Voice",
			icon: <VolumeX className="w-5 h-5" />,
			description: "Low pitched voice",
			color: "from-slate-500 to-slate-700",
		},
	];

export function EffectsPanel({
	onApply,
	onPreviewChange,
	isProcessing,
	disabled,
}: EffectsPanelProps) {
	const [selectedPreset, setSelectedPreset] = useState<Exclude<
		EffectPreset,
		"custom"
	> | null>(null);
	const [customSpeed, setCustomSpeed] = useState(1);
	const [customPitch, setCustomPitch] = useState(0);
	const [customReverb, setCustomReverb] = useState(0);
	const [customBass, setCustomBass] = useState(0);
	const [activeTab, setActiveTab] = useState("presets");

	// Emit preview changes when custom values change and custom tab is active
	useEffect(() => {
		if (activeTab === "custom") {
			onPreviewChange?.({
				speed: customSpeed,
				pitch: customPitch,
				reverb: customReverb,
				bassBoost: customBass,
			});
		}
	}, [activeTab, customSpeed, customPitch, customReverb, customBass, onPreviewChange]);

	const handlePresetSelect = useCallback(
		(presetId: Exclude<EffectPreset, "custom">) => {
			setSelectedPreset(presetId);
			// Notify parent for real-time preview
			onPreviewChange?.(EFFECT_PRESETS[presetId]);
		},
		[onPreviewChange],
	);

	const handleApplyPreset = useCallback(() => {
		if (!selectedPreset) return;
		onApply({
			preset: selectedPreset,
			...EFFECT_PRESETS[selectedPreset],
		});
	}, [selectedPreset, onApply]);

	const handleApplyCustom = useCallback(() => {
		onApply({
			preset: "custom",
			speed: customSpeed,
			pitch: customPitch,
			reverb: customReverb,
			bassBoost: customBass,
		});
	}, [customSpeed, customPitch, customReverb, customBass, onApply]);

	return (
		<div className="bg-card border border-border rounded-xl overflow-hidden">
			<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
				<TabsList className="w-full rounded-none border-b bg-muted/50 p-1 h-auto">
					<TabsTrigger
						value="presets"
						className="flex-1 data-[state=active]:bg-background rounded-lg py-2.5"
					>
						<Zap className="w-4 h-4 mr-2" />
						Presets
					</TabsTrigger>
					<TabsTrigger
						value="custom"
						className="flex-1 data-[state=active]:bg-background rounded-lg py-2.5"
					>
						<Sliders className="w-4 h-4 mr-2" />
						Custom
					</TabsTrigger>
				</TabsList>

				<TabsContent value="presets" className="p-4 space-y-4">
					<TooltipProvider>
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
							{PRESETS.map((preset) => (
								<Tooltip key={preset.id}>
									<TooltipTrigger asChild>
										<button
											onClick={() => handlePresetSelect(preset.id)}
											disabled={disabled}
											className={cn(
												"relative p-4 rounded-xl border-2 transition-all duration-200 text-left group",
												selectedPreset === preset.id
													? "border-primary bg-primary/10"
													: "border-transparent bg-muted/50 hover:bg-muted",
												disabled && "opacity-50 cursor-not-allowed",
											)}
										>
											<div
												className={cn(
													"w-10 h-10 rounded-lg flex items-center justify-center mb-3 bg-gradient-to-br text-white",
													preset.color,
												)}
											>
												{preset.icon}
											</div>
											<p className="font-medium text-sm">{preset.name}</p>
										</button>
									</TooltipTrigger>
									<TooltipContent>
										<p>{preset.description}</p>
									</TooltipContent>
								</Tooltip>
							))}
						</div>
					</TooltipProvider>

					<Button
						onClick={handleApplyPreset}
						disabled={!selectedPreset || isProcessing || disabled}
						className="w-full h-12 text-base font-semibold"
						size="lg"
					>
						{isProcessing ? "Processing..." : "Apply Effect"}
					</Button>
				</TabsContent>

				<TabsContent value="custom" className="p-4 space-y-6">
					<div className="space-y-4">
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<Label>Speed</Label>
								<span className="text-sm font-mono text-muted-foreground">
									{customSpeed.toFixed(2)}x
								</span>
							</div>
							<Slider
								value={[customSpeed]}
								onValueChange={(v) => setCustomSpeed(v[0] ?? customSpeed)}
								min={0.5}
								max={2}
								step={0.05}
								disabled={disabled}
							/>
						</div>

						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<Label>Pitch</Label>
								<span className="text-sm font-mono text-muted-foreground">
									{customPitch > 0 ? "+" : ""}
									{customPitch} semitones
								</span>
							</div>
							<Slider
								value={[customPitch]}
								onValueChange={(v) => setCustomPitch(v[0] ?? customPitch)}
								min={-12}
								max={12}
								step={1}
								disabled={disabled}
							/>
						</div>

						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<Label>Reverb</Label>
								<span className="text-sm font-mono text-muted-foreground">
									{customReverb}%
								</span>
							</div>
							<Slider
								value={[customReverb]}
								onValueChange={(v) => setCustomReverb(v[0] ?? customReverb)}
								min={0}
								max={100}
								step={5}
								disabled={disabled}
							/>
						</div>

						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<Label>Bass Boost</Label>
								<span className="text-sm font-mono text-muted-foreground">
									{customBass}%
								</span>
							</div>
							<Slider
								value={[customBass]}
								onValueChange={(v) => setCustomBass(v[0] ?? customBass)}
								min={0}
								max={100}
								step={5}
								disabled={disabled}
							/>
						</div>
					</div>

					<Button
						onClick={handleApplyCustom}
						disabled={isProcessing || disabled}
						className="w-full h-12 text-base font-semibold"
						size="lg"
					>
						{isProcessing ? "Processing..." : "Apply Custom Effect"}
					</Button>
				</TabsContent>
			</Tabs>
		</div>
	);
}
