#!/usr/bin/env bash
# beforeBundleCommand helper for the AppImage bundle.
#
# Root cause of the grey screen (EGL_BAD_PARAMETER) and SIGSEGV in
# v2.2.3..v2.2.6: linuxdeploy's gtk plugin copies GTK/pixbuf libs but NEVER
# libEGL.so.1/libGL.so.1, and bundleMediaFramework drags gstreamer libs whose
# rpath resolves an old CUDA/NVIDIA stub on real hosts. WebKitGTK's GPU child
# process then aborts with "Could not create default EGL display:
# EGL_BAD_PARAMETER" -> grey window.
#
# This script runs from inside the AppDir (the bundler sets cwd to the AppDir
# and exports APPDIR when invoking beforeBundleCommand), so we can copy the
# system Mesa providers straight into <AppDir>/usr/lib. The bundled AppRun
# exports LD_LIBRARY_PATH=$APPDIR/usr/lib, which resolves them for the main
# process AND every WebKitGTK GPU child — no runtime LD_PRELOAD needed.
#
# No-op unless this really is the AppImage bundling phase (APPDIR set and
# containing usr/bin); deb/rpm builds are never touched.
set -euo pipefail

APPDIR="${APPDIR:-$(pwd)}"
if [ ! -d "$APPDIR/usr/bin" ]; then
  echo "[stage-mesa] not an AppImage AppDir ($APPDIR/usr/bin missing) - skipping"
  exit 0
fi

mkdir -p "$APPDIR/usr/lib"
STAGED=0
for n in libEGL.so.1 libGL.so.1; do
  if find "$APPDIR/usr" -name "$n" 2>/dev/null | grep -q .; then
    echo "[stage-mesa] $n already present in bundle"
    STAGED=$((STAGED+1))
    continue
  fi
  # Search order matters: dedicated Mesa dirs FIRST (Arch keeps the real Mesa
  # objects under /usr/lib/mesa and /usr/lib32/mesa, while /usr/lib/libEGL.so.1
  # is a libglvnd/alternative symlink that may resolve to another vendor);
  # multiarch next; plain /usr/lib(64) last. cp -L dereferences symlinks so we
  # always ship a concrete ELF object.
  for d in /usr/lib/mesa /usr/lib32/mesa /usr/lib/mesa-libgl /usr/lib/x86_64-linux-gnu /usr/lib64 /usr/lib /usr/lib64/opengl; do
    if [ -e "$d/$n" ]; then
      cp -L "$d/$n" "$APPDIR/usr/lib/"
      echo "[stage-mesa] staged $d/$n -> $APPDIR/usr/lib/$n"
      STAGED=$((STAGED+1))
      break
    fi
  done
done
echo "[stage-mesa] complete ($STAGED/2 libs available in $APPDIR/usr/lib)"

# ---------------------------------------------------------------------------
# Arch .pkg.tar.zst sanity guard (v2.2.9 regression).
# The release workflow repackages the deb payload into a native Arch package
# with dpkg-deb -x. If dpkg ever disappears from the runner image again, or
# extraction silently produces an empty rootfs, the CI tar step still succeeds
# and we ship an archive without .PKGINFO ("erro: faltando metadados do pacote"
# on pacman -U). Building the deb here is exactly where such a failure would
# first show up, so verify the deb payload right now and fail loudly instead of
# letting a corrupt package reach the release.
DEB=$(find target -path '*bundle/deb*' -name '*.deb' 2>/dev/null | head -1)
if [ -n "${DEB:-}" ] && command -v dpkg-deb >/dev/null 2>&1; then
  TMP_DEBCHK="$(mktemp -d)"
  dpkg-deb -x "$DEB" "$TMP_DEBCHK" || { echo "[stage-mesa] ERROR: dpkg-deb -x failed on $DEB"; exit 1; }
  test -f "$TMP_DEBCHK/usr/bin/qwen-studio" || { echo "[stage-mesa] ERROR: deb payload missing usr/bin/qwen-studio"; exit 1; }
  ls "$TMP_DEBCHK/usr/share/applications/"*.desktop >/dev/null || { echo "[stage-mesa] ERROR: deb payload has no .desktop file"; exit 1; }
  find "$TMP_DEBCHK/usr/share/icons" -name 'qwen-studio.png' | grep -q . || { echo "[stage-mesa] ERROR: deb payload missing hicolor icons"; exit 1; }
  rm -rf "$TMP_DEBCHK"
  echo "[stage-mesa] deb payload sanity OK (binary + desktop + icons present)"
fi
