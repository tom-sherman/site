import "server-only";
import * as stylex from "@stylexjs/stylex";
import {
  ArrowUpRight,
  Heart,
  type LucideIcon,
  MessageCircle,
  Quote,
  Repeat2,
} from "lucide-react";
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

/** The margin beside the text column, on screens wide enough for one. */
const MARGIN = 140;
const MARGIN_GAP = 40;

const styles = stylex.create({
  thread: {
    listStyle: "none",
    // The posts' hover tint bleeds past the text column, so the text lines
    // up with the title above. Never further than the page's gutter. On
    // wide screens, the posts also reach into the margin to the right.
    marginLeft: {
      default: -16,
      [breakpoints.phone]: -10,
    },
    marginRight: {
      default: -16,
      [breakpoints.phone]: -10,
      [breakpoints.wide]: -(16 + MARGIN_GAP + MARGIN),
    },
  },
  // Each post is set apart by a hairline, with its counts in the margin,
  // and links to itself on Bluesky as a whole.
  post: {
    position: "relative",
    display: {
      default: "flex",
      [breakpoints.wide]: "grid",
    },
    flexDirection: "column",
    gridTemplateColumns: `minmax(0, 1fr) ${MARGIN}px`,
    columnGap: MARGIN_GAP,
    rowGap: 14,
    paddingTop: 22,
    paddingBottom: {
      default: 18,
      [breakpoints.wide]: 22,
    },
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
  content: {
    display: "flex",
    flexDirection: "column",
    rowGap: 14,
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
  // In the margin on wide screens, lined up with the post's first line;
  // otherwise a row under the post.
  aside: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    alignSelf: "start",
    columnGap: 14,
    rowGap: 6,
    // Centred on the text's first line (18px at 1.65).
    paddingTop: {
      default: 0,
      [breakpoints.wide]: 6,
    },
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    lineHeight: 1,
    color: colors.muted,
  },
  // Stretched over the whole post, so clicking anywhere in it that isn't
  // a link or button of its own (see `globals.css`) goes to Bluesky.
  link: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexBasis: {
      default: "auto",
      [breakpoints.wide]: "100%",
    },
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
  count: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  none: {
    opacity: 0.5,
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
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
      <div {...stylex.props(styles.content)}>
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
            <span {...stylex.props(styles.videoLabel)}>
              ▶ Video, on Bluesky
            </span>
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
      </div>
      <div {...stylex.props(styles.aside)}>
        <a
          href={post.url}
          data-stretched
          aria-label={`Post ${position} of ${of}, on Bluesky`}
          title={formatDateTime(post.createdAt)}
          {...stylex.props(styles.link)}
        >
          {position}/{of}
          <ArrowUpRight {...ICON} />
        </a>
        <Count
          icon={MessageCircle}
          n={post.replies}
          one="reply"
          many="replies"
        />
        <Count icon={Repeat2} n={post.reposts} one="repost" many="reposts" />
        <Count icon={Heart} n={post.likes} one="like" many="likes" />
        {post.quotes > 0 && (
          <Count icon={Quote} n={post.quotes} one="quote" many="quotes" />
        )}
      </div>
    </>
  );
}

const ICON = { size: 13, strokeWidth: 1.75, "aria-hidden": true } as const;

/** An icon and a count, read out as `2 replies`. Zero is dimmed. */
function Count({
  icon: Icon,
  n,
  one,
  many,
}: {
  icon: LucideIcon;
  n: number;
  one: string;
  many: string;
}) {
  return (
    <span {...stylex.props(styles.count, n === 0 && styles.none)}>
      <Icon {...ICON} />
      {formatCount(n)}
      <span {...stylex.props(styles.srOnly)}> {n === 1 ? one : many}</span>
    </span>
  );
}
