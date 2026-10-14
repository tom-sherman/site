import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, fonts } from "@/lib/components/tokens.stylex";

/**
 * The elements a post's body is made of, whichever format it's in. Blocks
 * are spaced by their container's `rowGap` rather than their own margins, so
 * headings only add the extra space they need above them.
 */
const styles = stylex.create({
  body: {
    display: "flex",
    flexDirection: "column",
    rowGap: "1.15em",
    fontSize: 18,
    lineHeight: 1.65,
    color: colors.body,
    overflowWrap: "break-word",
  },
  heading: {
    marginTop: "0.9em",
    fontFamily: fonts.serif,
    fontWeight: 400,
    lineHeight: 1.1,
    color: colors.ink,
    textWrap: "balance",
    scrollMarginTop: 24,
  },
  h2: {
    fontSize: "clamp(28px, 4vw, 36px)",
  },
  h3: {
    fontSize: "clamp(23px, 3vw, 27px)",
  },
  h4: {
    marginTop: "0.6em",
    fontFamily: fonts.sans,
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 1.4,
  },
  link: {
    color: {
      default: colors.ink,
      ":hover": colors.ink,
    },
    textDecorationLine: "underline",
    textDecorationThickness: 1,
    textDecorationColor: {
      default: colors.underline,
      ":hover": "currentColor",
    },
    textUnderlineOffset: 3,
  },
  strong: {
    fontWeight: 600,
    color: colors.ink,
  },
  mark: {
    backgroundColor: colors.highlight,
    color: colors.ink,
  },
  inlineCode: {
    paddingBlock: "0.1em",
    paddingInline: "0.3em",
    borderRadius: 3,
    backgroundColor: colors.hoverTint,
    fontFamily: fonts.mono,
    fontSize: "0.8em",
    color: colors.ink,
  },
  blockquote: {
    display: "flex",
    flexDirection: "column",
    rowGap: "1em",
    paddingLeft: 20,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: colors.ink,
    color: colors.subtle,
  },
  list: {
    paddingLeft: "1.3em",
  },
  listItem: {
    marginTop: "0.35em",
    paddingLeft: "0.2em",
  },
  hr: {
    width: "100%",
    height: 1,
    marginBlock: "1em",
    borderStyle: "none",
    backgroundColor: colors.rule,
  },
  image: {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.rule,
  },
});

export function Body({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.body)}>{children}</div>;
}

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

/** Levels start at 2: the post's title is the page's only `h1`. */
export function Heading({
  level,
  id,
  children,
}: {
  level: 2 | 3 | 4;
  id?: string;
  children: ReactNode;
}) {
  const Element = `h${level}` as const;
  return (
    <Element id={id} {...stylex.props(styles.heading, styles[Element])}>
      {children}
    </Element>
  );
}

/**
 * Only http(s), mailto, same-page and same-site links: post content is
 * untrusted, so no `javascript:`.
 */
export function safeHref(href: unknown): string | undefined {
  if (typeof href !== "string") return undefined;
  if (/^(#|\/(?!\/))/.test(href)) return href;
  if (!URL.canParse(href)) return undefined;
  const { protocol } = new URL(href);
  return ["https:", "http:", "mailto:"].includes(protocol) ? href : undefined;
}

export function A({ href, children }: { href: unknown; children: ReactNode }) {
  const safe = safeHref(href);
  if (!safe) return children;
  return (
    <a href={safe} {...stylex.props(styles.link)}>
      {children}
    </a>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong {...stylex.props(styles.strong)}>{children}</strong>;
}

export function Mark({ children }: { children: ReactNode }) {
  return <mark {...stylex.props(styles.mark)}>{children}</mark>;
}

export function InlineCode({ children }: { children: ReactNode }) {
  return <code {...stylex.props(styles.inlineCode)}>{children}</code>;
}

export function Blockquote({ children }: { children: ReactNode }) {
  return (
    <blockquote {...stylex.props(styles.blockquote)}>{children}</blockquote>
  );
}

export function List({
  ordered,
  start,
  children,
}: {
  ordered?: boolean;
  start?: number;
  children: ReactNode;
}) {
  return ordered ? (
    <ol start={start} {...stylex.props(styles.list)}>
      {children}
    </ol>
  ) : (
    <ul {...stylex.props(styles.list)}>{children}</ul>
  );
}

export function ListItem({ children }: { children: ReactNode }) {
  return <li {...stylex.props(styles.listItem)}>{children}</li>;
}

export function Hr() {
  return <hr {...stylex.props(styles.hr)} />;
}

/** A content image, from wherever the post points (not `next/image`'s allow-list). */
export function Img({
  src,
  alt,
  width,
  height,
}: {
  src: unknown;
  alt?: string;
  width?: number;
  height?: number;
}) {
  const url = safeHref(src);
  if (!url) return null;
  return (
    // oxlint-disable-next-line nextjs/no-img-element
    <img
      src={url}
      alt={alt ?? ""}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      {...stylex.props(styles.image)}
    />
  );
}

/**
 * `Héllo, World!` → `hello-world`, for heading ids. Accents are folded and
 * anything else non-ASCII dropped. (Unicode property escapes would be nicer,
 * but StyleX's Babel pass can't parse them.)
 */
export function slugify(text: string) {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

/** Unique heading ids within one post: repeats get `-1`, `-2`… */
export function headingIds() {
  const seen = new Set<string>();
  return (text: string) => {
    const base = slugify(text) || "section";
    let id = base;
    for (let i = 1; seen.has(id); i++) id = `${base}-${i}`;
    seen.add(id);
    return id;
  };
}
