"use client";

import * as stylex from "@stylexjs/stylex";
import { createContext, use, useState, type ReactNode } from "react";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";

const styles = stylex.create({
  toggle: {
    flexShrink: 0,
    marginLeft: 8,
    appearance: "none",
    cursor: "pointer",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    // Mono microcopy wherever it sits, even next to a list item's label.
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    fontWeight: "inherit",
    lineHeight: "inherit",
    color: colors.ink,
    textDecorationLine: "underline",
    textDecorationColor: {
      default: colors.underline,
      ":hover": "currentColor",
    },
    textUnderlineOffset: 3,
  },
});

const DisclosureContext = createContext<{
  open: Readonly<Record<string, boolean>>;
  toggle: (name: string) => void;
} | null>(null);

function useDisclosure(name: string) {
  const context = use(DisclosureContext);
  if (!context) throw new Error("Disclosure used outside <Disclosures>");
  return { open: !!context.open[name], toggle: () => context.toggle(name) };
}

/**
 * Holds the open state of the named disclosures inside it, so a server
 * component can lay out each toggle and its panel wherever it likes.
 */
export function Disclosures({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <DisclosureContext
      value={{
        open,
        toggle: (name) => setOpen({ ...open, [name]: !open[name] }),
      }}
    >
      {children}
    </DisclosureContext>
  );
}

/** Reads `show` while its panel is closed and `hide` while it's open. */
export function DisclosureToggle({
  name,
  show,
  hide,
}: {
  name: string;
  show: ReactNode;
  hide: ReactNode;
}) {
  const { open, toggle } = useDisclosure(name);
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={toggle}
      {...stylex.props(styles.toggle)}
    >
      {open ? hide : show}
    </button>
  );
}

export function DisclosurePanel({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return useDisclosure(name).open ? children : null;
}
