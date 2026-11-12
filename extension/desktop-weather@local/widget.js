import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
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
        this._temperature = new St.Label({
            style_class: 'desktop-weather-temperature',
            text: '--',
            x_expand: true,
        });
        this._conditions = new St.Label({
            style_class: 'desktop-weather-conditions',
            text: 'Loading weather...',
            x_expand: true,
        });
        this._details = new St.Label({style_class: 'desktop-weather-details', text: ''});
        this._weatherIcon = new St.Icon({
            icon_name: 'weather-overcast-symbolic',
            style_class: 'desktop-weather-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._currentText = new St.BoxLayout({
            style_class: 'desktop-weather-current-text',
            vertical: true,
            x_expand: true,
        });
        this._currentText.add_child(this._temperature);
        this._currentText.add_child(this._conditions);
        this._currentWeather = new St.BoxLayout({
            style_class: 'desktop-weather-current',
            x_expand: true,
        });
        this._currentWeather.add_child(this._weatherIcon);
        this._currentWeather.add_child(this._currentText);
        this._status = new St.Label({
            style_class: 'desktop-weather-status',
            text: '',
            x_expand: true,
        });
        for (const actor of [this._location, this._currentWeather, this._details])
            this._widget.add_child(actor);

        this._forecastMode = 'hourly';
        this._forecastTargets = [];
        this._tooltip = new St.Label({
            style_class: 'desktop-weather-tooltip',
            visible: false,
        });
        const forecastTabs = new St.BoxLayout({style_class: 'desktop-weather-forecast-tabs'});
        this._hourlyTabSlot = new St.Widget({width: 72, height: 24});
        this._dailyTabSlot = new St.Widget({width: 72, height: 24});
        forecastTabs.add_child(this._hourlyTabSlot);
        forecastTabs.add_child(this._dailyTabSlot);
        this._widget.add_child(forecastTabs);

        this._hourly = new St.BoxLayout({
            style_class: 'desktop-weather-hourly',
            x_expand: true,
        });
        this._widget.add_child(this._hourly);
        this._daily = new St.BoxLayout({
            style_class: 'desktop-weather-hourly',
            x_expand: true,
            visible: false,
        });
        this._widget.add_child(this._daily);

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
        this._hourlyTab = new St.Button({
            label: 'Hourly',
            width: 72,
            height: 24,
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        this._dailyTab = new St.Button({
            label: 'Daily',
            width: 72,
            height: 24,
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        this._hourlyTab.connect('clicked', () => this._setForecastMode('hourly'));
        this._dailyTab.connect('clicked', () => this._setForecastMode('daily'));
        this._setForecastMode('hourly');

        // Keep the non-interactive widget with the wallpaper.
        Main.layoutManager._backgroundGroup.add_child(this._widget);
        for (const actor of [this._settingsButton, this._hourlyTab, this._dailyTab, this._tooltip])
            global.window_group.add_child(actor);
        this._restackedId = global.display.connect('restacked', () => this._restackControls());
        this._windowMappedId = global.window_manager.connect_after('map', () => this._restackControls());
        this._restackControls();
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._position());
        this._workareasChangedId = global.display.connect('workareas-changed', () => this._position());
        this._allocationChangedId = this._widget.connect('notify::allocation', () => this._position());
        for (const slot of [this._settingsButtonSlot, this._hourlyTabSlot, this._dailyTabSlot])
            slot.connect('notify::allocation', () => this._position());
        this._position();
        this._refresh();
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _restackControls() {
        let anchor = Main.layoutManager._backgroundGroup;
        for (const actor of global.window_group.get_children()) {
            const window = actor.meta_window;
            if (!window || !actor.mapped)
                continue;
            // Zorin's Wayland desktop windows are tracked by its desktop-icons extension.
            if (window.get_window_type() !== Meta.WindowType.DESKTOP &&
                !window.customJS_ding?.keepAtBottom)
                break;
            anchor = actor;
        }

        const actors = [
            this._settingsButton, this._hourlyTab, this._dailyTab,
            ...this._forecastTargets.map(target => target.actor), this._tooltip,
        ];
        for (const actor of actors) {
            global.window_group.set_child_above_sibling(actor, anchor);
            anchor = actor;
        }
    }

    _position() {
        if (!this._widget || !Main.layoutManager.primaryMonitor)
            return;

        const index = Main.layoutManager.primaryIndex;
        const area = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(index);
        const x = Math.max(area.x, area.x + area.width - this._widget.width - 24);
        this._widget.set_position(x, area.y + 24);
        for (const [slot, button] of [
            [this._settingsButtonSlot, this._settingsButton],
            [this._hourlyTabSlot, this._hourlyTab],
            [this._dailyTabSlot, this._dailyTab],
        ]) {
            const [buttonX, buttonY] = slot.get_transformed_position();
            button.set_position(
                buttonX + (slot.width - button.width) / 2,
                buttonY + (slot.height - button.height) / 2);
        }
        for (const target of this._forecastTargets) {
            if (target.mode !== this._forecastMode)
                continue;
            const [iconX, iconY] = target.icon.get_transformed_position();
            target.actor.set_position(iconX, iconY);
            target.actor.set_size(target.icon.width, target.icon.height);
        }
        if (this._tooltipTarget)
            this._positionTooltip(this._tooltipTarget);
    }

    _setForecastMode(mode) {
        this._forecastMode = mode;
        this._hourly.visible = mode === 'hourly';
        this._daily.visible = mode === 'daily';
        this._hideForecastTooltip();
        for (const target of this._forecastTargets)
            target.actor.visible = target.mode === mode;
        this._hourlyTab.set_style_class_name(
            `desktop-weather-forecast-tab${mode === 'hourly' ? ' selected' : ''}`);
        this._dailyTab.set_style_class_name(
            `desktop-weather-forecast-tab${mode === 'daily' ? ' selected' : ''}`);
    }

    _hideForecastTooltip() {
        this._tooltipTarget = null;
        this._tooltip.visible = false;
    }

    _positionTooltip(target) {
        if (!Main.layoutManager.primaryMonitor)
            return;
        const area = global.workspace_manager.get_active_workspace()
            .get_work_area_for_monitor(Main.layoutManager.primaryIndex);
        const [, width] = this._tooltip.get_preferred_width(-1);
        const [, height] = this._tooltip.get_preferred_height(width);
        const x = Math.max(area.x, Math.min(target.actor.x + (target.actor.width - width) / 2,
            area.x + area.width - width));
        let y = target.actor.y - height - 4;
        if (y < area.y)
            y = target.actor.y + target.actor.height + 4;
        this._tooltip.set_position(x, Math.max(area.y, Math.min(y, area.y + area.height - height)));
    }

    _addForecastTarget(icon, mode, conditions) {
        const actor = new St.Widget({
            reactive: true,
            track_hover: true,
            visible: mode === this._forecastMode,
            accessible_name: conditions,
        });
        const target = {icon, actor, mode};
        this._forecastTargets.push(target);
        global.window_group.add_child(actor);
        icon.connect('notify::allocation', () => this._position());
        actor.connect('notify::hover', () => {
            if (actor.hover && actor.visible) {
                this._tooltipTarget = target;
                this._tooltip.text = conditions;
                this._tooltip.visible = true;
                this._positionTooltip(target);
            } else if (this._tooltipTarget === target) {
                this._hideForecastTooltip();
            }
        });
    }

    _clearForecastTargets(mode) {
        if (this._tooltipTarget?.mode === mode)
            this._hideForecastTooltip();
        const removed = this._forecastTargets.filter(target => target.mode === mode);
        this._forecastTargets = this._forecastTargets.filter(target => target.mode !== mode);
        for (const target of removed)
            target.actor.destroy();
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
                    if (!Array.isArray(weather.hourly) || weather.hourly.length !== 6 ||
                        weather.hourly.some(hour => typeof hour?.time !== 'string' ||
                            typeof hour.temperature !== 'number' || !Number.isFinite(hour.temperature) ||
                            typeof hour.conditions !== 'string'))
                        throw new Error('Backend returned an invalid hourly forecast');
                    if (!Array.isArray(weather.daily) || weather.daily.length !== 6 ||
                        weather.daily.some(day => typeof day?.date !== 'string' ||
                            !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
                            !Number.isFinite(day.high) || !Number.isFinite(day.low) ||
                            typeof day.conditions !== 'string'))
                        throw new Error('Backend returned an invalid daily forecast');
                    this._location.text = weather.location;
                    this._temperature.text = `${Math.round(weather.temperature)}°${weather.temperatureUnit}`;
                    this._conditions.text = weather.conditions;
                    this._weatherIcon.icon_name = this._weatherIconForConditions(weather.conditions);
                    this._details.text = `Feels like ${Math.round(weather.feelsLike)}° · Humidity ${weather.humidity}%\nWind ${Math.round(weather.windSpeed)} ${weather.windUnit}`;
                    this._updateHourly(weather.hourly);
                    this._updateDaily(weather.daily);
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

    _updateHourly(hours) {
        this._clearForecastTargets('hourly');
        this._hourly.destroy_all_children();
        for (const hour of hours) {
            const column = new St.BoxLayout({
                style_class: 'desktop-weather-hour',
                vertical: true,
                x_expand: true,
                accessible_name: `${hour.time}, ${hour.conditions}, ${Math.round(hour.temperature)} degrees`,
            });
            column.add_child(new St.Label({
                style_class: 'desktop-weather-hour-time',
                text: hour.time,
                x_align: Clutter.ActorAlign.CENTER,
            }));
            const icon = new St.Icon({
                style_class: 'desktop-weather-hour-icon',
                icon_name: this._weatherIconForConditions(hour.conditions),
                x_align: Clutter.ActorAlign.CENTER,
            });
            column.add_child(icon);
            this._addForecastTarget(icon, 'hourly', hour.conditions);
            column.add_child(new St.Label({
                style_class: 'desktop-weather-hour-temperature',
                text: `${Math.round(hour.temperature)}°`,
                x_align: Clutter.ActorAlign.CENTER,
            }));
            this._hourly.add_child(column);
        }
        this._restackControls();
    }

    _updateDaily(days) {
        this._clearForecastTargets('daily');
        this._daily.destroy_all_children();
        for (const day of days) {
            const [year, month, date] = day.date.split('-').map(Number);
            const label = GLib.DateTime.new_utc(year, month, date, 12, 0, 0).format('%a %d');
            const high = Math.round(day.high);
            const low = Math.round(day.low);
            const column = new St.BoxLayout({
                style_class: 'desktop-weather-hour',
                vertical: true,
                x_expand: true,
                accessible_name: `${day.date}, ${day.conditions}, high ${high} degrees, low ${low} degrees`,
            });
            column.add_child(new St.Label({
                style_class: 'desktop-weather-hour-time',
                text: label,
                x_align: Clutter.ActorAlign.CENTER,
            }));
            const icon = new St.Icon({
                style_class: 'desktop-weather-hour-icon',
                icon_name: this._weatherIconForConditions(day.conditions),
                x_align: Clutter.ActorAlign.CENTER,
            });
            column.add_child(icon);
            this._addForecastTarget(icon, 'daily', day.conditions);
            column.add_child(new St.Label({
                style_class: 'desktop-weather-hour-temperature',
                text: `${high}°`,
                x_align: Clutter.ActorAlign.CENTER,
            }));
            column.add_child(new St.Label({
                style_class: 'desktop-weather-hour-time',
                text: `${low}°`,
                x_align: Clutter.ActorAlign.CENTER,
            }));
            this._daily.add_child(column);
        }
        this._restackControls();
    }

    _weatherIconForConditions(conditions) {
        const description = conditions.toLowerCase();
        if (description.includes('thunderstorm'))
            return 'weather-storm-symbolic';
        if (description.includes('snow'))
            return 'weather-snow-symbolic';
        if (description.includes('fog'))
            return 'weather-fog-symbolic';
        if (description.includes('drizzle'))
            return 'weather-showers-scattered-symbolic';
        if (description.includes('rain'))
            return 'weather-showers-symbolic';
        if (description.includes('overcast'))
            return 'weather-overcast-symbolic';
        if (description.includes('cloud'))
            return 'weather-few-clouds-symbolic';
        if (description.includes('clear'))
            return 'weather-clear-symbolic';
        return 'weather-severe-alert-symbolic';
    }

    _showError(error) {
        console.error(`Desktop Weather: ${error.message}`);
        if (!this._hasWeather) {
            this._conditions.text = 'Weather unavailable';
            this._weatherIcon.icon_name = 'weather-severe-alert-symbolic';
        }
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
        global.display.disconnect(this._restackedId);
        global.window_manager.disconnect(this._windowMappedId);
        this._widget.disconnect(this._allocationChangedId);
        for (const target of this._forecastTargets)
            target.actor.destroy();
        for (const actor of [this._settingsButton, this._hourlyTab, this._dailyTab, this._tooltip])
            actor.destroy();
        this._widget.destroy();
        this._widget = null;
    }
}
