// Deterministic renderer for qwen-studio.desktop.
// The AppImage bundler copies bundle.linux.appimage.files verbatim into the
// AppDir BEFORE any handlebars rendering, and linuxdeploy validates the
// desktop file (fails on raw {{icon}} placeholders). So we render it here at
// build time with values taken from tauri.conf.json. deb/rpm templates are
// unaffected: they render their own copy via the bundler's handlebars engine.
const fs = require("fs");
const path = require("path");

const root = __dirname;
const conf = JSON.parse(fs.readFileSync(path.join(root, "tauri.conf.json"), "utf8"));
const productName = conf.productName || "Qwen Studio";
const comment =
  (conf.bundle && conf.bundle.shortDescription) ||
  "Open-source Qwen AI desktop client with MCP support";

let s = fs.readFileSync(path.join(root, "qwen-studio.desktop"), "utf8");
s = s.replace(/\{\{product_name\}\}/g, productName);
s = s.replace(/\{\{comment\}\}/g, comment);
s = s.replace(/\{\{exec\}\}/g, `"${productName}" %U`);
s = s.replace(/\{\{icon\}\}/g, productName.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
fs.writeFileSync(path.join(root, "qwen-studio.desktop"), s);
console.log("Rendered qwen-studio.desktop:\n" + s);
