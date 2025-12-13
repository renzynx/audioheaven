/**
 * Processing Status Component
 * Shows processing progress and completion state
 */

import { CheckCircle, Loader2, AlertCircle, Download } from "lucide-react";
import { Progress } from "./ui/progress";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export type ProcessingState = "idle" | "processing" | "complete" | "error";

interface ProcessingStatusProps {
    state: ProcessingState;
    progress?: number;
    errorMessage?: string;
    fileName?: string;
    onDownload?: () => void;
}

export function ProcessingStatus({
    state,
    progress = 0,
    errorMessage,
    fileName,
    onDownload,
}: ProcessingStatusProps) {
    if (state === "idle") return null;

    return (
        <div
            className={cn(
                "border rounded-xl p-4 transition-colors",
                state === "complete" && "bg-green-500/10 border-green-500/30",
                state === "error" && "bg-destructive/10 border-destructive/30",
                state === "processing" && "bg-primary/10 border-primary/30"
            )}
        >
            <div className="flex items-center gap-4">
                <div
                    className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                        state === "complete" && "bg-green-500/20 text-green-500",
                        state === "error" && "bg-destructive/20 text-destructive",
                        state === "processing" && "bg-primary/20 text-primary"
                    )}
                >
                    {state === "processing" && (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    )}
                    {state === "complete" && <CheckCircle className="w-5 h-5" />}
                    {state === "error" && <AlertCircle className="w-5 h-5" />}
                </div>

                <div className="flex-1 min-w-0">
                    <p className="font-medium">
                        {state === "processing" && "Processing your audio..."}
                        {state === "complete" && "Processing complete!"}
                        {state === "error" && "Processing failed"}
                    </p>
                    {state === "processing" && (
                        <p className="text-sm text-muted-foreground mt-1">
                            Applying effects, this may take a moment...
                        </p>
                    )}
                    {state === "complete" && fileName && (
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                            {fileName}
                        </p>
                    )}
                    {state === "error" && errorMessage && (
                        <p className="text-sm text-destructive mt-1">{errorMessage}</p>
                    )}
                </div>

                {state === "complete" && onDownload && (
                    <Button onClick={onDownload} className="shrink-0">
                        <Download className="w-4 h-4 mr-2" />
                        Download
                    </Button>
                )}
            </div>

            {state === "processing" && (
                <Progress value={progress} className="mt-4 h-2" />
            )}
        </div>
    );
}
