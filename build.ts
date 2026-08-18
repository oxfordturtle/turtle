import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";

// build javascript
console.log("Building src/client/index.ts...");
const result = await esbuild.build({
  entryPoints: ["./src/client/index.ts"],
  outfile: "./assets/build/index.js",
  bundle: true,
  platform: "browser",
  minify: true,
  plugins: [...denoPlugins({ configPath: `${Deno.cwd()}/deno.json` })],
});
console.log("done!");
console.log(result.errors);

// fetch font awesome from its npm package (not vendored - pulled fresh on
// each build, same as the esbuild dependency above) and drop its solid-style
// webfonts into assets/build/webfonts/, which the "build" asset directory
// already serves
console.log("Fetching Font Awesome...");
const [faBase, faSolid, faWoff2, faTtf] = await Promise.all([
  import("@fortawesome/fontawesome-free/css/fontawesome.css", {
    with: { type: "text" },
  }),
  import("@fortawesome/fontawesome-free/css/solid.css", {
    with: { type: "text" },
  }),
  import("@fortawesome/fontawesome-free/webfonts/fa-solid-900.woff2", {
    with: { type: "bytes" },
  }),
  import("@fortawesome/fontawesome-free/webfonts/fa-solid-900.ttf", {
    with: { type: "bytes" },
  }),
]);
await Deno.mkdir("./assets/build/webfonts", { recursive: true });
await Deno.writeFile(
  "./assets/build/webfonts/fa-solid-900.woff2",
  faWoff2.default,
);
await Deno.writeFile("./assets/build/webfonts/fa-solid-900.ttf", faTtf.default);
// the package's own css points at its sibling ../webfonts/ directory; ours
// lives alongside screen.css itself, one level shallower
const faCss =
  faBase.default + faSolid.default.replaceAll("../webfonts/", "webfonts/");
const faBundle = await esbuild.transform(faCss, {
  loader: "css",
  minify: true,
});
console.log("done!");

// build css
console.log("Building style/screen.css...");
const screenBundle = await esbuild.build({
  entryPoints: ["./style/screen.css"],
  bundle: true,
  minify: true,
  write: false,
  external: ["*.jpg", "*.png"],
});
await Deno.writeTextFile(
  "./assets/build/screen.css",
  faBundle.code + screenBundle.outputFiles[0].text,
);
console.log("done!");

esbuild.stop();
Deno.exit();
