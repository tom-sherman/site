import * as stylex from "@stylexjs/stylex";
import { Avatar } from "@/lib/components/Avatar";
import { Container } from "@/lib/components/Container";
import { Glyph } from "@/lib/components/Glyph";
import { RelativeTime } from "@/lib/components/RelativeTime";
import { Marginalia, TextLink } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { Profile } from "@/lib/data/profile";
import type { Timestamp } from "@/lib/data/types";

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
  lastActivityAt,
  asOf,
}: {
  profile: Profile;
  lastActivityAt: Timestamp | undefined;
  asOf: Timestamp;
}) {
  return (
    <Container as="header" style={styles.header}>
      <div {...stylex.props(styles.breadcrumb)}>
        <span>{profile.domain}</span>
        <span aria-hidden>/</span>
        <span aria-current="page" {...stylex.props(styles.current)}>
          feed
        </span>
        {lastActivityAt !== undefined && (
          <span {...stylex.props(styles.updated)}>
            last activity{" "}
            <RelativeTime timestamp={lastActivityAt} asOf={asOf} />
          </span>
        )}
      </div>
      <div {...stylex.props(styles.nameLine)}>
        <h1 {...stylex.props(styles.name)}>
          <span>{profile.givenName}</span>
          <span aria-hidden>
            <Avatar
              name={profile.person.name}
              image={profile.person.avatar}
              size="display"
            />
          </span>
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
