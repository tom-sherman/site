import * as stylex from "@stylexjs/stylex";
import type { Metadata } from "next";
import { colors, fontSizes } from "@/lib/components/tokens.stylex";
import { PageHeading } from "../_components/PageHeading";

export const metadata: Metadata = { title: "Home" };

const styles = stylex.create({
  intro: {
    maxWidth: "60ch",
    fontSize: fontSizes.body,
    lineHeight: 1.5,
    color: colors.body,
  },
});

export default function AdminHome() {
  return (
    <>
      <PageHeading title="Admin" />
      <p {...stylex.props(styles.intro)}>
        Logged in. Writing, threads and pins are managed from here.
      </p>
    </>
  );
}
