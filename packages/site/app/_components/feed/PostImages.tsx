"use client";

import * as stylex from "@stylexjs/stylex";
import { useRef, useState } from "react";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { PostImage } from "@/lib/data/types";

const styles = stylex.create({
  // A film strip: one row, scrolling sideways rather than wrapping.
  strip: {
    display: "flex",
    gap: 8,
    marginTop: 10,
    paddingBottom: 4,
    overflowX: "auto",
    listStyleType: "none",
    scrollbarWidth: "thin",
  },
  item: {
    flexShrink: 0,
  },
  thumbButton: {
    display: "block",
    width: 88,
    aspectRatio: "1",
    padding: 0,
    overflow: "hidden",
    cursor: "zoom-in",
    backgroundColor: colors.hoverTint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: colors.cardBorder,
      ":hover": colors.inkBorder,
    },
    borderRadius: 2,
    outlineOffset: 2,
  },
  thumb: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  // Fills the viewport: the image above, its caption and controls pinned
  // underneath, so loading or switching images doesn't move them.
  lightbox: {
    // Only while modal: between closing and unmounting it'd sit in the page.
    display: {
      default: "none",
      ":modal": "flex",
    },
    width: "100%",
    maxWidth: "none",
    height: "100%",
    maxHeight: "none",
    flexDirection: "column",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    "::backdrop": {
      backgroundColor: "oklch(0.15 0.01 95 / 0.9)",
    },
  },
  // Takes whatever height the bar leaves, so a click anywhere off the image
  // lands on it.
  stage: {
    display: "flex",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
    padding: 16,
  },
  full: {
    display: "block",
    minHeight: 0,
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
  },
  bar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    rowGap: 10,
    columnGap: 24,
    paddingBlock: 12,
    paddingInline: 16,
    backgroundColor: colors.surface,
    color: colors.ink,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.cardBorder,
  },
  // Every image's caption in one cell, only the current one visible, so the
  // bar is as tall as the longest and doesn't change height between images.
  captions: {
    display: "grid",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "40ch",
    minWidth: 0,
  },
  caption: {
    gridRow: 1,
    gridColumn: 1,
    maxWidth: "80ch",
    lineHeight: 1.5,
    textWrap: "pretty",
  },
  hidden: {
    visibility: "hidden",
  },
  controls: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: 16,
    marginLeft: "auto",
  },
  control: {
    appearance: "none",
    cursor: {
      default: "pointer",
      ":disabled": "default",
    },
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontFamily: "inherit",
    fontSize: "inherit",
    color: "inherit",
    opacity: {
      default: 1,
      ":disabled": 0.35,
    },
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
    textUnderlineOffset: 3,
  },
  count: {
    color: colors.muted,
  },
});

/**
 * A post's images as square thumbnails, in a strip that scrolls sideways when
 * there's more than fits. Clicking one opens it full size in a lightbox.
 */
export function PostImages({ images }: { images: PostImage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  // Through the dialog's own close, so focus goes back to the thumbnail.
  const close = () => dialog.current?.close();

  return (
    <>
      <ul {...stylex.props(styles.strip)}>
        {images.map((image, i) => (
          <li key={image.fullsize} {...stylex.props(styles.item)}>
            <button
              type="button"
              aria-label={`View image ${i + 1} of ${images.length}`}
              onClick={() => setOpen(i)}
              {...stylex.props(styles.thumbButton)}
            >
              {/* Remote and already resized by Bluesky's CDN, so not run
                  through next/image's optimizer. */}
              {/* oxlint-disable-next-line nextjs/no-img-element */}
              <img
                src={image.thumb}
                alt={image.alt}
                loading="lazy"
                {...stylex.props(styles.thumb)}
              />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        // Clicking off the image and the arrow keys are shortcuts for the
        // buttons inside.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <dialog
          ref={(el) => {
            dialog.current = el;
            if (el && !el.open) el.showModal();
          }}
          aria-label={`Image ${open + 1} of ${images.length}`}
          onClose={() => setOpen(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget || e.target === stage.current) {
              close();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" && open > 0) setOpen(open - 1);
            if (e.key === "ArrowRight" && open < images.length - 1) {
              setOpen(open + 1);
            }
          }}
          {...stylex.props(styles.lightbox)}
        >
          <div ref={stage} {...stylex.props(styles.stage)}>
            {/* oxlint-disable-next-line nextjs/no-img-element */}
            <img
              src={images[open].fullsize}
              alt={images[open].alt}
              {...stylex.props(styles.full)}
            />
          </div>
          <div {...stylex.props(styles.bar)}>
            {images.some((image) => image.alt) && (
              <div {...stylex.props(styles.captions)}>
                {images.map((image, i) => (
                  <p
                    key={image.fullsize}
                    {...stylex.props(
                      styles.caption,
                      i !== open && styles.hidden,
                    )}
                  >
                    {image.alt}
                  </p>
                ))}
              </div>
            )}
            <div {...stylex.props(styles.controls)}>
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    disabled={open === 0}
                    onClick={() => setOpen(open - 1)}
                    {...stylex.props(styles.control)}
                  >
                    ← prev
                  </button>
                  <span {...stylex.props(styles.count)}>
                    {open + 1} / {images.length}
                  </span>
                  <button
                    type="button"
                    disabled={open === images.length - 1}
                    onClick={() => setOpen(open + 1)}
                    {...stylex.props(styles.control)}
                  >
                    next →
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={close}
                {...stylex.props(styles.control)}
              >
                close ✕
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
