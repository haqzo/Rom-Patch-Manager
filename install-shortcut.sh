#!/usr/bin/env bash
# Adds "Rom Patch Manager" to your app menu (KDE, GNOME, …) — then you can pin it to the taskbar.
# Run once:  ./install-shortcut.sh        Remove:  ./install-shortcut.sh --remove
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
FILE="$APPS/rom-patch-manager.desktop"
if [ "$1" = "--remove" ]; then rm -f "$FILE"; echo "Removed."; exit 0; fi
mkdir -p "$APPS"
cat > "$FILE" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Rom Patch Manager
GenericName=PokeMMO ROM mods
Comment=Mod your Pokémon Black/White ROM for PokeMMO
Exec="$DIR/start.sh"
Path=$DIR
Icon=$DIR/app/icon-512.png
Terminal=false
Categories=Game;Utility;
StartupNotify=true
DESKTOP
chmod +x "$FILE" "$DIR/start.sh" "$DIR/serve.py"
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" 2>/dev/null || true
echo "Done: search 'Rom Patch Manager' in your app menu. Right-click it -> 'Pin to Task Manager' to put it on the taskbar."
