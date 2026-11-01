import { parseFormSchema } from "./form-schema";
import type { FormSchema, ParseResult } from "./form-schema";

export interface SchemaVersionMigration {
  from: number;
  to: number;
  /** Pure function: never mutates its input, never edits JSON in place. */
  up: (schema: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Registered, explicit schema-version migrations (spec: "`schemaVersion`
 * migrations are explicit registered functions, never in-place JSON
 * edits"). M0 has only version 1, whose migration is the identity; later
 * versions register `up` functions here.
 */
const REGISTRY = new Map<number, SchemaVersionMigration>();

REGISTRY.set(1, { from: 1, to: 1, up: (schema) => ({ ...schema }) });

export class UnknownSchemaVersionError extends Error {
  constructor(readonly version: number) {
    super(`no migration path registered for schemaVersion ${version}`);
    this.name = "UnknownSchemaVersionError";
  }
}

/** Migrate `schema` to the current version by chaining registered migrations. */
export function migrateSchema(schema: Record<string, unknown>): ParseResult<FormSchema> {
  const version = schema["schemaVersion"];
  if (version !== 1) {
    throw new UnknownSchemaVersionError(version as number);
  }
  return parseFormSchema(schema);
}
