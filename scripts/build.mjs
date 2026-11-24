// Bundle the local ES module graph into one classic script for file:// playback.
// The project uses relative, static imports, named exports and no runtime loaders.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Script } from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({ options: {
  out: { type: "string" }, audio: { type: "string" }, "audio-credits": { type: "string" },
  check: { type: "boolean" }
} });
const output = values.out ? path.resolve(values.out) : path.join(root, "index.html");
if (values.audio && !values.out) throw Error("内嵌配乐时，请用 --out 指定个人版 HTML 的输出路径。");
if (values["audio-credits"] && !values.audio) throw Error("--audio-credits 需与 --audio 一起使用。");

const scripts = [];
const registry = new Map();
const visiting = new Set();
const read = filename => fs.readFileSync(filename, "utf8");
const fromRoot = filename => path.relative(root, filename).split(path.sep).join("/");
const fromNames = list => list.split(",").map(name => name.trim()).filter(Boolean);
const explicitImports = /^import\s+(\*\s+as\s+\w+|\{[^}]*\})\s+from\s+(["'])([^"'\n]+)\2\s*;/gm;

function includeModule(filename) {
  if (registry.has(filename)) return registry.get(filename);
  const name = fromRoot(filename);
  if (visiting.has(filename)) throw Error("发现循环模块依赖：" + name);
  visiting.add(filename);
  const exported = new Map();
  const register = (original, alias = original) => {
    if (exported.has(alias)) throw Error("重复导出 " + alias + "，位于 " + name);
    exported.set(alias, original);
  };
  let source = read(filename).replace(explicitImports, (_, clause, quote, specifier) => {
    if (!specifier.startsWith(".")) throw Error("离线版本需要本地导入：" + specifier);
    const imported = includeModule(path.resolve(path.dirname(filename), specifier));
    if (clause.startsWith("*")) return "const " + clause.split(/\s+/)[2] + " = " + imported + ";";
    const bindings = fromNames(clause.slice(1, -1)).map(text => text.replace(/\s+as\s+/, ": "));
    return "const { " + bindings.join(", ") + " } = " + imported + ";";
  });
  source = source.replace(/^export\s*\{([^}]*)\}\s*;/gm, (_, names) => {
    for (const text of fromNames(names)) register(...text.split(/\s+as\s+/));
    return "";
  });
  source = source.replace(/^export\s+((?:async\s+)?function|class|const|let)\s+(\w+)/gm, (_, kind, identifier) => {
    register(identifier);
    return kind + " " + identifier;
  });
  if (/^(?:import|export)\s/m.test(source)) throw Error("暂不支持的模块声明：" + name);
  const id = "module" + (registry.size + 1);
  registry.set(filename, id);
  visiting.delete(filename);
  const exports = [...exported].map(([alias, local]) => alias === local ? local : alias + ": " + local);
  scripts.push("// " + name + "\nconst " + id + " = (() => {\n" + source.trim() + "\nreturn { " + exports.join(", ") + " };\n})();");
  return id;
}
includeModule(path.join(root, "src/main.js"));
const program = '(() => {\n"use strict";\n' + scripts.join("\n\n") + "\n})();";
new Script(program, { filename: "windborne.bundle.js" });

function escapeScript(text) { return text.replace(/<\/script/gi, "<\\/script"); }
function dataURL(filename, mime) {
  return "data:" + mime + ";base64," + fs.readFileSync(filename).toString("base64");
}
function replaceOnce(source, needle, value) {
  if (source.split(needle).length !== 2) throw Error("页面模板中的标记已改变：" + needle);
  return source.replace(needle, () => value);
}

let css = read(path.join(root, "src/style.css"));
css = replaceOnce(css, "../assets/loading.jpg", dataURL(path.join(root, "assets/loading.jpg"), "image/jpeg"));
let html = read(path.join(root, "src/page.html"));
html = replaceOnce(html, '<link rel="stylesheet" href="./style.css">', "<style>\n" + css + "</style>");
html = replaceOnce(html, '<script type="module" src="./main.js"></script>', '<script id="film-runtime">\n' + escapeScript(program) + "\n</script>");
let notices = read(path.join(root, "THIRD_PARTY_NOTICES.md"));
if (values.audio) {
  const formats = { ".mp3": "mpeg", ".m4a": "mp4", ".mp4": "mp4", ".aac": "aac", ".ogg": "ogg", ".opus": "ogg", ".wav": "wav", ".flac": "flac", ".webm": "webm" };
  const mime = formats[path.extname(values.audio).toLowerCase()];
  if (!mime) throw Error("请选择 MP3、M4A、AAC、WAV、OGG、Opus、FLAC 或 WebM 音频。");
  html = replaceOnce(html, '<audio id="soundtrack" preload="metadata"></audio>',
    '<audio id="soundtrack" preload="metadata" src="' + dataURL(values.audio, "audio/" + mime) + '"></audio>');
  if (values["audio-credits"]) notices += "\n" + read(values["audio-credits"]);
}
html = replaceOnce(html, "</body>", '<script id="third-party-notices" type="text/plain">\n' + escapeScript(notices) + "\n</script>\n</body>");
if (values.check) {
  if (!fs.existsSync(output) || read(output) !== html) throw Error("构建结果与发布文件不同，请重新运行 npm run build。");
  console.log("发布文件与源码一致。");
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html, "utf8");
  console.log(output + " (" + scripts.length + " modules, " + Buffer.byteLength(html) + " bytes)");
}
