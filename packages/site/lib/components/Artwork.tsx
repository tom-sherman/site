import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ImageRef } from "@/lib/data/types";
import { colors, fonts, fontSizes } from "./tokens.stylex";

const styles = stylex.create({
  artwork: {
    display: "flex",
    alignItems: "flex-end",
    flexShrink: 0,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    lineHeight: 1.4,
    color: colors.subtle,
  },
  // Neutral stripes for hero images and attachments.
  photo: {
    backgroundImage:
      "repeating-linear-gradient(135deg, oklch(0.92 0.008 95) 0 1px, oklch(0.96 0.006 95) 1px 8px)",
    paddingBlock: 10,
    paddingInline: 14,
  },
  // Tinted stripes for film posters.
  poster: (hue: number) => ({
    backgroundImage: `repeating-linear-gradient(135deg, oklch(0.72 0.12 ${hue}) 0 1px, oklch(0.8 0.1 ${hue}) 1px 7px)`,
    padding: 6,
    fontSize: 9.5,
    color: "oklch(0.25 0.012 95)",
  }),
  // Flat colour for album art and game covers.
  cover: (hue: number) => ({
    backgroundColor: `oklch(0.8 0.12 ${hue})`,
  }),
  image: {
    objectFit: "cover",
  },
});

type Variant = "photo" | "poster" | "cover";

/**
 * An image, or a placeholder when it has no `url`. Placeholder photos and
 * posters show a small caption describing what will go there; covers are just
 * a swatch.
 */
export function Artwork({
  image,
  variant,
  caption,
  style,
}: {
  image: ImageRef;
  variant: Variant;
  caption?: string;
  /** Sizing and framing, which depend on where the artwork sits. */
  style?: StyleXStyles<{
    width?: number | string;
    marginTop?: number | string;
    height?: number | string;
    aspectRatio?: number | string;
    padding?: number | string;
    paddingBlock?: number | string;
    paddingInline?: number | string;
    fontSize?: number | string;
    borderRadius?: number | string;
    borderWidth?: number | string;
    borderStyle?: "solid";
    borderColor?: number | string;
    borderBottomWidth?: number | string;
    borderBottomStyle?: "solid";
    borderBottomColor?: number | string;
    outlineWidth?: number | string;
    outlineStyle?: "solid";
    outlineColor?: number | string;
  }>;
}) {
  if (image.url) {
    return (
      // Remote art that's already small and on a CDN, so not run through
      // next/image's optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image.url}
        alt={image.alt}
        loading="lazy"
        {...stylex.props(styles.artwork, styles.image, style)}
      />
    );
  }

  const hue = image.hue ?? 0;
  return (
    <span
      role="img"
      aria-label={image.alt}
      {...stylex.props(
        styles.artwork,
        variant === "photo" && styles.photo,
        variant === "poster" && styles.poster(hue),
        variant === "cover" && styles.cover(hue),
        style,
      )}
    >
      {caption && <span aria-hidden>{caption}</span>}
    </span>
  );
}
