import * as stylex from "@stylexjs/stylex";
import type { Metadata } from "next";
import { getPins, MAX_PINS, type Pin, type Pinnable } from "@/lib/admin/pins";
import { Eyebrow, Rule } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import { Button } from "../../_components/controls";
import { PageHeading } from "../../_components/PageHeading";
import { editPinsAction } from "./actions";
import { AddPinForm } from "./AddPinForm";

export const metadata: Metadata = { title: "Pins" };

const styles = stylex.create({
  section: {
    marginBottom: 48,
  },
  sectionHeading: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  count: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  list: {
    listStyle: "none",
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 16,
    rowGap: 8,
    paddingBlock: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "dashed",
    borderBottomColor: colors.rule,
  },
  position: {
    width: 24,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  what: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 1.15,
  },
  missing: {
    color: colors.muted,
    fontStyle: "italic",
  },
  meta: {
    marginTop: 2,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  buttons: {
    display: "flex",
    gap: 6,
  },
  empty: {
    paddingBlock: 12,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
});

/** The homepage's pins: their order, which are cards, and what else to pin. */
export default async function PinsPage() {
  const { pins, documents } = await getPins();
  const pinned = new Set(pins.map((pin) => pin.uri));
  return (
    <>
      <PageHeading title="Pins" />
      <section {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.sectionHeading)}>
          <Eyebrow as="h2">On the homepage</Eyebrow>
          <Rule />
          <span {...stylex.props(styles.count)}>
            {pins.length}/{MAX_PINS}
          </span>
        </div>
        {pins.length === 0 ? (
          <p {...stylex.props(styles.empty)}>Nothing pinned.</p>
        ) : (
          <ol {...stylex.props(styles.list)}>
            {pins.map((pin, i) => (
              <PinRow
                key={pin.uri}
                pin={pin}
                position={i + 1}
                last={i === pins.length - 1}
              />
            ))}
          </ol>
        )}
      </section>
      {pins.length < MAX_PINS && (
        <section {...stylex.props(styles.section)}>
          <div {...stylex.props(styles.sectionHeading)}>
            <Eyebrow as="h2">Pin something</Eyebrow>
            <Rule />
          </div>
          <AddPinForm
            documents={documents.filter((doc) => !pinned.has(doc.uri))}
          />
        </section>
      )}
    </>
  );
}

function PinRow({
  pin,
  position,
  last,
}: {
  pin: Pin;
  position: number;
  last: boolean;
}) {
  return (
    <li {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.position)}>{position}</span>
      <div {...stylex.props(styles.what)}>
        <p {...stylex.props(styles.title, !pin.document && styles.missing)}>
          {pin.document?.title ?? "Gone"}
        </p>
        <p {...stylex.props(styles.meta)}>
          {pin.document ? describe(pin.document) : pin.uri}
          {pin.hero && " · card"}
        </p>
      </div>
      <form action={editPinsAction} {...stylex.props(styles.buttons)}>
        <input type="hidden" name="uri" value={pin.uri} />
        <Button
          type="submit"
          name="op"
          value="up"
          disabled={position === 1}
          aria-label="Move up"
        >
          ↑
        </Button>
        <Button
          type="submit"
          name="op"
          value="down"
          disabled={last}
          aria-label="Move down"
        >
          ↓
        </Button>
        <Button
          type="submit"
          name="op"
          value="hero"
          aria-pressed={pin.hero}
          variant={pin.hero ? "primary" : "secondary"}
        >
          Card
        </Button>
        <Button type="submit" name="op" value="remove" variant="danger">
          Unpin
        </Button>
      </form>
    </li>
  );
}

function describe(doc: Pinnable) {
  return `${doc.kind} · ${doc.publishedAt.slice(0, 10)}`;
}
