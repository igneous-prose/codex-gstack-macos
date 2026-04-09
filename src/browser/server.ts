import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";

import { DEFAULT_HOST, SUPPORTED_COOKIE_BROWSERS, type SupportedCookieBrowser } from "./config.js";

interface PageCommandPayload {
  readonly url: string;
  readonly outputPath: string;
  readonly allowLocalhost?: boolean;
}

interface CookieImportPayload {
  readonly browser: SupportedCookieBrowser;
  readonly domains: string[];
}

export interface BrowserServerHandlers {
  readonly screenshot: (payload: PageCommandPayload) => Promise<{ outputPath: string }>;
  readonly snapshot: (payload: PageCommandPayload) => Promise<{ outputPath: string }>;
  readonly listCookieDomains: (browser: SupportedCookieBrowser) => string[];
  readonly importCookies: (
    payload: CookieImportPayload
  ) => Promise<{ importedCount: number }>;
}

export interface BrowserServerOptions {
  readonly host?: string;
  readonly port: number;
  readonly token: string;
  readonly handlers: BrowserServerHandlers;
}

export interface DispatchRequest {
  readonly method: string;
  readonly path: string;
  readonly headers?: Record<string, string | undefined>;
  readonly body?: string;
}

export interface DispatchResponse {
  readonly statusCode: number;
  readonly body: unknown;
}

export const MAX_JSON_BODY_BYTES = 64 * 1024;

type ClassifiedRoute =
  | {
      readonly kind: "health";
      readonly requiresAuth: false;
      readonly requiresJsonBody: false;
    }
  | {
      readonly kind: "page-screenshot" | "page-snapshot" | "cookies-import";
      readonly requiresAuth: true;
      readonly requiresJsonBody: true;
    }
  | {
      readonly kind: "cookies-domains";
      readonly requiresAuth: true;
      readonly requiresJsonBody: false;
      readonly browser: string | null;
    }
  | {
      readonly kind: "not-found";
      readonly requiresAuth: false;
      readonly requiresJsonBody: false;
    };

class HttpBodyError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "HttpBodyError";
  }
}

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

type ValidatedRoute =
  | {
      readonly kind: "page-screenshot" | "page-snapshot";
      readonly payload: PageCommandPayload;
    }
  | {
      readonly kind: "cookies-domains";
      readonly browser: SupportedCookieBrowser;
    }
  | {
      readonly kind: "cookies-import";
      readonly payload: CookieImportPayload;
    };

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    connection: "close",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function classifyRoute(
  method: string,
  path: string,
  host: string,
  port: number
): ClassifiedRoute {
  const requestUrl = new URL(path, `http://${host}:${port}`);

  if (requestUrl.pathname === "/health" && method === "GET") {
    return {
      kind: "health",
      requiresAuth: false,
      requiresJsonBody: false
    };
  }

  if (requestUrl.pathname === "/page/screenshot" && method === "POST") {
    return {
      kind: "page-screenshot",
      requiresAuth: true,
      requiresJsonBody: true
    };
  }

  if (requestUrl.pathname === "/page/snapshot" && method === "POST") {
    return {
      kind: "page-snapshot",
      requiresAuth: true,
      requiresJsonBody: true
    };
  }

  if (requestUrl.pathname === "/cookies/domains" && method === "GET") {
    return {
      kind: "cookies-domains",
      requiresAuth: true,
      requiresJsonBody: false,
      browser: requestUrl.searchParams.get("browser")
    };
  }

  if (requestUrl.pathname === "/cookies/import" && method === "POST") {
    return {
      kind: "cookies-import",
      requiresAuth: true,
      requiresJsonBody: true
    };
  }

  return {
    kind: "not-found",
    requiresAuth: false,
    requiresJsonBody: false
  };
}

function parseJsonBody<T>(rawBody: string | undefined): T {
  try {
    return JSON.parse(rawBody ?? "{}") as T;
  } catch {
    throw new HttpBodyError(400, "Malformed JSON body.");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requirePlainObject(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new RequestValidationError("Request body must be a JSON object.");
  }
  return value;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RequestValidationError(`${fieldName} must be a non-empty string.`);
  }
  return value;
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new RequestValidationError(`${fieldName} must be a boolean.`);
  }
  return value;
}

function isSupportedCookieBrowser(value: unknown): value is SupportedCookieBrowser {
  return (
    typeof value === "string" &&
    SUPPORTED_COOKIE_BROWSERS.includes(value as SupportedCookieBrowser)
  );
}

function requireSupportedCookieBrowser(
  value: unknown,
  fieldName: string,
  missingMessage?: string
): SupportedCookieBrowser {
  if (value === null || value === undefined || value === "") {
    throw new RequestValidationError(missingMessage ?? `${fieldName} is required.`);
  }

  if (!isSupportedCookieBrowser(value)) {
    throw new RequestValidationError(
      `${fieldName} must be one of: ${SUPPORTED_COOKIE_BROWSERS.join(", ")}.`
    );
  }

  return value;
}

function validatePageCommandPayload(parsedBody: unknown): PageCommandPayload {
  const body = requirePlainObject(parsedBody);
  const url = requireNonEmptyString(body.url, "url");
  const outputPath = requireNonEmptyString(body.outputPath, "outputPath");
  const allowLocalhost =
    body.allowLocalhost === undefined
      ? false
      : requireBoolean(body.allowLocalhost, "allowLocalhost");

  return {
    url,
    outputPath,
    allowLocalhost
  };
}

function validateCookieImportPayload(parsedBody: unknown): CookieImportPayload {
  const body = requirePlainObject(parsedBody);
  const browser = requireSupportedCookieBrowser(body.browser, "browser");

  if (!Array.isArray(body.domains)) {
    throw new RequestValidationError("domains must be an array of strings.");
  }

  const normalizedDomains = [...new Set(
    body.domains.map((domain) => {
      if (typeof domain !== "string") {
        throw new RequestValidationError("domains must be an array of strings.");
      }
      return domain.trim();
    }).filter(Boolean)
  )];

  if (normalizedDomains.length === 0) {
    throw new RequestValidationError("domains must contain at least one non-empty string.");
  }

  return {
    browser,
    domains: normalizedDomains
  };
}

function validateAuthenticatedRoute(
  route: Exclude<ClassifiedRoute, { kind: "health" | "not-found" }>,
  parsedBody: unknown
): ValidatedRoute {
  if (route.kind === "page-screenshot" || route.kind === "page-snapshot") {
    return {
      kind: route.kind,
      payload: validatePageCommandPayload(parsedBody)
    };
  }

  if (route.kind === "cookies-domains") {
    return {
      kind: "cookies-domains",
      browser: requireSupportedCookieBrowser(
        route.browser,
        "browser",
        "browser query parameter is required."
      )
    };
  }

  return {
    kind: "cookies-import",
    payload: validateCookieImportPayload(parsedBody)
  };
}

async function readJsonWithLimit<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bufferChunk = Buffer.from(chunk);
    totalBytes += bufferChunk.byteLength;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw new HttpBodyError(413, `JSON body exceeds ${MAX_JSON_BODY_BYTES} bytes.`);
    }
    chunks.push(bufferChunk);
  }
  return parseJsonBody<T>(Buffer.concat(chunks).toString("utf8"));
}

async function dispatchAuthenticatedRoute(
  route: ValidatedRoute,
  handlers: BrowserServerHandlers
): Promise<DispatchResponse> {
  if (route.kind === "page-screenshot") {
    return {
      statusCode: 200,
      body: await handlers.screenshot(route.payload)
    };
  }

  if (route.kind === "page-snapshot") {
    return {
      statusCode: 200,
      body: await handlers.snapshot(route.payload)
    };
  }

  if (route.kind === "cookies-domains") {
    return {
      statusCode: 200,
      body: { domains: handlers.listCookieDomains(route.browser) }
    };
  }

  if (route.kind === "cookies-import") {
    return {
      statusCode: 200,
      body: await handlers.importCookies(route.payload)
    };
  }

  return {
    statusCode: 500,
    body: { error: "Unknown authenticated route." }
  };
}

function authError(
  headers: Record<string, string | undefined> | undefined,
  token: string
): DispatchResponse | null {
  const headerValue = headers?.authorization;

  if (!headerValue) {
    return { statusCode: 401, body: { error: "Missing Authorization header." } };
  }

  if (headerValue !== `Bearer ${token}`) {
    return { statusCode: 403, body: { error: "Invalid auth token." } };
  }

  return null;
}

export async function dispatchBrowserRequest(
  request: DispatchRequest,
  options: BrowserServerOptions
): Promise<DispatchResponse> {
  try {
    const host = options.host ?? DEFAULT_HOST;
    const route = classifyRoute(request.method, request.path, host, options.port);

    if (route.kind === "health") {
      return { statusCode: 200, body: { ok: true, host } };
    }

    if (route.kind === "not-found") {
      return { statusCode: 404, body: { error: "Not found." } };
    }

    const authFailure = authError(request.headers, options.token);
    if (authFailure) {
      return authFailure;
    }

    const parsedBody = route.requiresJsonBody ? parseJsonBody(request.body) : undefined;
    const validatedRoute = validateAuthenticatedRoute(route, parsedBody);
    return await dispatchAuthenticatedRoute(validatedRoute, options.handlers);
  } catch (error) {
    if (error instanceof HttpBodyError) {
      return { statusCode: error.statusCode, body: { error: error.message } };
    }
    if (error instanceof RequestValidationError) {
      return { statusCode: 400, body: { error: error.message } };
    }
    return { statusCode: 500, body: { error: "Internal server error." } };
  }
}

export async function startBrowserServer(options: BrowserServerOptions): Promise<{
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  readonly close: () => Promise<void>;
}> {
  const host = options.host ?? DEFAULT_HOST;
  const sockets = new Set<Socket>();

  const server = createServer(async (request, response) => {
    try {
      const method = request.method?.toUpperCase() ?? "GET";
      const path = request.url ?? "/";
      const route = classifyRoute(method, path, host, options.port);

      if (route.kind === "health") {
        writeJson(response, 200, { ok: true, host });
        return;
      }

      if (route.kind === "not-found") {
        writeJson(response, 404, { error: "Not found." });
        return;
      }

      const authFailure = authError(
        {
          authorization: request.headers.authorization
        },
        options.token
      );
      if (authFailure) {
        writeJson(response, authFailure.statusCode, authFailure.body);
        return;
      }

      const parsedBody = route.requiresJsonBody
        ? await readJsonWithLimit<unknown>(request)
        : undefined;
      const validatedRoute = validateAuthenticatedRoute(route, parsedBody);
      const dispatchResponse = await dispatchAuthenticatedRoute(validatedRoute, options.handlers);
      writeJson(response, dispatchResponse.statusCode, dispatchResponse.body);
    } catch (error) {
      if (error instanceof HttpBodyError) {
        writeJson(response, error.statusCode, { error: error.message });
        return;
      }
      if (error instanceof RequestValidationError) {
        writeJson(response, 400, { error: error.message });
        return;
      }
      writeJson(response, 500, { error: "Internal server error." });
    }
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port, host, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to obtain daemon bind address.");
  }

  return {
    server,
    host,
    port: address.port,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });

        server.closeIdleConnections?.();
        server.closeAllConnections?.();
        for (const socket of sockets) {
          socket.destroy();
        }
      })
  };
}
