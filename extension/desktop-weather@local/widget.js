import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

const REFRESH_SECONDS = 15 * 60;

export default class DesktopWeatherExtension extends Extension {
    enable() {
        this._enabled = true;
        this._hasWeather = false;
        this._widget = new St.BoxLayout({
            style_class: 'desktop-weather',
            vertical: true,
            reactive: false,
        });
        this._location = new St.Label({style_class: 'desktop-weather-location', text: 'Desktop Weather'});
        this._temperature = new St.Label({style_class: 'desktop-weather-temperature', text: '--'});
        this._conditions = new St.Label({style_class: 'desktop-weather-conditions', text: 'Loading weather...'});
        this._details = new St.Label({style_class: 'desktop-weather-details', text: ''});
        this._status = new St.Label({
            style_class: 'desktop-weather-status',
            text: '',
            x_expand: true,
        });
        for (const label of [this._location, this._temperature, this._conditions, this._details])
            this._widget.add_child(label);

        this._statusRow = new St.BoxLayout({
            style_class: 'desktop-weather-status-row',
            x_expand: true,
        });
        this._statusRow.add_child(this._status);
        this._settingsButtonSlot = new St.Widget({
            style_class: 'desktop-weather-settings-slot',
            width: 20,
            height: 18,
        });
        this._statusRow.add_child(this._settingsButtonSlot);
        this._widget.add_child(this._statusRow);

        this._settingsButton = new St.Button({
            style_class: 'desktop-weather-settings-button',
            width: 18,
            height: 18,
            can_focus: true,
            reactive: true,
            track_hover: true,
            accessible_name: 'Weather settings',
            child: new St.Icon({
                icon_name: 'preferences-system-symbolic',
                style_class: 'desktop-weather-settings-icon',
            }),
        });
        this._settingsButton.connect('clicked', () => this._openSettings());

        // Keep the widget with the wallpaper, outside the compositor's window stack.
        Main.layoutManager._backgroundGroup.add_child(this._widget);
        Main.uiGroup.add_child(this._settingsButton);
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._position());
        this._workareasChangedId = global.display.connect('workareas-changed', () => this._position());
        this._allocationChangedId = this._widget.connect('notify::allocation', () => this._position());
        this._position();
        this._refresh();
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _position() {
        if (!this._widget || !Main.layoutManager.primaryMonitor)
            return;

        const index = Main.layoutManager.primaryIndex;
        const area = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(index);
        const x = Math.max(area.x, area.x + area.width - this._widget.width - 24);
        this._widget.set_position(x, area.y + 24);
        const [buttonX, buttonY] = this._settingsButtonSlot.get_transformed_position();
        this._settingsButton.set_position(
            buttonX + (this._settingsButtonSlot.width - this._settingsButton.width) / 2,
            buttonY + (this._settingsButtonSlot.height - this._settingsButton.height) / 2);
    }

    _configPath() {
        let configRoot = GLib.getenv('XDG_CONFIG_HOME');
        if (!configRoot || !GLib.path_is_absolute(configRoot))
            configRoot = GLib.build_filenamev([GLib.get_home_dir(), '.config']);
        return GLib.build_filenamev([configRoot, 'desktop-weather', 'config.json']);
    }

    _loadSettings() {
        const path = this._configPath();
        if (!GLib.file_test(path, GLib.FileTest.EXISTS))
            return {city: 'London, United Kingdom', unit: 'celsius'};

        const [, contents] = GLib.file_get_contents(path);
        const settings = JSON.parse(new TextDecoder().decode(contents));
        if (typeof settings.city !== 'string' || settings.city.trim().length < 2)
            throw new Error('City must contain at least two characters.');
        if (settings.unit !== 'celsius' && settings.unit !== 'fahrenheit')
            throw new Error("Unit must be 'celsius' or 'fahrenheit'.");
        return {city: settings.city, unit: settings.unit};
    }

    _openSettings() {
        if (!this._settingsDialog) {
            this._settingsDialog = this._createSettingsDialog();
        }
        if (this._settingsOpen)
            return;

        let settings = {city: 'London, United Kingdom', unit: 'celsius'};
        this._settingsError.text = '';
        try {
            settings = this._loadSettings();
        } catch (error) {
            console.error(`Desktop Weather: Could not load settings: ${error.message}`);
            this._settingsError.text = `Could not load saved settings: ${error.message}`;
        }

        this._cityEntry.set_text(settings.city);
        this._unit = settings.unit;
        this._updateUnitButtons();
        this._settingsOpen = this._settingsDialog.open();
        if (!this._settingsOpen)
            console.error('Desktop Weather: Could not open settings dialog.');
    }

    _createSettingsDialog() {
        const dialog = new ModalDialog.ModalDialog({
            styleClass: 'desktop-weather-settings-dialog',
            destroyOnClose: false,
        });
        dialog.contentLayout.add_style_class_name('desktop-weather-settings-content');
        dialog.contentLayout.add_child(new St.Label({
            style_class: 'desktop-weather-settings-title',
            text: 'Weather settings',
        }));
        dialog.contentLayout.add_child(new St.Label({
            style_class: 'desktop-weather-settings-label',
            text: 'City or location',
        }));
        this._cityEntry = new St.Entry({
            style_class: 'desktop-weather-settings-entry',
            hint_text: 'e.g. Chicago, Illinois',
            can_focus: true,
        });
        dialog.contentLayout.add_child(this._cityEntry);

        dialog.contentLayout.add_child(new St.Label({
            style_class: 'desktop-weather-settings-label',
            text: 'Temperature units',
        }));
        const unitRow = new St.BoxLayout({style_class: 'desktop-weather-unit-row'});
        this._celsiusButton = new St.Button({
            label: 'Celsius',
            style_class: 'desktop-weather-unit-button',
            can_focus: true,
            reactive: true,
        });
        this._fahrenheitButton = new St.Button({
            label: 'Fahrenheit',
            style_class: 'desktop-weather-unit-button',
            can_focus: true,
            reactive: true,
        });
        this._celsiusButton.connect('clicked', () => {
            this._unit = 'celsius';
            this._updateUnitButtons();
        });
        this._fahrenheitButton.connect('clicked', () => {
            this._unit = 'fahrenheit';
            this._updateUnitButtons();
        });
        unitRow.add_child(this._celsiusButton);
        unitRow.add_child(this._fahrenheitButton);
        dialog.contentLayout.add_child(unitRow);
        this._settingsError = new St.Label({style_class: 'desktop-weather-settings-error', text: ''});
        dialog.contentLayout.add_child(this._settingsError);

        dialog.setButtons([
            {label: 'Cancel', action: () => this._closeSettings(), key: Clutter.KEY_Escape},
            {label: 'Save', action: () => this._saveSettings(), default: true},
        ]);
        return dialog;
    }

    _updateUnitButtons() {
        this._celsiusButton.set_style_class_name(
            `desktop-weather-unit-button${this._unit === 'celsius' ? ' selected' : ''}`);
        this._fahrenheitButton.set_style_class_name(
            `desktop-weather-unit-button${this._unit === 'fahrenheit' ? ' selected' : ''}`);
    }

    _saveSettings() {
        const city = this._cityEntry.get_text().trim();
        if (city.length < 2) {
            this._settingsError.text = 'City must contain at least two characters.';
            return;
        }

        try {
            const path = this._configPath();
            const directory = GLib.path_get_dirname(path);
            GLib.mkdir_with_parents(directory, 0o700);
            GLib.file_set_contents(path, JSON.stringify({city, unit: this._unit}, null, 2));
            this._closeSettings();
            if (this._process) {
                this._process.force_exit();
                this._process = null;
            }
            this._refresh();
        } catch (error) {
            console.error(`Desktop Weather: Could not save settings: ${error.message}`);
            this._settingsError.text = `Could not save settings: ${error.message}`;
        }
    }

    _closeSettings() {
        this._settingsDialog.close();
        this._settingsOpen = false;
    }

    _refresh() {
        if (this._process)
            return;

        try {
            const executable = GLib.build_filenamev([this.path, 'backend', 'DesktopWeather.Backend']);
            const process = Gio.Subprocess.new([executable],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            this._process = process;
            process.communicate_utf8_async(null, null, (source, result) => {
                try {
                    const [, stdout, stderr] = source.communicate_utf8_finish(result);
                    if (!this._enabled || this._process !== process)
                        return;
                    if (!source.get_successful())
                        throw new Error(stderr.trim() || `Backend exited with status ${source.get_exit_status()}`);

                    const weather = JSON.parse(stdout);
                    this._location.text = weather.location;
                    this._temperature.text = `${Math.round(weather.temperature)}°${weather.temperatureUnit}`;
                    this._conditions.text = weather.conditions;
                    this._details.text = `Feels like ${Math.round(weather.feelsLike)}° · Humidity ${weather.humidity}%\nWind ${Math.round(weather.windSpeed)} ${weather.windUnit}`;
                    this._status.text = 'Open-Meteo · Updated ' +
                        GLib.DateTime.new_now_local().format('%H:%M');
                    this._hasWeather = true;
                } catch (error) {
                    if (this._enabled && this._process === process)
                        this._showError(error);
                } finally {
                    if (this._process === process)
                        this._process = null;
                }
            });
        } catch (error) {
            this._showError(error);
        }
    }

    _showError(error) {
        console.error(`Desktop Weather: ${error.message}`);
        if (!this._hasWeather)
            this._conditions.text = 'Weather unavailable';
        this._status.text = 'Update failed; see GNOME Shell logs';
    }

    disable() {
        this._enabled = false;
        if (this._settingsDialog) {
            if (this._settingsOpen)
                this._settingsDialog.close();
            this._settingsDialog.destroy();
            this._settingsDialog = null;
        }
        if (this._timerId)
            GLib.source_remove(this._timerId);
        this._timerId = 0;
        if (this._process) {
            this._process.force_exit();
            this._process = null;
        }
        Main.layoutManager.disconnect(this._monitorsChangedId);
        global.display.disconnect(this._workareasChangedId);
        this._widget.disconnect(this._allocationChangedId);
        this._settingsButton.destroy();
        this._widget.destroy();
        this._widget = null;
    }
}
