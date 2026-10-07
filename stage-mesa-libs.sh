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
  for d in /usr/lib/x86_64-linux-gnu /usr/lib64 /usr/lib /usr/lib/mesa /usr/lib/mesa-libgl /usr/lib64/opengl; do
    if [ -e "$d/$n" ]; then
      cp -L "$d/$n" "$APPDIR/usr/lib/"
      echo "[stage-mesa] staged $d/$n -> $APPDIR/usr/lib/$n"
      STAGED=$((STAGED+1))
      break
    fi
  done
done
echo "[stage-mesa] complete ($STAGED/2 libs available in $APPDIR/usr/lib)"
