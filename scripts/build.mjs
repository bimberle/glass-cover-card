import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cardsDirectory = join(root, "cards");
const outputDirectory = join(root, "dist");
const sharedTypes = join(cardsDirectory, "glass-types.d.ts");
const sharedButtonStyles = ts.transpileModule(await readFile(join(cardsDirectory, "glass-button-styles.ts"), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

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
  const sourceDirectory = join(cardsDirectory, directory.name);
  const typescriptSource = join(sourceDirectory, `${directory.name}.ts`);
  const javascriptSource = join(sourceDirectory, fileName);
  const source = await readdir(sourceDirectory).then((files) => files.includes(`${directory.name}.ts`) ? typescriptSource : javascriptSource);
  const output = join(outputDirectory, fileName);
  if (source.endsWith(".ts")) {
    const program = ts.createProgram([source, sharedTypes], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      strict: false,
      skipLibCheck: true,
      noEmitOnError: true,
      outDir: outputDirectory,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) {
      throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (name) => name,
        getNewLine: () => "\n",
      }));
    }
    const result = program.emit();
    if (result.emitSkipped) throw new Error(`TypeScript compilation failed for ${source}`);
    let compiledSource = await readFile(output, "utf8");
    if (["glass-button-card.js", "glass-navigation-card.js"].includes(fileName)) {
      compiledSource = `${sharedButtonStyles}\n${compiledSource}`;
      await writeFile(output, compiledSource);
    }
    sources.set(fileName, compiledSource);
  } else {
    sources.set(fileName, await readFile(source, "utf8"));
    await copyFile(source, output);
  }
  outputs.push(fileName);
}

if (!outputs.includes("glass-cover-card.js")) {
  throw new Error("HACS erwartet glass-cover-card.js als Einstieg passend zum Repository-Namen.");
}

const entrypointCards = ["glass-cover-card.js", "glass-button-card.js", "glass-panel-card.js", "glass-rgb-card.js", "glass-room-card.js", "glass-navigation-card.js", "glass-ventilation-card.js", "glass-timer-bar-card.js", "glass-text-card.js", "glass-value-card.js", "glass-splitter-card.js"];
for (const fileName of entrypointCards) {
  if (!sources.has(fileName)) throw new Error(`Fehlende Einstiegskarte: ${fileName}`);
}
const combinedEntrypoint = entrypointCards
  .map((fileName) => `(() => {\n${sources.get(fileName)}\n})();`)
  .join("\n\n");
await writeFile(join(outputDirectory, "glass-cover-card.js"), combinedEntrypoint);

for (const [alias, source] of [["glass-buttons-card.js", "glass-button-card.js"], ["glass-timer-card.js", "glass-timer-bar-card.js"]]) {
  await copyFile(join(outputDirectory, source), join(outputDirectory, alias));
  outputs.push(alias);
}

console.log(`Built ${outputs.length} cards: ${outputs.join(", ")}`);