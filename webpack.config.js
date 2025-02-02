import webpack from "webpack";
import { readFileSync } from "fs";

const packagejson = JSON.parse(readFileSync("./package.json", "utf8"));

export default {
  devtool: "inline-source-map",
  entry: "./src/index.ts",
  output: {
    filename: "bundle.js",
    chunkFormat: "module",
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
      { test: /\.([cm]?ts)$/, loader: "ts-loader", exclude: /node_modules/ },
    ],
  },
  target: "node",
  plugins: [
    new webpack.DefinePlugin({
      "process.env.VERSION": JSON.stringify(packagejson.version),
      "process.env.URL": JSON.stringify(packagejson.repository.url),
    }),
  ],
  experiments: {
    outputModule: true,
  }
};
