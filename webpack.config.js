const { EsbuildPlugin } = require("esbuild-loader");
const { DefinePlugin } = require("webpack");
const packagejson = require("./package.json")

module.exports = {
  devtool: "inline-source-map",
  entry: "./src/index.ts",
  output: {
    filename: "bundle.js",
  },
  resolve: {
    extensions: [".ts", ".js"],
    extensionAlias: {
      ".js": [".js", ".ts"],
      ".cjs": [".cjs", ".cts"],
      ".mjs": [".mjs", ".mts"],
    },
  },
  module: {
    rules: [
      { test: /\.([cm]?ts)$/, loader: "esbuild-loader" },
    ],
  },
  target: "node",
  optimization: {
    minimizer: [
      new EsbuildPlugin ({
        keepNames: true,
      }),
    ],
  },
  plugins: [
    new DefinePlugin({
      "process.env.VERSION": JSON.stringify(packagejson.version),
      "process.env.URL": JSON.stringify(packagejson.repository.url),
    }),
  ]
};
