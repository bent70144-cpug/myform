import { HttpException } from "@nestjs/common";
import { problem, type FieldError, type ProblemCode, type ProblemDetails } from "@myform/contracts";

/**
 * Throw this from controllers/services to produce a stable RFC 9457
 * Problem Details body. Unknown exceptions are converted to
 * `internal_error` by the filter — always throw a coded problem instead.
 */
export class ProblemException extends HttpException {
  readonly problemDetails: ProblemDetails;

  constructor(code: ProblemCode, options: { detail?: string; errors?: FieldError[]; status?: number } = {}) {
    const body = problem(code, options);
    super(body, body.status);
    this.problemDetails = body;
  }
}
