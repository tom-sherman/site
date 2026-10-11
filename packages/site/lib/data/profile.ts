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

/** My atproto identity. */
export const DID = "did:plc:2xau7wbgdq4phuou2ypwuen7";

export const TOM: Person = {
  name: "Tom Sherman",
  handle: "@tom.sherman.is",
  avatar: { alt: "Tom Sherman" },
};

export async function getProfile(): Promise<Profile> {
  return {
    givenName: "Tom",
    familyName: "Sherman",
    domain: "tom.sherman.is",
    intro:
      "Staff Engineer who cares deeply about the open web and design systems.",
    person: TOM,
    links: [
      { label: "bluesky", url: "https://bsky.app/profile/tom.sherman.is" },
      { label: "x", url: "https://x.com/tomus_sherman" },
      { label: "github", url: "https://github.com/tom-sherman" },
      { label: "letterboxd", url: "https://letterboxd.com/tomus" },
      { label: "last.fm", url: "https://www.last.fm/user/tom-sherman" },
    ],
  };
}

export async function getVisitorCount(): Promise<number> {
  return 4281;
}
