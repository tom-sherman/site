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

const SECTIONS = [
  { href: "/admin", label: "Home" },
  { href: "/admin/posts", label: "Posts" },
  { href: "/admin/threads", label: "Threads" },
];

/**
 * The CMS's sections. The one I'm in is underlined, once the URL's known: on
 * a dynamic route, that's only at runtime, so it's behind a boundary whose
 * fallback is {@link NavLinks} without one.
 */
export function AdminNav() {
  return <NavLinks pathname={usePathname()} />;
}

export function NavLinks({ pathname }: { pathname?: string }) {
  return (
    <nav aria-label="CMS" {...stylex.props(styles.nav)}>
      {SECTIONS.map(({ href, label }) => {
        const current =
          href === "/admin" ? pathname === href : pathname?.startsWith(href);
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
