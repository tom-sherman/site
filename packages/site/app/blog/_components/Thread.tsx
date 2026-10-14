import "server-only";
import * as stylex from "@stylexjs/stylex";
import { Glyph } from "@/lib/components/Glyph";
import { RichText } from "@/lib/components/RichText";
import {
  breakpoints,
  colors,
  fonts,
  fontSizes,
} from "@/lib/components/tokens.stylex";
import type { ThreadPost } from "@/lib/data/thread";
import { formatCount } from "@/lib/feed";
import { formatDateTime } from "@/lib/time";
import { PostImages } from "../../_components/feed/PostImages";
import { LinkCard } from "./LinkCard";
import { BskyEmbed } from "./PostEmbed";
import { Img } from "./Prose";

const styles = stylex.create({
  thread: {
    listStyle: "none",
    // The posts' hover tint bleeds past the text column, so the text lines
    // up with the title above. Never further than the page's gutter.
    marginInline: {
      default: -16,
      [breakpoints.phone]: -10,
    },
  },
  // Each post is set apart by a hairline and its own footer, and links to
  // itself on Bluesky as a whole.
  post: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    rowGap: 14,
    paddingTop: 22,
    paddingBottom: 18,
    paddingInline: {
      default: 16,
      [breakpoints.phone]: 10,
    },
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: colors.rule,
    backgroundColor: {
      default: null,
      ":hover": colors.hoverTint,
    },
  },
  first: {
    borderTopWidth: 0,
  },
  text: {
    fontSize: 18,
    lineHeight: 1.65,
    color: colors.body,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  },
  video: {
    display: "flex",
    flexDirection: "column",
    rowGap: 6,
  },
  videoLabel: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 8,
    rowGap: 4,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  // Stretched over the whole post, so clicking anywhere in it that isn't
  // a link or button of its own (see `globals.css`) goes to Bluesky.
  link: {
    color: {
      default: colors.muted,
      [stylex.when.ancestor(":hover")]: colors.ink,
    },
    textDecoration: "none",
    "::after": {
      content: '""',
      position: "absolute",
      inset: 0,
    },
  },
  external: {
    marginLeft: "auto",
    color: {
      default: colors.muted,
      [stylex.when.ancestor(":hover")]: colors.ink,
    },
  },
});

/**
 * A Bluesky thread published as writing: its posts in order, each with its
 * counts, each linking to itself on Bluesky.
 */
export function Thread({ posts }: { posts: ThreadPost[] }) {
  return (
    <ol aria-label="Posts in this thread" {...stylex.props(styles.thread)}>
      {posts.map((post, i) => (
        <li
          key={post.uri}
          data-stretched-link
          {...stylex.props(
            styles.post,
            stylex.defaultMarker(),
            i === 0 && styles.first,
          )}
        >
          <ThreadPostView post={post} position={i + 1} of={posts.length} />
        </li>
      ))}
    </ol>
  );
}

function ThreadPostView({
  post,
  position,
  of,
}: {
  post: ThreadPost;
  position: number;
  of: number;
}) {
  return (
    <>
      {post.text && (
        <p {...stylex.props(styles.text)}>
          <RichText text={post.text} facets={post.facets} />
        </p>
      )}
      {post.images.length > 0 && <PostImages images={post.images} />}
      {post.video && (
        <div {...stylex.props(styles.video)}>
          {post.video.thumbnail && (
            <Img src={post.video.thumbnail} alt={post.video.alt} />
          )}
          <span {...stylex.props(styles.videoLabel)}>▶ Video, on Bluesky</span>
        </div>
      )}
      {post.external && (
        <LinkCard
          href={post.external.uri}
          title={post.external.title}
          description={post.external.description}
          image={post.external.thumb}
        />
      )}
      {post.quote && <BskyEmbed uri={post.quote} />}
      <div {...stylex.props(styles.footer)}>
        <a
          href={post.url}
          data-stretched
          aria-label={`Post ${position} of ${of}, on Bluesky`}
          title={formatDateTime(post.createdAt)}
          {...stylex.props(styles.link)}
        >
          {position}/{of}
        </a>
        <span aria-hidden>·</span>
        <span>{counts(post)}</span>
        <span {...stylex.props(styles.external)}>
          <Glyph name="external" />
        </span>
      </div>
    </>
  );
}

/** `2 replies · 0 reposts · 3 likes`, and quotes when there are any. */
function counts({ replies, reposts, likes, quotes }: ThreadPost) {
  const count = (n: number, one: string, many: string) =>
    `${formatCount(n)} ${n === 1 ? one : many}`;
  return [
    count(replies, "reply", "replies"),
    count(reposts, "repost", "reposts"),
    count(likes, "like", "likes"),
    ...(quotes > 0 ? [count(quotes, "quote", "quotes")] : []),
  ].join(" · ");
}
