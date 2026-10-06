// Sanitize qwen-studio.desktop so it is valid for the deb/rpm desktopTemplate
// consumers (debhelper/lintian and rpmbuild). The bundler renders {{...}}
// placeholders itself via handlebars when generating .deb/.rpm, so this script
// only fixes structural issues:
//  - removes the shebang line (invalid inside a [Desktop Entry] file)
//  - unquotes the Exec placeholder: the bundler substitutes {{exec}} with the
//    real binary name ("qwen-studio"); literal quotes around it make AppRun's
//    desktop-file parser exec a nonexistent command -> SIGSEGV on launch.
// It intentionally does NOT touch the file for AppImage builds anymore: the
// AppImage gets its own generated desktop file from linuxdeploy (which points
// Exec at the correct binary), so we no longer inject ours via
// bundle.linux.appimage.files (that used to produce TWO conflicting .desktop
// files in the AppDir root).
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "qwen-studio.desktop");
let s = fs.readFileSync(file, "utf8");
s = s.replace(/^#![^\n]*\n/, ""); // drop shebang
s = s.replace(/Exec="\{\{exec\}\}"/g, "Exec={{exec}}"); // unquote placeholder
fs.writeFileSync(file, s);
console.log("Sanitized qwen-studio.desktop:\n" + s);
