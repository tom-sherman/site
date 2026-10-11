import type { Metadata } from "next";
import { Geist, Instrument_Serif, Martian_Mono } from "next/font/google";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts } from "@/lib/components/tokens.stylex";
import "./globals.css";
// My Bluesky profile photo, as in the header.
import avatar from "./_components/avatar.webp";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const martianMono = Martian_Mono({
  variable: "--font-martian-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tom Sherman",
  description:
    "Staff Engineer who cares deeply about the open web and design systems.",
  icons: { icon: avatar.src },
};

const styles = stylex.create({
  body: {
    backgroundColor: colors.page,
    color: colors.ink,
    fontFamily: fonts.sans,
    WebkitFontSmoothing: "antialiased",
  },
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${instrumentSerif.variable} ${martianMono.variable}`}
    >
      <body {...stylex.props(styles.body)}>{children}</body>
    </html>
  );
}
