import { readFile, readdir } from "node:fs/promises";
import { Script } from "node:vm";
const root = new URL("../", import.meta.url);
const files = (await readdir(root)).filter(name => name.endsWith(".js"));
for (const file of files) {
  const text = await readFile(new URL(file, root), "utf8");
  new Script(text, { filename: file });
  if (/localStorage\.clear\s*\(/.test(text)) throw new Error(file + ": indiscriminate storage cleanup");
  if (/\/v1\/tracks\/|SONGS\.find\s*\(/.test(text)) throw new Error(file + ": metadata lookup on critical path");
  if (/<<<<<<<|>>>>>>>/.test(text)) throw new Error(file + ": merge conflict");
}
const html = await readFile(new URL("index.html", root), "utf8");
if (/\son\w+=/i.test(html)) throw new Error("Inline event handler");
if (!html.includes("html5-qrcode@2.3.8")) throw new Error("QR dependency not pinned");
for (const [, file] of html.matchAll(/src="([^":]+\.js)"/g)) {
  await readFile(new URL(file, root), "utf8");
}
console.log("PASS syntax: " + files.length + " JS files; HTML script references and regression guards.");
