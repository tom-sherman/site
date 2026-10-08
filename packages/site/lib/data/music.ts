import "server-only";
import { cacheLife } from "next/cache";

/**
 * A 56px album cover for a recording, looked up by ISRC on Deezer (keyless,
 * and served from its CDN). It can land on a different edition of the album.
 */
export async function getAlbumArt(isrc: string): Promise<string | null> {
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

export function lastFmArtistUrl(name: string) {
  return `https://www.last.fm/music/${encodeURIComponent(name).replaceAll("%20", "+")}`;
}

export function lastFmTrackUrl(artist: string, track: string) {
  return `${lastFmArtistUrl(artist)}/_/${encodeURIComponent(track).replaceAll("%20", "+")}`;
}
