import { describe, expect, it, vi } from "vitest";

import { dispatchBrowserRequest } from "../src/browser/server.js";

describe("browser server auth", () => {
  function createHandlers() {
    return {
      screenshot: vi.fn(async () => ({ outputPath: "/tmp/out.png" })),
      snapshot: vi.fn(async () => ({ outputPath: "/tmp/out.html" })),
      listCookieDomains: vi.fn(() => ["example.com"]),
      importCookies: vi.fn(async () => ({ importedCount: 1 }))
    };
  }

  it("allows unauthenticated health checks and rejects missing auth on command routes", async () => {
    const handlers = createHandlers();

    const healthResponse = await dispatchBrowserRequest(
      {
        method: "GET",
        path: "/health"
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );
    expect(healthResponse.statusCode).toBe(200);

    const screenshotResponse = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/page/screenshot",
        body: "{"
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );
    expect(screenshotResponse.statusCode).toBe(401);
    expect(handlers.screenshot).not.toHaveBeenCalled();
  });

  it("rejects invalid auth tokens", async () => {
    const response = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/page/screenshot",
        body: "{",
        headers: { authorization: "Bearer wrong-token" }
      },
      {
        port: 0,
        token: "secret-token",
        handlers: createHandlers()
      }
    );
    expect(response.statusCode).toBe(403);
  });

  it("returns not found before auth or JSON parsing for unknown routes", async () => {
    const response = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/unknown",
        body: "{"
      },
      {
        port: 0,
        token: "secret-token",
        handlers: createHandlers()
      }
    );

    expect(response).toEqual({
      statusCode: 404,
      body: { error: "Not found." }
    });
  });

  it("returns 400 for invalid page payload shapes", async () => {
    const handlers = createHandlers();

    const missingOutputPath = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/page/screenshot",
        headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify({ url: "https://example.com" })
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );

    expect(missingOutputPath).toEqual({
      statusCode: 400,
      body: { error: "outputPath must be a non-empty string." }
    });
    expect(handlers.screenshot).not.toHaveBeenCalled();

    const arrayBody = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/page/screenshot",
        headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify(["https://example.com", "/tmp/out.png"])
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );

    expect(arrayBody).toEqual({
      statusCode: 400,
      body: { error: "Request body must be a JSON object." }
    });
  });

  it("returns 400 for non-boolean allowLocalhost values", async () => {
    const handlers = createHandlers();

    const stringFlag = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/page/screenshot",
        headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify({
          url: "https://example.com",
          outputPath: "/tmp/out.png",
          allowLocalhost: "true"
        })
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );

    expect(stringFlag).toEqual({
      statusCode: 400,
      body: { error: "allowLocalhost must be a boolean." }
    });

    const numberFlag = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/page/snapshot",
        headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify({
          url: "https://example.com",
          outputPath: "/tmp/out.html",
          allowLocalhost: 1
        })
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );

    expect(numberFlag).toEqual({
      statusCode: 400,
      body: { error: "allowLocalhost must be a boolean." }
    });
  });

  it("returns 400 for missing or unsupported cookie browser queries", async () => {
    const handlers = createHandlers();

    const missingBrowser = await dispatchBrowserRequest(
      {
        method: "GET",
        path: "/cookies/domains",
        headers: { authorization: "Bearer secret-token" }
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );

    expect(missingBrowser).toEqual({
      statusCode: 400,
      body: { error: "browser query parameter is required." }
    });

    const unsupportedBrowser = await dispatchBrowserRequest(
      {
        method: "GET",
        path: "/cookies/domains?browser=safari",
        headers: { authorization: "Bearer secret-token" }
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );

    expect(unsupportedBrowser).toEqual({
      statusCode: 400,
      body: { error: "browser must be one of: brave, chrome, chromium, edge." }
    });
    expect(handlers.listCookieDomains).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid cookie import payloads", async () => {
    const handlers = createHandlers();

    const invalidDomains = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/cookies/import",
        headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify({
          browser: "chrome",
          domains: "example.com"
        })
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );

    expect(invalidDomains).toEqual({
      statusCode: 400,
      body: { error: "domains must be an array of strings." }
    });

    const emptyDomains = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/cookies/import",
        headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify({
          browser: "chrome",
          domains: [" ", ""]
        })
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );

    expect(emptyDomains).toEqual({
      statusCode: 400,
      body: { error: "domains must contain at least one non-empty string." }
    });
    expect(handlers.importCookies).not.toHaveBeenCalled();
  });

  it("normalizes duplicate and blank cookie domains before dispatch", async () => {
    const handlers = createHandlers();

    const response = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/cookies/import",
        headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify({
          browser: "chrome",
          domains: [" example.com ", "", "example.com", "foo.com", " foo.com "]
        })
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );

    expect(response.statusCode).toBe(200);
    expect(handlers.importCookies).toHaveBeenCalledWith({
      browser: "chrome",
      domains: ["example.com", "foo.com"]
    });
  });

  it("sanitizes unexpected handler failures to a generic 500 response", async () => {
    const response = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/page/screenshot",
        headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify({
          url: "https://example.com",
          outputPath: "/tmp/out.png",
          allowLocalhost: false
        })
      },
      {
        port: 0,
        token: "secret-token",
        handlers: {
          screenshot: async () => {
            throw new Error("sensitive runtime failure");
          },
          snapshot: async () => ({ outputPath: "/tmp/out.html" }),
          listCookieDomains: () => ["example.com"],
          importCookies: async () => ({ importedCount: 1 })
        }
      }
    );

    expect(response).toEqual({
      statusCode: 500,
      body: { error: "Internal server error." }
    });
  });
});
