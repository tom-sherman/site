import * as stylex from "@stylexjs/stylex";
import type { MyPost } from "@/lib/admin/threads";
import { Glyph } from "@/lib/components/Glyph";
import { TextLink } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import { formatDateTime } from "@/lib/time";
import { ButtonLink } from "./controls";

const styles = stylex.create({
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
    gap: 16,
    listStyle: "none",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    height: "100%",
    padding: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  meta: {
    display: "flex",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 4,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  text: {
    flexGrow: 1,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 6,
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: fontSizes.body,
    lineHeight: 1.45,
    color: colors.body,
  },
  empty: {
    color: colors.muted,
    fontStyle: "italic",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
  },
});

/** My Bluesky posts as cards, each with a way to publish it as a thread. */
export function MyPostGrid({ posts }: { posts: MyPost[] }) {
  return (
    <ul {...stylex.props(styles.grid)}>
      {posts.map((post) => (
        <li key={post.uri}>
          <MyPostCard post={post} />
        </li>
      ))}
    </ul>
  );
}

function MyPostCard({ post }: { post: MyPost }) {
  return (
    <article {...stylex.props(styles.card)}>
      <p {...stylex.props(styles.meta)}>
        <time dateTime={new Date(post.createdAt).toISOString()}>
          {formatDateTime(post.createdAt)}
        </time>
        <span>
          <Glyph name="reply" /> {post.replies}
        </span>
        <span>
          <Glyph name="liked" /> {post.likes}
        </span>
        {post.images > 0 && (
          <span>
            {post.images} {post.images === 1 ? "image" : "images"}
          </span>
        )}
      </p>
      <p {...stylex.props(styles.text, !post.text && styles.empty)}>
        {post.text || "No text"}
      </p>
      <div {...stylex.props(styles.actions)}>
        {post.publishedAt ? (
          <TextLink href={post.publishedAt}>Published as a thread</TextLink>
        ) : (
          <ButtonLink
            href={`/admin/threads/new?root=${encodeURIComponent(post.uri)}`}
          >
            Publish as a thread
          </ButtonLink>
        )}
        <TextLink href={post.url} variant="quiet">
          Bluesky <Glyph name="external" />
        </TextLink>
      </div>
    </article>
  );
}
