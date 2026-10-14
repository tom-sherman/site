import * as stylex from "@stylexjs/stylex";
import { fonts } from "@/lib/components/tokens.stylex";

const styles = stylex.create({
  // Sized down to sit with the serif it's set in.
  code: {
    fontFamily: fonts.mono,
    fontSize: "0.72em",
    letterSpacing: "-0.02em",
  },
});

/** A post's title, with its Markdown-style `code` spans set in mono. */
export function Title({ text }: { text: string }) {
  // Odd parts are what was between backticks.
  return text.split(/`([^`]+)`/).map((part, i) =>
    i % 2 ? (
      <code key={i} {...stylex.props(styles.code)}>
        {part}
      </code>
    ) : (
      part
    ),
  );
}
