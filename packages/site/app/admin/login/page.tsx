import * as stylex from "@stylexjs/stylex";
import type { Metadata } from "next";
import { colors, fontSizes } from "@/lib/components/tokens.stylex";
import { getProfile } from "@/lib/data/profile";
import { Breadcrumb } from "../../_components/Breadcrumb";
import { PageHeading } from "../_components/PageHeading";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

const styles = stylex.create({
  column: {
    maxWidth: 420,
  },
  breadcrumb: {
    marginBottom: 48,
  },
  intro: {
    marginBottom: 24,
    fontSize: fontSizes.body,
    lineHeight: 1.5,
    color: colors.body,
  },
});

export default async function LoginPage() {
  const { domain, person } = await getProfile();
  return (
    <div {...stylex.props(styles.column)}>
      <div {...stylex.props(styles.breadcrumb)}>
        <Breadcrumb
          domain={domain}
          trail={[{ label: "admin", href: "/admin" }, { label: "log in" }]}
        />
      </div>
      <PageHeading title="Log in" />
      <p {...stylex.props(styles.intro)}>
        With an app password for {person.handle}. Make one in Bluesky under
        Settings → Privacy and security → App passwords.
      </p>
      <LoginForm />
    </div>
  );
}
