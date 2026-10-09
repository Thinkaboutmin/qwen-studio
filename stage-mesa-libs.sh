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
# v2.2.14 HARD GUARD: linuxdeploy's gtk plugin never copies libEGL.so.1 into
# the AppDir, so without this hook the shipped binary has an unresolved
# DT_NEEDED on libEGL.so.1 and SIGSEGVs at load on hosts whose loader search
# paths miss it too (openSUSE Tumbleweed — every release v2.2.9..v2.2.13 was
# affected because staging silently no-op'd on the Ubuntu runner). If the
# library still isn't in the bundle after the copy attempts above, download
# the full *working* runtime closure of libglvnd EGL dispatch via apt
# (libegl1 + libglvnd0 + libegl-mesa0 + mesa deps) and unpack them into
# usr/lib by hand. NOTE: we deliberately ship only the libglvnd dispatchers +
# Mesa; the host still supplies the DRI driver through /usr/lib/dri at
# runtime, and LIBGL_ALWAYS_SOFTWARE (set by src/lib.rs) keeps even that
# optional.
if ! find "$APPDIR/usr/lib" -name 'libEGL.so.1' | grep -q .; then
  echo "[stage-mesa] libEGL.so.1 NOT found in system dirs — falling back to apt-get download"
  TMPMESA="$(mktemp -d)"
  trap 'rm -rf "$TMPMESA"' EXIT
  ( cd "$TMPMESA" && apt-get download -y \
      libegl1 libgl1 libglvnd0 \
      libegl-mesa0 libgbm1 libglapi-mesa \
      libdrm2 libexpat1 libxshmfence1 \
      libx11-xcb1 libxcb-dri2-0 libxcb-dri3-0 libxcb-present0 \
      libxcb-randr0 libxcb-sync1 libxcb-xfixes0 >/dev/null 2>&1 ) || true
  for debfile in "$TMPMESA"/libegl1_*.deb "$TMPMESA"/libgl1_*.deb "$TMPMESA"/libglvnd0_*.deb \
                 "$TMPMESA"/libegl-mesa0_*.deb "$TMPMESA"/libgbm1_*.deb "$TMPMESA"/libglapi-mesa_*.deb \
                 "$TMPMESA"/libdrm2_*.deb "$TMPMESA"/libexpat1_*.deb "$TMPMESA"/libxshmfence1_*.deb \
                 "$TMPMESA"/libx11-xcb1_*.deb "$TMPMESA"/libxcb-dri2-0_*.deb "$TMPMESA"/libxcb-dri3-0_*.deb \
                 "$TMPMESA"/libxcb-present0_*.deb "$TMPMESA"/libxcb-randr0_*.deb "$TMPMESA"/libxcb-sync1_*.deb \
                 "$TMPMESA"/libxcb-xfixes0_*.deb; do
    [ -e "$debfile" ] || continue
    dpkg-deb -x "$debfile" "$TMPMESA/root" || continue
  done
  # Copy versioned soname objects (skip unversioned .so dev symlinks).
  while IFS= read -r f; do
    base=$(basename "$f")
    case "$base" in
      *.so) continue ;;
    esac
    if [ ! -e "$APPDIR/usr/lib/$base" ]; then
      cp -L "$f" "$APPDIR/usr/lib/$base"
      echo "[stage-mesa] staged (apt) $base"
      STAGED=$((STAGED+1))
    fi
  done < <(find "$TMPMESA/root" \( -name 'libEGL.so.1*' -o -name 'libGL.so.1*' -o -name 'libGLdispatch.so.0*' -o -name 'libGLESv*.so.2*' -o -name 'libEGL_mesa.so.0*' -o -name 'libgbm.so.1*' -o -name 'libglapi.so.0*' -o -name 'libdrm.so.2*' -o -name 'libexpat.so.1*' -o -name 'libxshmfence.so.1*' -o -name 'libX11-xcb.so.1*' -o -name 'libxcb-dri2.so.0*' -o -name 'libxcb-dri3.so.0*' -o -name 'libxcb-present.so.0*' -o -name 'libxcb-randr.so.0*' -o -name 'libxcb-sync.so.1*' -o -name 'libxcb-xfixes.so.0*' \) -type f 2>/dev/null)
  rm -rf "$TMPMESA"; trap - EXIT
fi
if ! find "$APPDIR/usr/lib" -name 'libEGL.so.1' | grep -q .; then
  echo "[stage-mesa] FATAL: could not stage libEGL.so.1 into the AppImage bundle."
  echo "[stage-mesa] Refusing to ship an AppImage that SIGSEGVs at load time."
  exit 1
fi
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
