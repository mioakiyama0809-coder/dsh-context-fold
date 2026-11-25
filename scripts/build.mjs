import esbuild from "esbuild";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

async function build() {
  await mkdir(resolve(root, "lib"), { recursive: true });

  // 1. Host bundle (ESM for Node / DSH host)
  await esbuild.build({
    entryPoints: [resolve(root, "src/host/index.js")],
    outfile: resolve(root, "lib/index.js"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    sourcemap: true,
    external: [
      "@deepseek-ai/*",
      "node:*",
    ],
  });

  // 2. Client bundle (CJS wrapped in DSH's window.__ModuleLoader__.load)
  const clientRes = await esbuild.build({
    entryPoints: [resolve(root, "src/client/index.jsx")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@deepseek-ai/*",
    ],
  });

  const cjsCode = clientRes.outputFiles[0].text;
  const wrappedClient = [
    `window.__ModuleLoader__.load({`,
    `  id: "dsh-context-fold",`,
    `  factory: (require) => {`,
    `    var module = { exports: {} };`,
    `    var exports = module.exports;`,
    cjsCode,
    `    return module.exports;`,
    `  }`,
    `});`,
    ``,
  ].join("\n");

  await writeFile(resolve(root, "lib/client.js"), wrappedClient, "utf8");
  console.log("Built lib/index.js and lib/client.js successfully.");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
