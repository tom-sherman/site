import "server-only";
import * as stylex from "@stylexjs/stylex";
import { type BundledLanguage, bundledLanguages, codeToTokens } from "shiki";
import { cacheLife } from "next/cache";
import { colors, fonts } from "@/lib/components/tokens.stylex";

/** Shiki's `FontStyle` flags. It's a `const enum` that isn't exported, and `-1` means unset. */
const ITALIC = 1;
const BOLD = 2;
const has = (fontStyle: number | undefined, flag: number) =>
  fontStyle !== undefined && fontStyle > 0 && (fontStyle & flag) !== 0;

const styles = stylex.create({
  pre: {
    paddingBlock: 16,
    paddingInline: 18,
    overflowX: "auto",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.cardBorder,
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 1.65,
    color: colors.ink,
    tabSize: 2,
  },
});

/**
 * Highlighted on the server, so no highlighter ships to the browser. Shiki's
 * colours are kept but its frame isn't: the block sits on the page's surface.
 * Languages Shiki doesn't know are shown plain.
 */
export async function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const { lang, lines } = await highlight(code, language);
  return (
    <pre data-language={lang} {...stylex.props(styles.pre)}>
      <code>
        {lines.map((line, i) => (
          <span key={i}>
            {i > 0 && "\n"}
            {line.map((token, j) => (
              <span
                key={j}
                // Per-token colours come from the theme at render time.
                style={token.style}
              >
                {token.content}
              </span>
            ))}
          </span>
        ))}
      </code>
    </pre>
  );
}

/**
 * Shiki's tokens as plain, cacheable data. Cached because the same code always
 * highlights the same way, and because the tokenizer reads the clock to time
 * itself, which can't happen while a page is being prerendered.
 */
async function highlight(code: string, language: string | undefined) {
  "use cache";
  cacheLife("max");

  const lang =
    language && Object.hasOwn(bundledLanguages, language)
      ? (language as BundledLanguage)
      : "text";
  const { tokens } = await codeToTokens(code.replace(/\n$/, ""), {
    lang,
    theme: "github-light",
  });
  return {
    lang,
    lines: tokens.map((line) =>
      line.map(({ content, color, fontStyle }) => ({
        content,
        style: {
          color,
          fontStyle: has(fontStyle, ITALIC) ? "italic" : undefined,
          fontWeight: has(fontStyle, BOLD) ? 600 : undefined,
        },
      })),
    ),
  };
}
