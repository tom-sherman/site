import type { Metadata } from "next";
import { Container } from "@/lib/components/Container";
import { getProfile } from "@/lib/data/profile";
import { Header } from "../_components/Header";
import { CalEmbed } from "./CalEmbed";

export const metadata: Metadata = {
  title: "Meet Tom Sherman",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MeetPage() {
  const profile = await getProfile();

  return (
    <>
      <Header profile={profile} page="meet" />
      <Container as="main">
        <CalEmbed />
      </Container>
    </>
  );
}
