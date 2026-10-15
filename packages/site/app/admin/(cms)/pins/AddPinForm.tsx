"use client";

import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import type { Pinnable } from "@/lib/admin/pins";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import { Button } from "../../_components/controls";
import { editPinsAction } from "./actions";

const styles = stylex.create({
  form: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    maxWidth: 720,
  },
  select: {
    flexGrow: 1,
    flexBasis: 280,
    minWidth: 0,
    paddingBlock: 8,
    paddingInline: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.chipBorder,
    borderRadius: 0,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
  },
});

/** Pins one of my documents, at the end of the list. */
export function AddPinForm({ documents }: { documents: Pinnable[] }) {
  const [uri, setUri] = useState("");
  return (
    <form action={editPinsAction} {...stylex.props(styles.form)}>
      <input type="hidden" name="op" value="add" />
      <select
        name="uri"
        aria-label="Document"
        value={uri}
        onChange={(event) => setUri(event.target.value)}
        required
        {...stylex.props(styles.select)}
      >
        <option value="">Choose a post or thread…</option>
        {documents.map((doc) => (
          <option key={doc.uri} value={doc.uri}>
            {doc.title} ({doc.kind}, {doc.publishedAt.slice(0, 4)})
          </option>
        ))}
      </select>
      <Button type="submit" variant="primary" disabled={!uri}>
        Pin
      </Button>
    </form>
  );
}
