import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cardsDirectory = join(root, "cards");
const outputDirectory = join(root, "dist");

await mkdir(outputDirectory, { recursive: true });
for (const name of await readdir(outputDirectory)) {
  if (name.endsWith(".js")) await rm(join(outputDirectory, name));
}

const cardDirectories = await readdir(cardsDirectory, { withFileTypes: true });
const outputs = [];
const sources = new Map();
for (const directory of cardDirectories) {
  if (!directory.isDirectory()) continue;
  const fileName = `${directory.name}.js`;
  const source = join(cardsDirectory, directory.name, fileName);
  const output = join(outputDirectory, fileName);
  sources.set(fileName, await readFile(source, "utf8"));
  await copyFile(source, output);
  outputs.push(fileName);
}

if (!outputs.includes("glass-cover-card.js")) {
  throw new Error("HACS erwartet glass-cover-card.js als Einstieg passend zum Repository-Namen.");
}

const entrypointCards = ["glass-cover-card.js", "glass-button-card.js"];
for (const fileName of entrypointCards) {
  if (!sources.has(fileName)) throw new Error(`Fehlende Einstiegskarte: ${fileName}`);
}
const combinedEntrypoint = entrypointCards
  .map((fileName) => `(() => {\n${sources.get(fileName)}\n})();`)
  .join("\n\n");
await writeFile(join(outputDirectory, "glass-cover-card.js"), combinedEntrypoint);

console.log(`Built ${outputs.length} cards: ${outputs.join(", ")}`);