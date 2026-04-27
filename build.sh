#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

AUTO=false
FORCE_NO_STRIP=false

for arg in "$@"; do
    case "$arg" in
        --auto) AUTO=true ;;
        --no-strip) FORCE_NO_STRIP=true ;;
    esac
done

info()  { echo -e "${BLUE}ℹ${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1"; }

fail() {
    err "$1"
    exit 1
}

detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO_ID="${ID:-unknown}"
        DISTRO_LIKE="${ID_LIKE:-}"
    else
        DISTRO_ID="unknown"
        DISTRO_LIKE=""
    fi
}

has_cmd() {
    command -v "$1" &>/dev/null
}

check_bun() {
    if has_cmd bun; then
        ok "bun $(bun --version 2>/dev/null | head -n1 | awk '{print $1}')"
    else
        fail "bun is not installed. See https://bun.sh"
    fi
}

check_rust() {
    if has_cmd rustc; then
        ok "rustc $(rustc --version | awk '{print $2}')"
    else
        fail "Rust is not installed. See https://rustup.rs"
    fi
}

check_fuse2() {
    if ldconfig -p 2>/dev/null | grep -q "libfuse.so.2"; then
        ok "libfuse2 found"
        return
    fi
    for path in /usr/lib/libfuse.so.2 /usr/lib64/libfuse.so.2 /lib/x86_64-linux-gnu/libfuse.so.2; do
        if [ -f "$path" ]; then
            ok "libfuse2 found ($path)"
            return
        fi
    done

    warn "libfuse2 is missing (required for AppImage bundling)"
    case "$DISTRO_ID" in
        debian|ubuntu|pop|mint|elementary)
            info "Install with: sudo apt install libfuse2"
            ;;
        arch|manjaro|endeavouros|garuda|artix)
            info "Install with: sudo pacman -S fuse2"
            ;;
        fedora|rhel|centos|almalinux|rocky)
            info "Install with: sudo dnf install fuse-libs"
            ;;
        opensuse*|suse*)
            info "Install with: sudo zypper install libfuse2"
            ;;
        alpine)
            info "Install with: sudo apk add fuse"
            ;;
        *)
            info "Install libfuse2 for your distro"
            ;;
    esac
    if [ "$AUTO" = false ]; then
        read -rp "Continue anyway? [y/N] " reply
        [[ "$reply" =~ ^[Yy]$ ]] || exit 1
    fi
}

fix_linuxdeploy_cache() {
    local cache_dir="$HOME/.cache/tauri"
    local expected="$cache_dir/linuxdeploy/linuxdeploy-x86_64.AppImage"

    if [ -f "$expected" ]; then
        ok "linuxdeploy cache path is correct"
        return
    fi

    if [ -f "$cache_dir/linuxdeploy-x86_64.AppImage" ]; then
        warn "linuxdeploy is in the wrong cache location, fixing..."
        mkdir -p "$cache_dir/linuxdeploy"
        mv "$cache_dir/linuxdeploy-x86_64.AppImage" "$cache_dir/linuxdeploy/"
        # Copy plugin if it exists in parent dir
        if [ -f "$cache_dir/linuxdeploy-plugin-appimage.AppImage" ]; then
            cp "$cache_dir/linuxdeploy-plugin-appimage.AppImage" "$cache_dir/linuxdeploy/" 2>/dev/null || true
        fi
        ok "linuxdeploy cache fixed"
        return
    fi

    info "linuxdeploy will be downloaded automatically by Tauri during the build"
}

check_appimagetool() {
    if has_cmd appimagetool; then
        ok "appimagetool found ($(which appimagetool))"
        return
    fi

    warn "appimagetool is missing (required by linuxdeploy to create AppImages)"

    if [ "$AUTO" = false ]; then
        read -rp "Download and install appimagetool to ~/.local/bin? [Y/n] " reply
        [[ "$reply" =~ ^[Nn]$ ]] && {
            info "You can install it manually from: https://github.com/AppImage/appimagetool/releases"
            info "Skipping appimagetool install"
            return
        }
    fi

    info "Downloading appimagetool..."
    mkdir -p ~/.local/bin
    local tmp_dir
    tmp_dir=$(mktemp -d)
    curl -fsSL -o "$tmp_dir/appimagetool-x86_64.AppImage" \
        "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage" || \
        fail "Failed to download appimagetool"
    chmod +x "$tmp_dir/appimagetool-x86_64.AppImage"
    "$tmp_dir/appimagetool-x86_64.AppImage" --appimage-extract >/dev/null 2>&1 || \
        fail "Failed to extract appimagetool"
    cp "$tmp_dir/squashfs-root/usr/bin/appimagetool" ~/.local/bin/appimagetool
    chmod +x ~/.local/bin/appimagetool
    rm -rf "$tmp_dir"
    ok "appimagetool installed to ~/.local/bin/appimagetool"
}

detect_strip_workaround() {
    if [ "$FORCE_NO_STRIP" = true ]; then
        export NO_STRIP=1
        info "NO_STRIP=1 forced by --no-strip"
        return
    fi

    local rolling_ids="arch manjaro endeavouros garuda artix"
    if echo "$rolling_ids" | grep -qw "$DISTRO_ID"; then
        warn "Detected rolling-release distro ($DISTRO_ID)"
        warn "Setting NO_STRIP=1 to avoid linuxdeploy's bundled strip binary issues"
        export NO_STRIP=1
        return
    fi

    if echo "$DISTRO_LIKE" | grep -qw "arch"; then
        warn "Detected Arch-based distro"
        warn "Setting NO_STRIP=1 to avoid linuxdeploy's bundled strip binary issues"
        export NO_STRIP=1
        return
    fi

    if has_cmd strip; then
        local strip_ver
        strip_ver=$(strip --version 2>/dev/null | head -n1 | grep -oP '[0-9]+\.[0-9]+' | head -n1 || true)
        if [ -n "$strip_ver" ]; then
            if printf '%s\n%s\n' "2.38" "$strip_ver" | sort -V -C 2>/dev/null; then
                warn "binutils $strip_ver detected (>= 2.38 produces .relr.dyn sections)"
                warn "Setting NO_STRIP=1 as a precaution"
                export NO_STRIP=1
                return
            fi
        fi
    fi
}

main() {
    echo -e "${BLUE}OpenArc Studio Build Script${NC}"
    echo "=========================="
    echo ""

    cd "$(dirname "$0")" || fail "Could not cd to script directory"

    detect_distro
    info "Distro: $DISTRO_ID"

    check_bun
    check_rust
    check_fuse2
    fix_linuxdeploy_cache
    check_appimagetool
    detect_strip_workaround

    echo ""
    info "Starting build..."
    export APPIMAGE_EXTRACT_AND_RUN=1
    bun run tauri build
}

main "$@"
