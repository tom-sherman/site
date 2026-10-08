import "server-only";
import {
  Client,
  getBlobCidString,
  isBlobRef,
  isLexMap,
  XrpcResponseError,
} from "@atproto/lex";
import { fm, games } from "@repo/atproto-client";
import { cacheLife } from "next/cache";
import type { ImageRef, Timestamp } from "./types";

/** A piece of text, linked when there's somewhere to go. */
export interface NowLink {
  text: string;
  url?: string;
}

export interface NowActivity {
  id: string;
  kind: "listening" | "playing";
  title: string;
  /** Where the title links to: the track or the game. */
  url?: string;
  /** Shown after the title, comma-separated, e.g. one part per artist. */
  subtitle: NowLink[];
  art: ImageRef;
  startedAt: Timestamp;
  /** Known length in seconds (songs). `null` for open-ended activities (games). */
  durationSeconds: number | null;
}

export interface NowStatus {
  /** Concurrent activities, e.g. listening *and* playing. Empty when offline. */
  activities: NowActivity[];
  /** When an activity was last current. `null` when there's no record of one. */
  lastSeenAt: Timestamp | null;
}

const DID = "did:plc:2xau7wbgdq4phuou2ypwuen7";

/** teal.fm's default when a status has no `expiry`. */
const TEAL_DEFAULT_EXPIRY_MS = 10 * 60_000;

/** One source's take on what's happening now. */
interface Presence {
  activity: NowActivity | null;
  lastSeenAt: Timestamp | null;
}

const ABSENT: Presence = { activity: null, lastSeenAt: null };

export async function getNowStatus(): Promise<NowStatus> {
  "use cache";
  // Short-lived, so this renders at request time behind a Suspense boundary.
  cacheLife("seconds");

  const now = Date.now();
  const client = resolvePds(DID).then((pds) => new Client(pds));
  // A broken source shouldn't take the other down with it, or the page.
  const presences = await Promise.all(
    (
      [
        ["listening", getListening],
        ["playing", getPlaying],
      ] as const
    ).map(([label, get]) =>
      client
        .then((c) => get(c, now))
        .catch((error: unknown) => {
          console.error(`Couldn't get ${label} status`, error);
          return ABSENT;
        }),
    ),
  );

  const activities = presences.flatMap((p) => (p.activity ? [p.activity] : []));
  const seen = presences.flatMap((p) => (p.lastSeenAt ? [p.lastSeenAt] : []));
  return {
    activities,
    lastSeenAt: activities.length
      ? now
      : seen.length
        ? Math.max(...seen)
        : null,
  };
}

/** teal.fm's `fm.teal.actor.status/self`. */
async function getListening(client: Client, now: Timestamp): Promise<Presence> {
  const record = await getRecordOrNull(
    client,
    fm.teal.actor.status.$nsid,
    "self",
  );
  if (!record) return ABSENT;

  // teal.fm clears the status by writing an empty item, which isn't valid
  // against the lexicon (trackName has a minimum length).
  if (isClearedTealStatus(record.value)) {
    const time = record.value.time;
    return {
      activity: null,
      lastSeenAt: typeof time === "string" ? Date.parse(time) : null,
    };
  }

  const status = fm.teal.actor.status.$parse(record.value);
  const expiresAt = status.expiry
    ? Date.parse(status.expiry)
    : Date.parse(status.time) + TEAL_DEFAULT_EXPIRY_MS;
  if (expiresAt <= now) return { activity: null, lastSeenAt: expiresAt };

  const { item } = status;
  const alt = `${item.releaseName ?? item.trackName} cover art`;
  const coverArt = item.isrc
    ? await getAlbumArt(item.isrc).catch((error: unknown) => {
        console.error(`Couldn't get album art for ${item.isrc}`, error);
        return null;
      })
    : null;
  return {
    activity: {
      id: record.uri,
      kind: "listening",
      title: item.trackName,
      url: httpUrl(item.originUri),
      subtitle: item.artists.map((a) => ({
        text: a.artistName,
        url: lastFmArtistUrl(a.artistName),
      })),
      art: coverArt
        ? { alt, url: coverArt }
        : { alt, hue: hueOf(item.artists[0]?.artistName ?? item.trackName) },
      startedAt: Date.parse(item.playedTime ?? status.time),
      durationSeconds: item.duration ?? null,
    },
    lastSeenAt: now,
  };
}

/**
 * A 56px album cover for a recording, looked up by ISRC on Deezer (keyless,
 * and served from its CDN). It can land on a different edition of the album.
 */
async function getAlbumArt(isrc: string): Promise<string | null> {
  "use cache";
  cacheLife("days");

  const response = await fetch(
    `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`,
  );
  if (!response.ok) throw new Error(`Deezer returned ${response.status}`);
  // Not found is a 200 with an `error` body, which has no album.
  const track = (await response.json()) as {
    album?: { cover_small?: string };
  };
  return track.album?.cover_small ?? null;
}

function isClearedTealStatus(value: Record<string, unknown>) {
  const item = value.item;
  return (
    typeof item === "object" &&
    item !== null &&
    "trackName" in item &&
    item.trackName === "" &&
    "artists" in item &&
    Array.isArray(item.artists) &&
    item.artists.length === 0
  );
}

/**
 * `games.atmosphere.status`. It's meant to be one record per account, but the
 * key is `any` and several launchers may each keep their own, so take the
 * newest session that isn't stale.
 */
async function getPlaying(client: Client, now: Timestamp): Promise<Presence> {
  const { body } = await client.listRecords(games.atmosphere.status.$nsid, {
    repo: DID,
    limit: 10,
  });
  const statuses = body.records.flatMap((record) => {
    const result = games.atmosphere.status.$safeParse(record.value);
    return result.success
      ? [
          {
            uri: record.uri,
            status: result.value,
            createdAt: Date.parse(result.value.createdAt),
            staleAt: Date.parse(result.value.staleAt),
          },
        ]
      : [];
  });
  if (!statuses.length) return ABSENT;

  const current = statuses
    .filter((s) => s.staleAt > now)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!current) {
    return {
      activity: null,
      lastSeenAt: Math.max(...statuses.map((s) => s.staleAt)),
    };
  }

  const { status } = current;
  const game = await getGame(status.game).catch((error: unknown) => {
    console.error(`Couldn't get ${status.game}`, error);
    return null;
  });
  const title = game?.name ?? status.embed?.external.title ?? "a game";
  const thumb = status.embed?.external.thumb;
  const image =
    game?.image ?? (thumb ? thumbnailUrl(DID, getBlobCidString(thumb)) : null);
  const alt = `${title} cover`;
  const subtitle = [status.state, status.details?.event]
    .filter(Boolean)
    .join(" · ");
  return {
    activity: {
      id: current.uri,
      kind: "playing",
      title,
      url: game?.url ?? httpUrl(status.embed?.external.uri),
      subtitle: subtitle ? [{ text: subtitle }] : [],
      art: image ? { alt, url: image } : { alt, hue: hueOf(title) },
      startedAt: current.createdAt,
      durationSeconds: null,
    },
    lastSeenAt: now,
  };
}

interface Game {
  name: string | null;
  image: string | null;
  url: string | undefined;
}

/**
 * The name, artwork and link of a game definition record. Statuses can point
 * at any catalog, so it's read without validating against one lexicon. Both
 * catalogs so far call it `name`. `games.atmosphere.define` has `icon` and
 * `cover` blobs and a `url` to play it at; `games.gamesgamesgamesgames.game`
 * has `media` tagged by `mediaType` and `websites` tagged by `type`. The
 * square icon is preferred since it's small and so is the slot, and the
 * official site over storefronts.
 */
async function getGame(uri: string): Promise<Game | null> {
  "use cache";
  cacheLife("days");

  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!match) return null;
  const [, repo, collection, rkey] = match;
  const client = new Client(await resolvePds(repo));
  const record = await getRecordOrNull(client, collection, rkey, repo);
  if (!record) return null;

  const { value } = record;
  const media = Array.isArray(value.media) ? value.media.filter(isLexMap) : [];
  const fromMedia = (type: string) =>
    media.find((m) => m.mediaType === type)?.blob;
  const blob = [
    value.icon,
    fromMedia("icon"),
    value.cover,
    fromMedia("cover"),
  ].find((b) => isBlobRef(b));

  const websites = Array.isArray(value.websites)
    ? value.websites.filter(isLexMap)
    : [];
  const website = (type?: string) =>
    httpUrl(websites.find((w) => !type || w.type === type)?.url);

  return {
    name: typeof value.name === "string" && value.name ? value.name : null,
    image: blob ? thumbnailUrl(repo, getBlobCidString(blob)) : null,
    url:
      httpUrl(value.url) ??
      website("official") ??
      website("steam") ??
      website(),
  };
}

/** `value` if it's an http(s) URL. Records are untrusted, so no `javascript:` links. */
function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !URL.canParse(value)) return undefined;
  const { protocol } = new URL(value);
  return protocol === "https:" || protocol === "http:" ? value : undefined;
}

function lastFmArtistUrl(name: string) {
  return `https://www.last.fm/music/${encodeURIComponent(name).replaceAll("%20", "+")}`;
}

/** A stable placeholder tint for when there's no artwork. */
function hueOf(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

/**
 * A small square crop of an image blob, from Bluesky's CDN. The blob itself
 * can be megabytes, served uncached by whichever PDS hosts the repo.
 */
function thumbnailUrl(did: string, cid: string) {
  return `https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/${cid}@webp`;
}

async function getRecordOrNull(
  client: Client,
  collection: string,
  rkey: string,
  repo = DID,
) {
  try {
    const { body } = await client.getRecord(
      collection as `${string}.${string}.${string}`,
      rkey,
      { repo: repo as `did:${string}:${string}` },
    );
    return body;
  } catch (error) {
    if (error instanceof XrpcResponseError && error.error === "RecordNotFound")
      return null;
    throw error;
  }
}

/** The PDS hosting `did`, from its DID document. */
async function resolvePds(did: string): Promise<string> {
  "use cache";
  cacheLife("hours");

  const url = did.startsWith("did:plc:")
    ? `https://plc.directory/${did}`
    : did.startsWith("did:web:")
      ? `https://${decodeURIComponent(did.slice("did:web:".length))}/.well-known/did.json`
      : null;
  if (!url) throw new Error(`Unsupported DID method: ${did}`);

  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `Couldn't fetch DID document for ${did}: ${response.status}`,
    );
  const doc = (await response.json()) as {
    service?: { id: string; type: string; serviceEndpoint: unknown }[];
  };
  const pds = doc.service?.find(
    (s) =>
      (s.id === "#atproto_pds" || s.id === `${did}#atproto_pds`) &&
      s.type === "AtprotoPersonalDataServer",
  );
  if (typeof pds?.serviceEndpoint !== "string")
    throw new Error(`DID document for ${did} has no PDS`);
  return pds.serviceEndpoint;
}
