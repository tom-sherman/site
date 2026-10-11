import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { Container } from "@/lib/components/Container";
import { Eyebrow, Marginalia } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";

const styles = stylex.create({
  footer: {
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.rule,
  },
  inner: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    rowGap: 48,
    columnGap: 88,
    paddingTop: 48,
    paddingBottom: 72,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    lineHeight: 1.7,
    color: colors.muted,
  },
  signoff: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 12,
  },
});

export function Footer({
  name,
  year,
}: {
  name: string;
  year: number;
}) {
  return (
    <footer {...stylex.props(styles.footer)}>
      <Container style={styles.inner}>
        <div>
          <Eyebrow as="h2" style={x.marginBottom._6px}>
            Colophon
          </Eyebrow>
          Set in Instrument Serif, Geist and Martian Mono. Built with Next.js
          and StyleX. No trackers, no cookies.
        </div>
        <div>
          <Eyebrow as="h2" style={x.marginBottom._6px}>
            Sources
          </Eyebrow>
          Feed pulled from Bluesky, X, Letterboxd, Last.fm, Steam and GitHub.
        </div>
        <div {...stylex.props(styles.signoff)}>
          <Marginalia variant="sticker">
            © {year} {name}
          </Marginalia>
        </div>
      </Container>
    </footer>
  );
}

