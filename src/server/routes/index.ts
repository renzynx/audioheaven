import { audioRoutes } from "./audio";

const isProd = process.env.NODE_ENV === "production";

let indexRoute: Record<string, unknown> = {};

if (!isProd) {
	const index = await import("../../index.html");
	indexRoute = {
		"/*": index.default,
	};
}

export { indexRoute };

export const apiRoutes = {
	...audioRoutes,
	...indexRoute,
} as const;

export { audioRoutes };
