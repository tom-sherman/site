import "server-only";
import {
  type Config,
  parse,
  type RenderableTreeNode,
  type Schema,
  Tag,
  transform,
} from "@markdoc/markdoc";
import { Fragment, type ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";
import { TweetEmbed } from "./PostEmbed";
import {
  A,
  Blockquote,
  Body,
  Heading,
  headingIds,
  Hr,
  Img,
  InlineCode,
  List,
  ListItem,
  P,
  Strong,
} from "./Prose";

/**
 * A post written in Markdown, with Markdoc's `{% tweet link="…" /%}` for
 * embedded tweets. Markdoc's tree is turned into the prose components by
 * name; anything without one (raw HTML, tables) renders as its text alone.
 */
export function Markdown({ content }: { content: string }) {
  const tree = transform(parse(content), {
    nodes: {
      heading: headingSchema(),
      fence: fenceSchema,
    },
    tags: { tweet: tweetSchema },
  });
  return <Body>{render(tree)}</Body>;
}

type Attributes = Record<string, unknown>;

/** Markdoc's element names, and what each becomes. */
const ELEMENTS: Record<
  string,
  (attributes: Attributes, children: ReactNode) => ReactNode
> = {
  article: (_, children) => children,
  p: (_, children) => <P>{children}</P>,
  heading: ({ level, id }, children) => (
    // `#` is the post's title, so the body's headings start at `##`.
    <Heading level={clampLevel(level)} id={id as string}>
      {children}
    </Heading>
  ),
  a: ({ href }, children) => <A href={href}>{children}</A>,
  strong: (_, children) => <Strong>{children}</Strong>,
  em: (_, children) => <em>{children}</em>,
  s: (_, children) => <s>{children}</s>,
  code: (_, children) => <InlineCode>{children}</InlineCode>,
  codeblock: ({ code, language }) => (
    <CodeBlock code={code as string} language={language as string} />
  ),
  blockquote: (_, children) => <Blockquote>{children}</Blockquote>,
  ul: (_, children) => <List>{children}</List>,
  ol: ({ start }, children) => (
    <List ordered start={start as number}>
      {children}
    </List>
  ),
  li: (_, children) => <ListItem>{children}</ListItem>,
  hr: () => <Hr />,
  br: () => <br />,
  img: ({ src, alt }) => <Img src={src} alt={alt as string} />,
  tweet: ({ id, link }) =>
    id ? (
      <TweetEmbed id={id as string} link={link as string} />
    ) : (
      <P>
        <A href={link}>{link as string}</A>
      </P>
    ),
};

function render(node: RenderableTreeNode, key?: number): ReactNode {
  if (Array.isArray(node)) return node.map(render);
  if (!Tag.isTag(node)) {
    return typeof node === "string" || typeof node === "number" ? node : null;
  }
  const children = node.children.map(render);
  const element = ELEMENTS[node.name];
  if (!element) console.warn(`Rendering <${node.name}> as text`);
  return (
    <Fragment key={key}>
      {element ? element(node.attributes, children) : children}
    </Fragment>
  );
}

function clampLevel(level: unknown): 2 | 3 | 4 {
  return Math.min(4, Math.max(2, Number(level) || 2)) as 2 | 3 | 4;
}

/** Headings get ids from their text, so sections can be linked to. */
function headingSchema(): Schema {
  const idFor = headingIds();
  return {
    children: ["inline"],
    attributes: { level: { type: Number, required: true } },
    transform(node, config: Config) {
      const children = node.transformChildren(config);
      return new Tag(
        "heading",
        { level: node.attributes.level, id: idFor(textOf(children)) },
        children,
      );
    },
  };
}

function textOf(nodes: RenderableTreeNode[]): string {
  return nodes
    .map((node) =>
      typeof node === "string" || typeof node === "number"
        ? String(node)
        : Tag.isTag(node)
          ? textOf(node.children)
          : "",
    )
    .join("");
}

const fenceSchema: Schema = {
  attributes: {
    content: { type: String },
    language: { type: String },
  },
  transform(node) {
    return new Tag("codeblock", {
      code: node.attributes.content,
      language: node.attributes.language,
    });
  },
};

const TWEET_URL =
  /^https:\/\/(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/([0-9]+)/;

const tweetSchema: Schema = {
  selfClosing: true,
  attributes: { link: { type: String, required: true } },
  transform(node) {
    const link = String(node.attributes.link);
    return new Tag("tweet", { link, id: TWEET_URL.exec(link)?.[1] });
  },
};
