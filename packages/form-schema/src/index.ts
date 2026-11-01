export { SCHEMA_ERROR_CODES, LIMITS, BLOCK_ID_PATTERN } from "./form-schema";
export type { SchemaErrorCode, SchemaIssue, ParseResult } from "./form-schema";
export {
  welcomeBlockSchema,
  shortTextBlockSchema,
  longTextBlockSchema,
  endingBlockSchema,
  blockSchema,
  formSchemaSchema,
  formSettingsSchema,
  themeSchema,
  logicRuleSchema,
  emptyDraft,
  defaultTheme,
  defaultSettings,
  parseFormSchema,
  isQuestionBlock,
  containsNul,
  byteSize,
  isWithinDraftCap,
  isWithinSubmissionCap,
} from "./form-schema";
export type { Block, QuestionBlock, FormSchema, FormSettings, Theme, LogicRule } from "./form-schema";
export { validateForPublish } from "./publish";

export { migrateSchema } from "./migrate";
