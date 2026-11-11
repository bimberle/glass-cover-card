import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
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
for (const directory of cardDirectories) {
  if (!directory.isDirectory()) continue;
  const fileName = `${directory.name}.js`;
  const source = join(cardsDirectory, directory.name, fileName);
  const output = join(outputDirectory, fileName);
  await copyFile(source, output);
  outputs.push(fileName);
}

if (!outputs.includes("glass-cover-card.js")) {
  throw new Error("HACS erwartet glass-cover-card.js als Einstieg passend zum Repository-Namen.");
}

console.log(`Built ${outputs.length} cards: ${outputs.join(", ")}`);