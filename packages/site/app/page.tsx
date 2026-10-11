import * as stylex from "@stylexjs/stylex";
import { Suspense } from "react";
import { Container } from "@/lib/components/Container";
import { breakpoints, layout } from "@/lib/components/tokens.stylex";
import { getFeed } from "@/lib/data/feed";
import { getPinned } from "@/lib/data/pinned";
import { getProfile } from "@/lib/data/profile";
import { Feed } from "./_components/feed/Feed";
import { Footer } from "./_components/Footer";
import { Header } from "./_components/Header";
import { NowBar } from "./_components/NowBar";
import { NowBarShell } from "./_components/NowBarShell";
import { PinnedRail } from "./_components/PinnedRail";

const styles = stylex.create({
  main: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [breakpoints.wide]: "minmax(0, 1fr) 300px",
    },
    alignItems: "start",
    rowGap: 48,
    columnGap: 88,
    paddingBottom: 112,
  },
  // The rail comes first in the source so it sits above the feed on narrow
  // screens; on wide screens it moves to the right and stays in view.
  rail: {
    gridColumn: {
      default: null,
      [breakpoints.wide]: 2,
    },
    gridRow: {
      default: null,
      [breakpoints.wide]: 1,
    },
    position: {
      default: "static",
      [breakpoints.wide]: "sticky",
    },
    top: `calc(${layout.nowBarHeight} + 24px)`,
    paddingTop: 12,
  },
  feed: {
    gridColumn: {
      default: null,
      [breakpoints.wide]: 1,
    },
    gridRow: {
      default: null,
      [breakpoints.wide]: 1,
    },
    minWidth: 0,
  },
});

export default async function Home() {
  const [profile, feed, pinned] = await Promise.all([
    getProfile(),
    getFeed(),
    // Pins are extras; a broken PDS shouldn't take the page down with it.
    getPinned().catch((error: unknown) => {
      console.error("Couldn't get pinned items", error);
      return [];
    }),
  ]);

  return (
    <>
      <Suspense fallback={<NowBarShell />}>
        <NowBar />
      </Suspense>
      <Header
        profile={profile}
        page="feed"
        lastActivity={
          feed.items[0] && { at: feed.items[0].publishedAt, asOf: feed.asOf }
        }
      />
      <Container as="main" style={styles.main}>
        <div {...stylex.props(styles.rail)}>
          <PinnedRail items={pinned} asOf={feed.asOf} />
        </div>
        <div {...stylex.props(styles.feed)}>
          <Feed
            items={feed.items}
            asOf={feed.asOf}
            olderHref={feed.olderCursor && `/?before=${feed.olderCursor}`}
          />
        </div>
      </Container>
      <Footer
        name={profile.person.name}
        year={new Date(feed.asOf).getFullYear()}
      />
    </>
  );
}
