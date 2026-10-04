import "server-only";
import type { Person } from "./types";

export interface Profile {
  givenName: string;
  familyName: string;
  domain: string;
  intro: string;
  person: Person;
  links: { label: string; url: string }[];
}

export const TOM: Person = {
  name: "Tom Sherman",
  handle: "@tomsherman.dev",
  avatar: { alt: "Tom Sherman" },
};

export async function getProfile(): Promise<Profile> {
  return {
    givenName: "Tom",
    familyName: "Sherman",
    domain: "tomsherman.dev",
    intro:
      "Staff Engineer who cares deeply about the open web and design systems.",
    person: TOM,
    links: [
      { label: "bluesky", url: "https://bsky.app/profile/tomsherman.dev" },
      { label: "x", url: "https://x.com/tomsherman" },
      { label: "github", url: "https://github.com/tom-sherman" },
      { label: "letterboxd", url: "https://letterboxd.com/tomsherman" },
      { label: "last.fm", url: "https://www.last.fm/user/tomsherman" },
    ],
  };
}

export async function getVisitorCount(): Promise<number> {
  return 4281;
}
