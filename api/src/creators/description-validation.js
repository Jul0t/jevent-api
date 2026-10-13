export const MAX_DESCRIPTION_LENGTH =
  20000;

const INLINE_LINK_PATTERN = new RegExp(
  "!?\\[[^\\]]*\\]\\s*\\([^)]*\\)",
  "i"
);

const REFERENCE_LINK_PATTERN = new RegExp(
  "!?\\[[^\\]]*\\]\\s*\\[[^\\]]*\\]",
  "i"
);

const REFERENCE_DEFINITION_PATTERN = new RegExp(
  "^\\s*\\[[^\\]]+\\]:\\s*\\S+",
  "im"
);

const AUTOLINK_PATTERN = new RegExp(
  "<\\s*(?:https?:\\/\\/|mailto:)[^>]+>",
  "i"
);

const RAW_HTML_PATTERN =
  new RegExp(
    "<\\s*\\/?\\s*[a-z][^>]*>",
    "i"
  );

const DANGEROUS_PROTOCOL_PATTERN =
  new RegExp(
    "(?:javascript|vbscript|data)\\s*:",
    "i"
  );

const EVENT_HANDLER_PATTERN =
  new RegExp(
    "\\bon[a-z]+\\s*=",
    "i"
  );

export function validateCreatorDescription(
  rawMarkdown
) {
  const markdown = String(
    rawMarkdown ?? ""
  )
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();

  const errors = Array.of();

  if (!markdown) {
    errors.push({
      code: "required",
      message:
        "La description ne peut pas être vide."
    });
  }

  if (
    markdown.length >
    MAX_DESCRIPTION_LENGTH
  ) {
    errors.push({
      code: "too_long",
      message:
        "La description ne peut pas dépasser " +
        `${MAX_DESCRIPTION_LENGTH} caractères.`
    });
  }

  if (
    INLINE_LINK_PATTERN.test(markdown) ||
    REFERENCE_LINK_PATTERN.test(markdown) ||
    REFERENCE_DEFINITION_PATTERN.test(
      markdown
    ) ||
    AUTOLINK_PATTERN.test(markdown)
  ) {
    errors.push({
      code: "links_forbidden",
      message:
        "Les liens Markdown ne sont pas encore autorisés."
    });
  }

  if (RAW_HTML_PATTERN.test(markdown)) {
    errors.push({
      code: "html_forbidden",
      message:
        "Le HTML brut est interdit."
    });
  }

  if (
    DANGEROUS_PROTOCOL_PATTERN.test(
      markdown
    ) ||
    EVENT_HANDLER_PATTERN.test(markdown)
  ) {
    errors.push({
      code: "executable_content",
      message:
        "Le contenu exécutable est interdit."
    });
  }

  return {
    valid: errors.length === 0,
    markdown: markdown.slice(
      0,
      MAX_DESCRIPTION_LENGTH
    ),
    errors
  };
}