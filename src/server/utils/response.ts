/**
 * Response utilities for clean API responses
 */

export interface JsonResponseOptions {
    status?: number;
    headers?: Record<string, string>;
}

export interface ErrorResponseOptions {
    status?: number;
    code?: string;
    details?: unknown;
}

/**
 * Create a JSON response with optional status and headers
 */
export function json<T>(data: T, options: JsonResponseOptions = {}): Response {
    const { status = 200, headers = {} } = options;

    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
    });
}

/**
 * Create a success JSON response
 */
export function success<T>(data: T, message?: string): Response {
    return json({
        success: true,
        data,
        ...(message && { message }),
    });
}

/**
 * Create an error response
 */
export function error(
    message: string,
    options: ErrorResponseOptions = {}
): Response {
    const { status = 400, code, details } = options;

    const errorBody: {
        success: false;
        error: {
            message: string;
            code?: string;
            details?: unknown;
        };
    } = {
        success: false,
        error: {
            message,
        },
    };

    if (code) {
        errorBody.error.code = code;
    }
    if (details !== undefined) {
        errorBody.error.details = details;
    }

    return json(errorBody, { status });
}

/**
 * Create a 404 Not Found response
 */
export function notFound(message = "Resource not found"): Response {
    return error(message, { status: 404, code: "NOT_FOUND" });
}

/**
 * Create a 401 Unauthorized response
 */
export function unauthorized(message = "Unauthorized"): Response {
    return error(message, { status: 401, code: "UNAUTHORIZED" });
}

/**
 * Create a 403 Forbidden response
 */
export function forbidden(message = "Forbidden"): Response {
    return error(message, { status: 403, code: "FORBIDDEN" });
}

/**
 * Create a 500 Internal Server Error response
 */
export function serverError(message = "Internal server error"): Response {
    return error(message, { status: 500, code: "INTERNAL_ERROR" });
}

/**
 * Create a 400 Bad Request response
 */
export function badRequest(message = "Bad request", details?: unknown): Response {
    return error(message, { status: 400, code: "BAD_REQUEST", details });
}

/**
 * Create a redirect response
 */
export function redirect(
    url: string,
    status: 301 | 302 | 303 | 307 | 308 = 302
): Response {
    return new Response(null, {
        status,
        headers: {
            Location: url,
        },
    });
}

/**
 * Create a permanent redirect (301)
 */
export function permanentRedirect(url: string): Response {
    return redirect(url, 301);
}

/**
 * Create a temporary redirect (302)
 */
export function temporaryRedirect(url: string): Response {
    return redirect(url, 302);
}
