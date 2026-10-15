"use client";

import * as stylex from "@stylexjs/stylex";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";

const styles = stylex.create({
  nav: {
    display: "flex",
    flexWrap: "wrap",
    gap: 18,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
  },
  link: {
    color: {
      default: colors.muted,
      ":hover": colors.ink,
    },
    textDecorationLine: "none",
  },
  current: {
    color: colors.ink,
    textDecorationLine: "underline",
    textUnderlineOffset: 3,
  },
});

const SECTIONS = [{ href: "/admin", label: "Home" }];

/** The CMS's sections. The one I'm in is underlined. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="CMS" {...stylex.props(styles.nav)}>
      {SECTIONS.map(({ href, label }) => {
        const current =
          href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            {...stylex.props(styles.link, current && styles.current)}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
