# Desktop Weather

A weather widget for the GNOME desktop on Zorin OS. A small GNOME Shell
extension displays the widget above the wallpaper and behind application
windows; a C#/.NET process retrieves current weather from Open-Meteo. A gear
button in the widget opens settings for the city and temperature units, and
tabs switch between hourly and daily forecasts. Clicks elsewhere on the
weather display pass through to the desktop.

The extension currently targets GNOME Shell 46 (Zorin OS 18). It appears in
the upper-right corner of the primary monitor and updates every 15 minutes.
The hourly forecast shows the previous hour, the current hour, and the next
four hours, using the configured location's local time and temperature unit.
The daily forecast shows the next six days, starting tomorrow, with daily highs and lows.
It is not a floating or always-on-top window. Desktop icon extensions may
overlap the widget.

## Requirements

- GNOME Shell 46 on Zorin OS or another GNOME desktop.
- .NET 10 SDK to build and .NET 10 runtime to run.
- Internet access. The free [Open-Meteo API](https://open-meteo.com/)
  requires no API key for non-commercial use; see its
  [terms and limits](https://open-meteo.com/en/terms).

## Install

From this directory, publish and enable the extension with:

```sh
sh ./publish.sh
```

The script builds the backend, deploys the extension, and disables and
re-enables it. Changes to the widget, stylesheet, and backend take effect
without restarting GNOME Shell. The extension remains enabled across logins.
Disable it with `gnome-extensions disable desktop-weather@local`.

On first installation, GNOME Shell may not discover the extension until you
log out and back in; rerun the script afterward. If upgrading an older version
or changing the stable `extension.js` loader, log out and back in once before
rerunning the script: GNOME Shell caches that loader. The script reports when
it cannot confirm that the new widget module was activated.

## Location and units

Without a configuration file, the widget displays **London, United Kingdom**
in Celsius. To change it, create `~/.config/desktop-weather/config.json`:

```json
{
  "city": "Chicago, Illinois",
  "unit": "fahrenheit"
}
```

`unit` must be `celsius` or `fahrenheit`. The city is searched using
[Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api);
the first match is used, so include a state or country to disambiguate.
Wind is shown in km/h for Celsius and mph for Fahrenheit. Changes take effect
when saved in the gear-button settings window. The settings window is part of
the GNOME Shell extension and is implemented in GJS; it saves the same
configuration file read by the .NET weather backend. A separate .NET settings
application is possible, but is not needed for this integrated UI. If
`XDG_CONFIG_HOME` is set to an absolute path, the configuration lives at
`$XDG_CONFIG_HOME/desktop-weather/config.json` instead.

Weather requests send the configured location to Open-Meteo. Current
conditions and forecasts are model-based rather than necessarily local observations.
If an update fails, the last reading remains visible with an error status.
Inspect details with `journalctl --user -b /usr/bin/gnome-shell`.
The backend can also be run directly to diagnose configuration or network
problems:

```sh
dotnet run --project src/DesktopWeather.Backend
```

## Checks

Run the backend configuration, forecast, and widget checks with:

```sh
dotnet build src/DesktopWeather.Backend -c Release
python3 tests/test_backend.py
dotnet run --project tests/BackendForecastChecks
gjs -m tests/test_reload.js
gjs -m tests/test_hourly.js
```
