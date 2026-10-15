import * as stylex from "@stylexjs/stylex";
import type { Metadata } from "next";
import { Container } from "@/lib/components/Container";

export const metadata: Metadata = {
  title: { template: "%s – Admin", default: "Admin" },
  robots: { index: false, follow: false },
};

const styles = stylex.create({
  main: {
    paddingTop: 40,
    paddingBottom: 112,
  },
});

/** The CMS, WordPress style. Logged-in pages are in `(cms)`. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Container as="main" style={styles.main}>
      {children}
    </Container>
  );
}
