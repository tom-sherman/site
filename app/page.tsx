import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  heading: {
    color: "blue",
    fontSize: "24px",
  },
});

export default function Home() {
  return <h1 {...stylex.props(styles.heading)}>Hello, World!</h1>;
}
