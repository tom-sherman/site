import * as stylex from "@stylexjs/stylex";
import { Fragment } from "react";
import { TextLink } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";

const styles = stylex.create({
  breadcrumb: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
  current: {
    minWidth: 0,
    overflowWrap: "anywhere",
    color: colors.ink,
  },
});

/** `tom.sherman.is / blog / …`: the site, then each page down to this one. */
export function Breadcrumb({
  domain,
  trail,
}: {
  domain: string;
  /** Pages below the homepage; the last is the current page. */
  trail: { label: string; href?: string }[];
}) {
  const current = trail.at(-1);
  return (
    <nav aria-label="Breadcrumb" {...stylex.props(styles.breadcrumb)}>
      <TextLink href="/" variant="quiet">
        {domain}
      </TextLink>
      {trail.slice(0, -1).map(({ label, href }) => (
        <Fragment key={label}>
          <span aria-hidden>/</span>
          {href ? (
            <TextLink href={href} variant="quiet">
              {label}
            </TextLink>
          ) : (
            <span>{label}</span>
          )}
        </Fragment>
      ))}
      {current && (
        <>
          <span aria-hidden>/</span>
          <span aria-current="page" {...stylex.props(styles.current)}>
            {current.label}
          </span>
        </>
      )}
    </nav>
  );
}
