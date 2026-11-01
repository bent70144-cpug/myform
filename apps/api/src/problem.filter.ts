import { type ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";
import {
  isProblemDetails,
  problem,
  PROBLEM_CONTENT_TYPE,
  type ProblemCode,
  type ProblemDetails,
} from "@myform/contracts";
import { t } from "@myform/i18n";
import type { Logger } from "@myform/logger";
import type { Response, Request } from "express";
import { ProblemException } from "./problem-exception";

/** Map HTTP statuses that have no dedicated code to their stable code. */
const STATUS_TO_CODE: Record<number, ProblemCode> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  422: "validation_failed",
  429: "rate_limited",
};

/**
 * RFC 9457 Problem Details filter (spec: "API conventions"). Every error
 * response leaves the API as a stable problem body — no stack traces, no
 * internal identifiers, human-readable detail from the i18n catalog.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(private readonly logger?: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    if (res.headersSent) return;

    let body: ProblemDetails;
    let status: number;
    if (exception instanceof ProblemException) {
      body = exception.problemDetails;
      status = body.status;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (isProblemDetails(payload)) {
        body = payload;
      } else {
        const code = STATUS_TO_CODE[status] ?? "internal_error";
        body = problem(code, { detail: t(`error.${code}`) });
        status = body.status;
      }
    } else {
      // Unexpected: log server-side, return the stable internal_error body.
      const message = exception instanceof Error ? exception.message : String(exception);
      this.logger?.error("unhandled exception", { path: req.url, method: req.method, error: message });
      body = problem("internal_error", { detail: t("error.internal_error") });
      status = body.status;
    }

    res.status(status).type(PROBLEM_CONTENT_TYPE).header("Cache-Control", "no-store").json(body);
  }
}
