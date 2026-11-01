import { en, type MessageCatalog, type MessageKey } from "./catalog/en";

export { en };
export type { MessageCatalog, MessageKey };

const CATALOGS: Record<string, MessageCatalog> = { en };

export type Locale = keyof typeof CATALOGS;

export class MissingMessageError extends Error {
  constructor(readonly key: string, readonly locale: string) {
    super(`missing message for key "${key}" in locale "${locale}"`);
    this.name = "MissingMessageError";
  }
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Translate `key` in `locale` (default `en`). Keys are typed at compile
 * time; unknown keys fail the build. A missing catalog entry at runtime
 * throws rather than rendering a raw key to users.
 */
export function t(
  key: MessageKey,
  params?: Record<string, string | number>,
  locale: Locale = "en",
): string {
  const catalog = CATALOGS[locale];
  if (!catalog) throw new MissingMessageError(key, locale);
  const template = catalog[key];
  if (template === undefined) throw new MissingMessageError(key, locale);
  return interpolate(template, params);
}

/** Create a translator bound to a locale (and optionally extra params). */
export function createTranslator(
  options: { locale?: Locale } = {},
): (key: MessageKey, params?: Record<string, string | number>) => string {
  return (key, params) => t(key, params, options.locale ?? "en");
}
