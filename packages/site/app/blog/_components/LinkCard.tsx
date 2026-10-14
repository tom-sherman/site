import * as stylex from "@stylexjs/stylex";
import { Card, CardHeader } from "@/lib/components/Card";
import { colors, fontSizes } from "@/lib/components/tokens.stylex";
import { Img, safeHref } from "./Prose";

const styles = stylex.create({
  body: {
    paddingTop: 12,
    paddingInline: 18,
    paddingBottom: 16,
  },
  title: {
    fontWeight: 600,
    color: colors.ink,
  },
  description: {
    marginTop: 4,
    fontSize: fontSizes.body,
    lineHeight: 1.45,
    color: colors.subtle,
  },
});

/**
 * A link to a web page, with its preview: a Leaflet website block, or a
 * Bluesky post's link card. Only http(s) links are shown.
 */
export function LinkCard({
  href,
  title,
  description,
  image,
}: {
  href: string;
  title?: string;
  description?: string;
  /** Decorative; the title is right under it. */
  image?: string;
}) {
  const safe = safeHref(href);
  if (!safe || !/^https?:/.test(safe)) return null;
  return (
    <Card href={safe}>
      <CardHeader glyph="external" label={new URL(safe).hostname} />
      {image && <Img src={image} alt="" />}
      <div {...stylex.props(styles.body)}>
        <div {...stylex.props(styles.title)}>{title || safe}</div>
        {description && (
          <p {...stylex.props(styles.description)}>{description}</p>
        )}
      </div>
    </Card>
  );
}
