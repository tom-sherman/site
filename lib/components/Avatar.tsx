import * as stylex from "@stylexjs/stylex";
import type { ImageRef } from "@/lib/data/types";
import { colors, fonts } from "./tokens.stylex";

const styles = stylex.create({
  avatar: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: "50%",
    color: colors.ink,
    fontFamily: fonts.mono,
    letterSpacing: 0,
    lineHeight: 1,
  },
  accent: {
    backgroundColor: colors.accent,
  },
  tinted: (hue: number) => ({
    backgroundColor: `oklch(0.8 0.12 ${hue})`,
  }),
  sm: { width: 24, height: 24 },
  md: { width: 28, height: 28 },
  lg: { width: 34, height: 34 },
  // Scales with the surrounding text, e.g. the name in the header.
  display: {
    width: "0.72em",
    height: "0.72em",
    backgroundImage: `repeating-linear-gradient(135deg, oklch(0.8 0.17 125) 0 2px, ${colors.accent} 2px 8px)`,
  },
  smLabel: { fontSize: 9 },
  mdLabel: { fontSize: 9.5 },
  lgLabel: { fontSize: 11 },
  displayLabel: { fontSize: 11 },
  stack: {
    display: "flex",
  },
  stacked: {
    display: "flex",
    marginRight: -6,
    borderRadius: "50%",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.surface,
  },
});

type Size = "sm" | "md" | "lg" | "display";

const labelSizes = {
  sm: styles.smLabel,
  md: styles.mdLabel,
  lg: styles.lgLabel,
  display: styles.displayLabel,
};

/**
 * A circular avatar. Until real images exist it renders a tinted placeholder
 * with initials; an image without a hue gets the accent (Tom's fallback).
 */
export function Avatar({
  name,
  image,
  size = "md",
}: {
  name: string;
  image: ImageRef;
  size?: Size;
}) {
  return (
    <span
      role="img"
      aria-label={image.alt}
      title={name}
      {...stylex.props(
        styles.avatar,
        image.hue === undefined ? styles.accent : styles.tinted(image.hue),
        styles[size],
      )}
    >
      <span aria-hidden {...stylex.props(labelSizes[size])}>
        {size === "display" ? "photo" : initials(name)}
      </span>
    </span>
  );
}

/** Overlapping avatars with a ring of card colour, e.g. thread participants. */
export function AvatarStack({
  people,
}: {
  people: { name: string; avatar: ImageRef }[];
}) {
  return (
    <span {...stylex.props(styles.stack)}>
      {people.map((p) => (
        <span key={p.name} {...stylex.props(styles.stacked)}>
          <Avatar name={p.name} image={p.avatar} size="sm" />
        </span>
      ))}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
