import { Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * Spike controllers proving the proxy chain and the cookie round trip.
 * These exist ONLY in the spike harness — the real API grows its
 * controllers per ticket (auth in 03, tenancy in 06+).
 */

const PROXIED_HEADERS = [
  "host",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-forwarded-server",
  "x-real-ip",
  "origin",
  "referer",
  "connection",
  "via",
  "user-agent",
] as const;

function pickHeaders(headers: Record<string, unknown>): Record<string, string | string[] | undefined> {
  const result: Record<string, string | string[] | undefined> = {};
  for (const name of PROXIED_HEADERS) {
    const value = headers[name];
    if (value !== undefined) result[name] = value as string | string[];
  }
  return result;
}

interface PeerReport {
  seenBy: "nestjs";
  peer: {
    remoteAddress: string | undefined;
    remotePort: number | undefined;
    ip: string | undefined;
    trustProxy: unknown;
  };
  headers: Record<string, string | string[] | undefined>;
  httpVersion: string;
  mountedAt: string;
}

@Controller("whoami")
export class WhoamiController {
  // GET /v1/whoami — records exactly what NestJS sees behind the Next.js
  // rewrite (ticket 04's trusted-proxy tests assert against this chain).
  @Get()
  whoami(@Req() req: Request): PeerReport {
    return {
      seenBy: "nestjs",
      peer: {
        remoteAddress: req.socket?.remoteAddress,
        remotePort: req.socket?.remotePort,
        ip: req.ip,
        // Express's `trust proxy` setting — the spike leaves it unset
        // (falsy) so `req.ip` is the raw socket peer; ticket 04 decides
        // the production setting from the recorded chain.
        trustProxy: req.app.get("trust proxy") ?? null,
      },
      headers: pickHeaders(req.headers as Record<string, unknown>),
      httpVersion: req.httpVersion,
      mountedAt: new Date().toISOString(),
    };
  }
}

@Controller("cookie")
export class CookieController {
  /**
   * GET /v1/cookie/set — issues a first-party session-shaped cookie. In
   * the real product this response comes from Better Auth under /v1/auth.
   */
  @Get("set")
  set(@Res() res: Response): void {
    res.setHeader(
      "Set-Cookie",
      "myform_spike_cookie=round-trip-1; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
    );
    res.setHeader("Cache-Control", "no-store");
    res.type("application/json").send({ set: true });
  }

  @Get("echo")
  echo(@Req() req: Request, @Res() res: Response): void {
    res.setHeader("Cache-Control", "no-store");
    res.type("application/json").send({ received: req.headers.cookie ?? null });
  }
}

export const SPIKE_CONTROLLERS = [WhoamiController, CookieController];
