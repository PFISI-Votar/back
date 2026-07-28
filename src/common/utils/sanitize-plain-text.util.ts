import sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS = { allowedTags: [] as string[], allowedAttributes: {} };

export const sanitizePlainText = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return sanitizeHtml(value, SANITIZE_OPTIONS);
};

export const sanitizeOptionalPlainText = (
  value: unknown,
): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value.length === 0) {
    return value;
  }
  return sanitizeHtml(value, SANITIZE_OPTIONS);
};
