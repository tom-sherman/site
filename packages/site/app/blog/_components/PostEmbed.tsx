import "server-only";
import * as stylex from "@stylexjs/stylex";
import { Avatar } from "@/lib/components/Avatar";
import { Card, CardHeader } from "@/lib/components/Card";
import { Glyph } from "@/lib/components/Glyph";
import { RichText } from "@/lib/components/RichText";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import {
  getBskyEmbed,
  getTweetEmbed,
  type SocialPost,
} from "@/lib/data/embeds";
import { formatDateTime } from "@/lib/time";
import { A, P } from "./Prose";

const styles = stylex.create({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    paddingTop: 14,
    paddingInline: 18,
    paddingBottom: 18,
  },
  author: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: fontSizes.body,
    lineHeight: 1.2,
  },
  name: {
    fontWeight: 600,
    color: colors.ink,
  },
  handle: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  text: {
    fontSize: 16,
    lineHeight: 1.5,
    color: colors.ink,
    whiteSpace: "pre-wrap",
  },
  // Scaled to fit, never cropped: wide images fill the card, tall and
  // square ones keep their shape at up to 420px high. Not stretched by the
  // column it's in.
  image: {
    display: "block",
    alignSelf: "flex-start",
    maxWidth: "100%",
    maxHeight: 420,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.rule,
  },
});

const NETWORKS = {
  bluesky: { glyph: "bluesky", label: "Bluesky post", site: "Bluesky" },
  x: { glyph: "x", label: "Post on X", site: "X" },
} as const;

export async function BskyEmbed({ uri }: { uri: string }) {
  const post = await getBskyEmbed(uri).catch((error: unknown) => {
    console.error(`Couldn't get Bluesky post ${uri}`, error);
    return null;
  });
  if (post) return <PostEmbed post={post} />;
  const [, , did, , rkey] = uri.split("/");
  return (
    <Fallback
      href={`https://bsky.app/profile/${did}/post/${rkey}`}
      network="bluesky"
    />
  );
}

export async function TweetEmbed({ id, link }: { id: string; link: string }) {
  const post = await getTweetEmbed(id);
  return post ? (
    <PostEmbed post={post} />
  ) : (
    <Fallback href={link} network="x" />
  );
}

/** A post quoted in a blog post, linking to the original. */
function PostEmbed({ post }: { post: SocialPost }) {
  const network = NETWORKS[post.network];
  return (
    <Card href={post.url}>
      <CardHeader
        glyph={network.glyph}
        label={network.label}
        meta={formatDateTime(post.createdAt)}
      />
      <div {...stylex.props(styles.body)}>
        <div {...stylex.props(styles.author)}>
          <Avatar name={post.author.name} image={post.author.avatar} />
          <span>
            <span {...stylex.props(styles.name)}>{post.author.name}</span>{" "}
            <span {...stylex.props(styles.handle)}>{post.author.handle}</span>
          </span>
        </div>
        <p {...stylex.props(styles.text)}>
          <RichText text={post.text} facets={post.facets} linked={false} />
        </p>
        {post.image?.url && (
          // A thumbnail on Bluesky's or X's CDN; not run through next/image.
          // oxlint-disable-next-line nextjs/no-img-element
          <img
            src={post.image.url}
            alt={post.image.alt}
            loading="lazy"
            {...stylex.props(styles.image)}
          />
        )}
      </div>
    </Card>
  );
}

/** When the post can't be shown: gone, or the network won't serve it. */
function Fallback({
  href,
  network,
}: {
  href: string;
  network: keyof typeof NETWORKS;
}) {
  return (
    <P>
      <A href={href}>
        View the post on {NETWORKS[network].site} <Glyph name="external" />
      </A>
    </P>
  );
}
