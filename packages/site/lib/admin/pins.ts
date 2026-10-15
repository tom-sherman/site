import "server-only";
import { currentDatetimeString, isAtUriString } from "@atproto/lex";
import { is, site } from "@repo/atproto-client";
import { orNotFound, parseAtUri, pdsClient } from "../data/atproto";
import { PUBLICATION, threadRootOf } from "../data/blog";
import { DID } from "../data/profile";
import { repoClient } from "./session";

/**
 * What the homepage pins: my `is.sherman.unspecced.home.pinned/self`
 * record, an ordered list of `site.standard.document`s.
 */

type PinItem = is.sherman.unspecced.home.pinned.Item;

/** One of my documents, which can be pinned. */
export interface Pinnable {
  uri: string;
  title: string;
  kind: "Blog post" | "Thread" | "Leaflet";
  publishedAt: string;
}

export interface Pin {
  uri: string;
  hero: boolean;
  /** `undefined` when the document's gone; the homepage leaves it out. */
  document?: Pinnable;
}

/** At most this many, by the lexicon. */
export const MAX_PINS = 20;

/** The pins in order, and every document that could be pinned. */
export async function getPins(): Promise<{
  pins: Pin[];
  documents: Pinnable[];
}> {
  const [items, documents] = await Promise.all([readItems(), listDocuments()]);
  const byUri = new Map(documents.map((doc) => [doc.uri, doc]));
  return {
    pins: items.map(({ uri, hero = false }) => ({
      uri,
      hero,
      document: byUri.get(uri),
    })),
    documents,
  };
}

export type PinEdit =
  | { op: "add"; uri: string }
  | { op: "remove" | "up" | "down" | "hero"; uri: string };

/** Applies an edit to the pins as they are now, and saves them. */
export async function editPins(edit: PinEdit) {
  const items = await readItems();
  const index = items.findIndex((item) => item.uri === edit.uri);
  switch (edit.op) {
    case "add":
      if (index !== -1) return;
      if (items.length >= MAX_PINS) {
        throw new Error(`There can only be ${MAX_PINS} pins.`);
      }
      if (
        !isAtUriString(edit.uri) ||
        parseAtUri(edit.uri)?.collection !== site.standard.document.$nsid
      ) {
        throw new Error("Only documents can be pinned.");
      }
      items.push({ uri: edit.uri, hero: false });
      break;
    case "remove":
      if (index === -1) return;
      items.splice(index, 1);
      break;
    case "up":
    case "down": {
      const to = index + (edit.op === "up" ? -1 : 1);
      if (index === -1 || to < 0 || to >= items.length) return;
      [items[index], items[to]] = [items[to], items[index]];
      break;
    }
    case "hero":
      if (index === -1) return;
      items[index] = { ...items[index], hero: !items[index].hero };
      break;
  }
  const client = await repoClient();
  await client.put(is.sherman.unspecced.home.pinned, {
    items,
    updatedAt: currentDatetimeString(),
  });
}

async function readItems(): Promise<PinItem[]> {
  const client = await pdsClient(DID);
  const record = await orNotFound(
    client.get(is.sherman.unspecced.home.pinned, { repo: DID }),
  );
  return record?.value.items.map(({ uri, hero }) => ({ uri, hero })) ?? [];
}

/** My documents, newest first. */
async function listDocuments(): Promise<Pinnable[]> {
  const client = await pdsClient(DID);
  const documents: Pinnable[] = [];
  for await (const doc of client.listAll(site.standard.document, {
    repo: DID,
    limit: 100,
  })) {
    if (!doc.valid) continue;
    documents.push({
      uri: doc.uri,
      title: doc.value.title,
      kind:
        doc.value.site !== PUBLICATION
          ? "Leaflet"
          : threadRootOf(doc.uri, doc.value)
            ? "Thread"
            : "Blog post",
      publishedAt: doc.value.publishedAt,
    });
  }
  return documents.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
