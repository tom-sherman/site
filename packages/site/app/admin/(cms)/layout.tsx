import * as stylex from "@stylexjs/stylex";
import { type ReactNode, Suspense } from "react";
import { requireSession } from "@/lib/admin/session";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import { getProfile } from "@/lib/data/profile";
import { Breadcrumb } from "../../_components/Breadcrumb";
import { logOutAction } from "../actions";
import { AdminNav } from "../_components/AdminNav";
import { Button } from "../_components/controls";

const styles = stylex.create({
  bar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    rowGap: 12,
    columnGap: 32,
    paddingBottom: 16,
    marginBottom: 48,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.rule,
  },
  logOut: {
    marginInlineStart: "auto",
  },
  loading: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
});

/**
 * Every page that needs me logged in. The check is behind a boundary
 * because it reads the cookie; it's for getting to the login form; each
 * Server Action checks the session again before it writes anything.
 */
export default async function CmsLayout({ children }: LayoutProps<"/admin">) {
  const { domain } = await getProfile();
  return (
    <>
      <div {...stylex.props(styles.bar)}>
        <Breadcrumb domain={domain} trail={[{ label: "admin" }]} />
        <AdminNav />
        <form action={logOutAction} {...stylex.props(styles.logOut)}>
          <Button type="submit">Log out</Button>
        </form>
      </div>
      <Suspense fallback={<p {...stylex.props(styles.loading)}>Loading…</p>}>
        <LoggedIn>{children}</LoggedIn>
      </Suspense>
    </>
  );
}

async function LoggedIn({ children }: { children: ReactNode }) {
  await requireSession();
  return children;
}
