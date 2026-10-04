const babelConfig = require("./babel.config");

module.exports = {
  plugins: {
    "@stylexjs/postcss-plugin": {
      include: [
        // when using a src folder:
        "src/**/*.{js,jsx,ts,tsx}",
        // app router:
        "app/**/*.{js,jsx,ts,tsx}",
        // pages router:
        "pages/**/*.{js,jsx,ts,tsx}",
        // other top-level folders:
        "components/**/*.{js,jsx,ts,tsx}",
      ],
      babelConfig: {
        babelrc: false,
        parserOpts: { plugins: ["typescript", "jsx"] },
        plugins: babelConfig.plugins,
      },
      useCSSLayers: true,
    },
    autoprefixer: {},
  },
};
