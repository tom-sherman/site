import "server-only";
import { Client, XrpcResponseError } from "@atproto/lex";
import { cacheLife } from "next/cache";
import { DID } from "./profile";

export type Did = `did:${string}:${string}`;

/**
 * The repo, collection and rkey of `at://repo/collection/rkey`. The repo is
 * taken to be a DID; a handle fails later, when its PDS can't be resolved.
 */
export function parseAtUri(uri: string) {
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!match) return null;
  const [, repo, collection, rkey] = match;
  return { repo: repo as Did, collection, rkey };
}

/** A client for the PDS hosting `did`. */
export async function pdsClient(did: string) {
  return new Client(await resolvePds(did));
}

/** `null` when the record doesn't exist. */
export async function orNotFound<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof XrpcResponseError && error.error === "RecordNotFound")
      return null;
    throw error;
  }
}

/** A record without validating it against a lexicon. */
export async function getRecordOrNull(
  client: Client,
  collection: string,
  rkey: string,
  repo = DID,
) {
  const response = await orNotFound(
    client.getRecord(collection as `${string}.${string}.${string}`, rkey, {
      repo: repo as Did,
    }),
  );
  return response?.body ?? null;
}

/** The PDS hosting `did`, from its DID document. */
export async function resolvePds(did: string): Promise<string> {
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
