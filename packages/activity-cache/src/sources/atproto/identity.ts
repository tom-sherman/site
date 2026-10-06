import { Effect, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

export class DidResolutionError extends Schema.TaggedError<DidResolutionError>()(
  "DidResolutionError",
  {
    did: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

const DidDocument = Schema.Struct({
  id: Schema.String,
  service: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        type: Schema.String,
        serviceEndpoint: Schema.Unknown,
      }),
    ),
  ),
});

const didDocumentUrl = (did: string) => {
  if (did.startsWith("did:plc:")) return `https://plc.directory/${did}`;
  if (did.startsWith("did:web:"))
    return `https://${decodeURIComponent(did.slice("did:web:".length))}/.well-known/did.json`;
  return undefined;
};

/** Looks up the PDS hosting `did` from its DID document. */
export const resolvePds = Effect.fn("resolvePds")(function* (did: string) {
  const url = didDocumentUrl(did);
  if (!url) {
    return yield* new DidResolutionError({
      did,
      message: "Unsupported DID method",
    });
  }
  const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
  const doc = yield* client.get(url).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(DidDocument)),
    Effect.mapError(
      (cause) =>
        new DidResolutionError({
          did,
          message: "Couldn't fetch DID document",
          cause,
        }),
    ),
  );
  const pds = doc.service?.find(
    (s) =>
      (s.id === "#atproto_pds" || s.id === `${did}#atproto_pds`) &&
      s.type === "AtprotoPersonalDataServer",
  );
  if (typeof pds?.serviceEndpoint !== "string") {
    return yield* new DidResolutionError({
      did,
      message: "DID document has no PDS",
    });
  }
  return pds.serviceEndpoint;
});
