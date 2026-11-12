#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
uuid=desktop-weather@local
source_dir="$root/extension/$uuid"
case "${XDG_DATA_HOME:-}" in
    /*) data_dir=$XDG_DATA_HOME ;;
    *) data_dir="$HOME/.local/share" ;;
esac
extension_dir="$data_dir/gnome-shell/extensions/$uuid"
project="$root/src/DesktopWeather.Backend/DesktopWeather.Backend.csproj"
publish_dir="$root/src/DesktopWeather.Backend/bin/Release/net10.0/publish"

dotnet publish "$project" -c Release

mkdir -p "$extension_dir"
if gnome-extensions info "$uuid" >/dev/null 2>&1; then
    gnome-extensions disable "$uuid"
    count=0
    while :; do
        info=$(LC_ALL=C gnome-extensions info "$uuid")
        case "$info" in
            *"State: INACTIVE"*|*"State: INITIALIZED"*) break ;;
        esac
        count=$((count + 1))
        if [ "$count" -ge 20 ]; then
            echo "Timed out waiting for $uuid to disable." >&2
            exit 1
        fi
        sleep 0.5
    done
fi

module_hash=$(sha256sum "$source_dir/widget.js")
module_hash=${module_hash%% *}
module_name="widget-$module_hash.js"
mkdir -p "$extension_dir/backend"
cp "$source_dir/metadata.json" "$source_dir/extension.js" "$source_dir/stylesheet.css" "$extension_dir/"
cp "$source_dir/widget.js" "$extension_dir/$module_name"
cp -a --remove-destination "$publish_dir/." "$extension_dir/backend/"
printf '%s\n' "$module_name" > "$extension_dir/widget-module"
rm -f -- "$extension_dir/active-widget"

if ! gnome-extensions info "$uuid" >/dev/null 2>&1; then
    echo "Extension installed but not yet discovered. Log out and back in, then run this script again." >&2
    exit 1
fi

gnome-extensions enable "$uuid"
count=0
while :; do
    info=$(LC_ALL=C gnome-extensions info "$uuid")
    case "$info" in
        *"State: ACTIVE"*) break ;;
        *"State: ERROR"*)
            echo "Failed to enable $uuid; inspect GNOME Shell logs." >&2
            exit 1 ;;
    esac
    count=$((count + 1))
    if [ "$count" -ge 20 ]; then
        echo "Timed out waiting for $uuid to enable; inspect GNOME Shell logs." >&2
        exit 1
    fi
    sleep 0.5
done

if [ ! -f "$extension_dir/active-widget" ] ||
    [ "$(cat "$extension_dir/active-widget")" != "$module_name" ]; then
    echo "The updated loader has not run. Log out and back in, then run this script again." >&2
    exit 1
fi

echo "Desktop Weather published and reloaded."
