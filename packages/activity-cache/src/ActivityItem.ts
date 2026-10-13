import { getMain, type Main, type RecordSchema } from "@atproto/lex";
import { app, fm, is } from "@repo/atproto-client";
import { lexRecord } from "@repo/atproto-client/effect";
import { Schema } from "effect";

/**
 * Activity as the API serves it: one member per `type`, each with its own
 * `data`. Part of the API contract (see `api.ts`), so only import what a
 * client can import too.
 */

const fields = {
  /**
   * Stable key: the at-uri for atproto records, `github:<event id>` for
   * GitHub, `letterboxd:<kind>-<id>` for Letterboxd.
   */
  id: Schema.String,
  /** Epoch milliseconds. */
  timestamp: Schema.Int,
};

/** An atproto record. `type` is its collection's NSID. */
const record = <S extends RecordSchema>(schema: Main<S>) =>
  Schema.Struct({
    ...fields,
    // `getMain` widens the NSID to any NSID; keep the literal.
    type: Schema.Literal(getMain(schema).$type as S["$type"]),
    data: lexRecord(schema),
  });

export const PostItem = record(app.bsky.feed.post);
export const LikeItem = record(app.bsky.feed.like);
export const RepostItem = record(app.bsky.feed.repost);
export const FollowItem = record(app.bsky.graph.follow);
export const PlayItem = record(fm.teal.feed.play);

/** A thread called out as writing, served in place of its posts. */
export const ThreadItem = Schema.Struct({
  ...record(is.sherman.unspecced.thread).fields,
  /**
   * The thread's posts, oldest first. Never empty: a thread is only served
   * once its root post is cached.
   */
  members: Schema.NonEmptyArray(PostItem),
});

/**
 * A public GitHub event. `data` is the subset of the event that's served;
 * GitHub's events API trims payloads (pull requests have no title, pushes no
 * commits), so this is most of what there is.
 */
const githubEvent = <const T extends string, P extends Schema.Struct.Fields>(
  type: T,
  payload: P,
) =>
  Schema.Struct({
    ...fields,
    type: Schema.Literal(`github.${type}` as `github.${T}`),
    data: Schema.Struct({
      actor: Schema.Struct({ login: Schema.String }),
      /** `owner/name`. */
      repo: Schema.Struct({ name: Schema.String }),
      payload: Schema.Struct(payload),
    }),
  });

const Issue = Schema.Struct({
  number: Schema.Int,
  title: Schema.String,
  html_url: Schema.String,
});

export const PushEvent = githubEvent("PushEvent", {
  /** e.g. `refs/heads/main`. */
  ref: Schema.String,
  /** The commit pushed. */
  head: Schema.String,
  /** The ref's commit before the push. */
  before: Schema.String,
});
export const CreateEvent = githubEvent("CreateEvent", {
  ref_type: Schema.Literals(["repository", "branch", "tag"]),
  /** `null` for a repository. */
  ref: Schema.NullOr(Schema.String),
});
export const DeleteEvent = githubEvent("DeleteEvent", {
  ref_type: Schema.Literals(["branch", "tag"]),
  ref: Schema.String,
});
export const PullRequestEvent = githubEvent("PullRequestEvent", {
  /** e.g. `opened`, `closed`, `merged`. */
  action: Schema.String,
  number: Schema.Int,
});
export const PullRequestReviewEvent = githubEvent("PullRequestReviewEvent", {
  action: Schema.String,
  review: Schema.Struct({ state: Schema.String, html_url: Schema.String }),
  pull_request: Schema.Struct({ number: Schema.Int }),
});
export const IssuesEvent = githubEvent("IssuesEvent", {
  /** e.g. `opened`, `closed`, `labeled`. */
  action: Schema.String,
  issue: Issue,
});
export const IssueCommentEvent = githubEvent("IssueCommentEvent", {
  action: Schema.String,
  /** Pull requests are issues too; their `html_url` is under `/pull/`. */
  issue: Issue,
  comment: Schema.Struct({ html_url: Schema.String, body: Schema.String }),
});
/** Starring a repository. */
export const WatchEvent = githubEvent("WatchEvent", {
  action: Schema.Literal("started"),
});

export const GitHubItem = Schema.Union([
  PushEvent,
  CreateEvent,
  DeleteEvent,
  PullRequestEvent,
  PullRequestReviewEvent,
  IssuesEvent,
  IssueCommentEvent,
  WatchEvent,
]);

/** 0.5–5, in half stars. */
const Rating = Schema.Number.check(
  Schema.isBetween({ minimum: 0.5, maximum: 5 }),
  Schema.isMultipleOf(0.5),
);

/**
 * A film I logged in my Letterboxd diary, e.g. `letterboxd:review-1523777052`.
 * `timestamp` is when it was logged, not watched.
 */
const diaryEntry = <const T extends string, D extends Schema.Struct.Fields>(
  type: T,
  data: D,
) =>
  Schema.Struct({
    ...fields,
    type: Schema.Literal(`letterboxd.${type}` as `letterboxd.${T}`),
    data: Schema.Struct({
      /** The entry on Letterboxd. */
      url: Schema.String,
      film: Schema.Struct({
        title: Schema.String,
        year: Schema.optional(Schema.Int),
        /**
         * Letterboxd's 600×900 poster. Other sizes are the same URL with
         * other dimensions, e.g. `-0-230-0-345-crop.jpg`.
         */
        poster: Schema.optional(Schema.String),
        tmdbId: Schema.optional(Schema.Int),
      }),
      /** `YYYY-MM-DD`, when it was logged as a watch. */
      watchedDate: Schema.optional(Schema.String),
      rewatch: Schema.Boolean,
      /** Given a heart. */
      liked: Schema.Boolean,
      ...data,
    }),
  });

/** A film watched and rated, without a review. */
export const FilmRatingItem = diaryEntry("rating", { rating: Rating });
export const FilmReviewItem = diaryEntry("review", {
  /** Reviews don't need a rating. */
  rating: Schema.optional(Rating),
  /** Plain text, paragraphs separated by blank lines. */
  review: Schema.String,
  /** Marked as containing spoilers. */
  spoilers: Schema.Boolean,
});

export const LetterboxdItem = Schema.Union([FilmRatingItem, FilmReviewItem]);

export const ActivityItem = Schema.Union([
  PostItem,
  ThreadItem,
  LikeItem,
  RepostItem,
  FollowItem,
  PlayItem,
  ...GitHubItem.members,
  ...LetterboxdItem.members,
]);
export type ActivityItem = typeof ActivityItem.Type;

/** Every `type` the API serves. */
export const ActivityType = Schema.Literals(
  ActivityItem.members.map((member) => member.fields.type.literal),
);
export type ActivityType = typeof ActivityType.Type;
