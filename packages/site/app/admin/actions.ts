"use server";

import { redirect } from "next/navigation";
import { text } from "@/lib/admin/form";
import { LoginError, logIn, logOut } from "@/lib/admin/session";

export interface LoginState {
  error?: string;
}

export async function logInAction(
  _previous: LoginState,
  form: FormData,
): Promise<LoginState> {
  const password = text(form, "password");
  if (!password) return { error: "Enter an app password." };
  try {
    await logIn(password);
  } catch (error) {
    if (error instanceof LoginError) return { error: error.message };
    console.error("Couldn't log in", error);
    return { error: "Couldn't reach the PDS. Try again." };
  }
  redirect("/admin");
}

export async function logOutAction() {
  await logOut();
  redirect("/admin/login");
}
