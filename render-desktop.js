// Render qwen-studio.desktop (a Handlebars template used verbatim by the
// deb/rpm desktopTemplate machinery, which the bundler renders itself) into a
// concrete .desktop file for the AppImage bundle.
//
// Why: the AppImage path does NOT apply `desktopTemplate` — linuxdeploy
// generates its own usr/share/applications/<name>.desktop, which historically
// produced the wrong Icon and an unusable Exec for this app. We therefore
// render our own file here and inject it via bundle.linux.appimage.files at
// exactly that path so it overwrites linuxdeploy's output.
//
// Values mirror what the Rust bundler substitutes at build time:
//   {{product_name}} -> productName ("Qwen Studio")
//   {{comment}}      -> app description
//   {{exec}}/{{icon}}-> main binary name ("qwen-studio"; unquoted — quoted
//                      Exec lines caused the v2.2.3 SIGSEGV)
const fs = require("fs");
const path = require("path");

const vars = {
  product_name: "Qwen Studio",
  comment: "Desktop client for Qwen",
  exec: "qwen-studio",
  icon: "qwen-studio",
};

const file = path.join(__dirname, "qwen-studio.desktop");
let s = fs.readFileSync(file, "utf8");
s = s.replace(/^#![^\n]*\n/, ""); // drop shebang (invalid in a .desktop file)
s = s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (!(k in vars)) throw new Error(`render-desktop.js: unknown placeholder {{${k}}}`);
  return vars[k];
});
if (/^Exec=.*".*$/m.test(s)) {
  throw new Error("render-desktop.js: Exec line contains literal quotes");
}
// Written to a separate file so the template stays intact in git and CI can
// verify + promote it before bundling.
fs.writeFileSync(path.join(__dirname, "qwen-studio.desktop.rendered"), s);
console.log("Rendered qwen-studio.desktop.rendered:\n" + s);
