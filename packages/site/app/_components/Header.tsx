import * as stylex from "@stylexjs/stylex";
import Image from "next/image";
import { Container } from "@/lib/components/Container";
import { Glyph } from "@/lib/components/Glyph";
import { RelativeTime } from "@/lib/components/RelativeTime";
import { Marginalia, TextLink } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { Profile } from "@/lib/data/profile";
import type { Timestamp } from "@/lib/data/types";
// My Bluesky profile photo as of October 2026.
import photo from "./avatar.webp";

const styles = stylex.create({
  header: {
    paddingTop: 72,
    paddingBottom: 80,
  },
  breadcrumb: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
  current: {
    color: colors.ink,
  },
  updated: {
    marginLeft: "auto",
  },
  nameLine: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: "0.18em",
    marginTop: 56,
    fontFamily: fonts.serif,
    fontSize: "clamp(60px, 11vw, 136px)",
    lineHeight: 0.88,
    letterSpacing: "-0.025em",
  },
  name: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: "0.18em",
    minWidth: 0,
    fontSize: "inherit",
    fontWeight: 400,
  },
  avatar: {
    flexShrink: 0,
    // Scales with the name it sits in.
    width: "0.72em",
    height: "0.72em",
    borderRadius: "50%",
    objectFit: "cover",
  },
  family: {
    fontStyle: "italic",
  },
  marginalia: {
    alignSelf: "flex-end",
    marginBottom: "0.6em",
  },
  introRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    rowGap: 16,
    columnGap: 40,
    marginTop: 32,
  },
  intro: {
    maxWidth: "32ch",
    fontSize: "clamp(19px, 2.1vw, 23px)",
    lineHeight: 1.35,
    textWrap: "pretty",
  },
  links: {
    display: "flex",
    flexWrap: "wrap",
    rowGap: 6,
    columnGap: 18,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
  },
});

export function Header({
  profile,
  page,
  lastActivity,
}: {
  profile: Profile;
  /** The current page, shown after the domain in the breadcrumb. */
  page: string;
  lastActivity?: { at: Timestamp; asOf: Timestamp };
}) {
  return (
    <Container as="header" style={styles.header}>
      <div {...stylex.props(styles.breadcrumb)}>
        <TextLink href="/" variant="quiet">
          {profile.domain}
        </TextLink>
        <span aria-hidden>/</span>
        <span aria-current="page" {...stylex.props(styles.current)}>
          {page}
        </span>
        {lastActivity !== undefined && (
          <span {...stylex.props(styles.updated)}>
            last activity{" "}
            <RelativeTime
              timestamp={lastActivity.at}
              asOf={lastActivity.asOf}
            />
          </span>
        )}
      </div>
      <div {...stylex.props(styles.nameLine)}>
        <h1 {...stylex.props(styles.name)}>
          <span>{profile.givenName}</span>
          <HeaderAvatar />
          <em {...stylex.props(styles.family)}>{profile.familyName}</em>
        </h1>
        <Marginalia style={styles.marginalia}>
          ↖ a person, mostly online
        </Marginalia>
      </div>
      <div {...stylex.props(styles.introRow)}>
        <p {...stylex.props(styles.intro)}>{profile.intro}</p>
        <nav aria-label="Elsewhere" {...stylex.props(styles.links)}>
          {profile.links.map((link) => (
            <TextLink key={link.label} href={link.url} rel="me">
              {link.label} <Glyph name="external" />
            </TextLink>
          ))}
        </nav>
      </div>
    </Container>
  );
}

/** My photo, between my given and family names. */
function HeaderAvatar() {
  return (
    <Image
      src={photo}
      // Decorative: it would otherwise be read out as part of the heading.
      alt=""
      // 0.72em of the name's `clamp(60px, 11vw, 136px)`.
      sizes="(min-width: 1237px) 98px, (min-width: 546px) 8vw, 43px"
      loading="eager"
      placeholder="blur"
      {...stylex.props(styles.avatar)}
    />
  );
}
