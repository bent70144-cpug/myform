import { Controller, Get } from "@nestjs/common";
import { buildOpenApiDocument } from "@myform/contracts";

/**
 * `GET /v1/openapi.json` — the OpenAPI 3.1 document generated from the
 * shared Zod contracts (snapshot-tested in packages/contracts).
 */
@Controller("openapi.json")
export class OpenApiController {
  @Get()
  document(): Record<string, unknown> {
    return buildOpenApiDocument();
  }
}
