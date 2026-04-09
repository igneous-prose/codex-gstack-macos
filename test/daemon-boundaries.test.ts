import { describe, expect, it, vi } from "vitest";

import { DEFAULT_HOST } from "../src/browser/config.js";
import { dispatchBrowserRequest } from "../src/browser/server.js";

describe("daemon boundaries", () => {
  it("pins the daemon host to localhost", () => {
    expect(DEFAULT_HOST).toBe("127.0.0.1");
  });

  it("does not import cookies during normal page commands", async () => {
    const handlers = {
      screenshot: vi.fn(async () => ({ outputPath: "/tmp/out.png" })),
      snapshot: vi.fn(async () => ({ outputPath: "/tmp/out.html" })),
      listCookieDomains: vi.fn(() => ["example.com"]),
      importCookies: vi.fn(async () => ({ importedCount: 1 }))
    };

    const response = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/page/screenshot",
        headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify({ url: "https://example.com", outputPath: "/tmp/out.png", allowLocalhost: false })
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );

    expect(response.statusCode).toBe(200);
    expect(handlers.screenshot).toHaveBeenCalledOnce();
    expect(handlers.importCookies).not.toHaveBeenCalled();
  });

  it("passes allowLocalhost through the daemon page command payload", async () => {
    const handlers = {
      screenshot: vi.fn(async (payload: { url: string; outputPath: string; allowLocalhost?: boolean }) => ({
        outputPath: payload.allowLocalhost ? "/tmp/local-ok.png" : "/tmp/local-no.png"
      })),
      snapshot: vi.fn(async () => ({ outputPath: "/tmp/out.html" })),
      listCookieDomains: vi.fn(() => ["example.com"]),
      importCookies: vi.fn(async () => ({ importedCount: 1 }))
    };

    const response = await dispatchBrowserRequest(
      {
        method: "POST",
        path: "/page/screenshot",
        headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify({
          url: "http://localhost:3000",
          outputPath: "/tmp/out.png",
          allowLocalhost: true
        })
      },
      {
        port: 0,
        token: "secret-token",
        handlers
      }
    );

    expect(response.statusCode).toBe(200);
    expect(handlers.screenshot).toHaveBeenCalledWith({
      url: "http://localhost:3000",
      outputPath: "/tmp/out.png",
      allowLocalhost: true
    });
  });
});
