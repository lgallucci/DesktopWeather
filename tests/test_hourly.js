import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const root = Gio.File.new_for_path(System.programInvocationName).get_parent().get_parent();
const widgetFile = root.get_child('extension').get_child('desktop-weather@local').get_child('widget.js');
const [, bytes] = widgetFile.load_contents(null);
const source = new TextDecoder().decode(bytes)
    .replace(/^import .*;$/gm, '')
    .replace('export default class', 'return class');

class Actor {
    constructor(properties = {}) {
        Object.assign(this, properties);
        this.children = [];
        this.handlers = new Map();
    }

    add_child(child) {
        this.children.push(child);
    }

    connect(signal, callback) {
        this.handlers.set(signal, callback);
    }

    emit(signal) {
        this.handlers.get(signal)?.();
    }

    destroy() {
        const index = windowGroup.children.indexOf(this);
        if (index >= 0)
            windowGroup.children.splice(index, 1);
        this.destroyed = true;
    }

    destroy_all_children() {
        this.children = [];
    }

    set_style_class_name(name) {
        this.style_class = name;
    }

    set_position(x, y) {
        Object.assign(this, {x, y});
    }

    set_size(width, height) {
        Object.assign(this, {width, height});
    }

    get_transformed_position() {
        return [this.x ?? 0, this.y ?? 0];
    }

    get_preferred_width() {
        return [80, 80];
    }

    get_preferred_height() {
        return [20, 20];
    }
}

const background = new Actor();
const windowGroup = {
    children: [],
    add_child(child) {
        this.children.push(child);
    },
    get_children() {
        return [...this.children];
    },
    set_child_above_sibling(child, sibling) {
        this.children.splice(this.children.indexOf(child), 1);
        this.children.splice(this.children.indexOf(sibling) + 1, 0, child);
    },
};
const Widget = new Function('Extension', 'St', 'Clutter', 'GLib', 'Meta', 'Main', 'global', source)(
    class {}, {BoxLayout: Actor, Label: Actor, Icon: Actor, Widget: Actor}, {ActorAlign: {CENTER: 0}}, GLib,
    {WindowType: {DESKTOP: 0}}, {layoutManager: {_backgroundGroup: background, primaryIndex: 0, primaryMonitor: {}}},
    {
        window_group: windowGroup,
        workspace_manager: {get_active_workspace: () => ({
            get_work_area_for_monitor: () => ({x: 0, y: 0, width: 300, height: 200}),
        })},
    });
const widget = new Widget();
widget._hourly = new Actor();
widget._daily = new Actor();
widget._hourlyTab = new Actor();
widget._dailyTab = new Actor();
widget._settingsButton = new Actor();
widget._forecastTargets = [];
widget._tooltip = new Actor({visible: false});
widget._forecastMode = 'hourly';
widget._widget = new Actor({width: 200});
widget._settingsButtonSlot = new Actor({width: 20, height: 18});
widget._hourlyTabSlot = new Actor({width: 72, height: 24});
widget._dailyTabSlot = new Actor({width: 72, height: 24});
const assert = (condition, message) => {
    if (!condition)
        throw new Error(message);
};

const hiddenApp = {mapped: false, meta_window: {get_window_type: () => 1}};
const desktop = {mapped: true, meta_window: {get_window_type: () => 1, customJS_ding: {keepAtBottom: true}}};
const secondDesktop = {mapped: true, meta_window: {get_window_type: () => 1, customJS_ding: {keepAtBottom: true}}};
const desktopWindow = {mapped: true, meta_window: {get_window_type: () => 0}};
const application = {mapped: true, meta_window: {get_window_type: () => 1}};
const controls = [widget._settingsButton, widget._hourlyTab, widget._dailyTab, widget._tooltip];
windowGroup.children = [background, hiddenApp, desktop, secondDesktop, desktopWindow, application, ...controls];
widget._restackControls();
assert(windowGroup.children.indexOf(desktopWindow) < windowGroup.children.indexOf(widget._settingsButton) &&
    windowGroup.children.indexOf(widget._dailyTab) < windowGroup.children.indexOf(application),
    'Controls must be above all desktop windows and below applications, even with hidden windows');
windowGroup.children = [background, desktop, application, ...controls];
widget._restackControls();
assert(windowGroup.children.indexOf(desktop) < windowGroup.children.indexOf(widget._settingsButton) &&
    windowGroup.children.indexOf(widget._dailyTab) < windowGroup.children.indexOf(application),
    'Controls must be restacked after desktop windows change');
windowGroup.children = [background, application, ...controls];
widget._restackControls();
assert(windowGroup.children.indexOf(background) < windowGroup.children.indexOf(widget._settingsButton) &&
    windowGroup.children.indexOf(widget._dailyTab) < windowGroup.children.indexOf(application),
    'Controls must stay below applications when there is no desktop window');

const hours = Array.from({length: 6}, (_, i) => ({
    time: `${String(i).padStart(2, '0')}:00`,
    temperature: i - 2,
    conditions: i === 1 ? 'Slight rain' : i === 2 ? 'Mainly clear' : i === 3 ? 'Heavy rain' : 'Clear sky',
    weatherCode: i === 1 ? 61 : i === 2 ? 1 : i === 3 ? 65 : 0,
    isDay: i < 2,
    windSpeed: i === 3 ? 25.1 : 25,
}));
widget._updateHourly(hours, 'mph');
assert(widget._hourly.children.length === 6, 'Expected six hourly forecast columns');
const rain = widget._hourly.children[1];
assert(rain.children[0].text === '01:00', 'Hour label is incorrect');
assert(rain.children[1].icon_name === 'weather-showers-symbolic', 'Forecast icon is incorrect');
assert(rain.children[2].text === '-1°', 'Forecast temperature is incorrect');
assert(widget._hourly.children[2].children[1].icon_name === 'weather-few-clouds-night-symbolic',
    'Mainly clear nighttime forecast must use the night icon');
assert(widget._weatherIconForCode(1, 'large', false) === 'weather-few-clouds-night-symbolic' &&
    widget._weatherIconForCode(1, 'large', true) === 'weather-few-clouds-symbolic' &&
    widget._weatherIconForCode(0, 'large', true) === 'weather-clear-symbolic',
    'WMO clear-sky codes must select distinct daytime and nighttime icons');
assert(widget._hourly.children[3].children[1].icon_name === 'weather-windy-symbolic' &&
    widget._forecastTargets[3].actor.accessible_name === 'Heavy rain · Wind 25.1 mph',
    'Hourly wind above 25 mph must use the wind icon and explain it');
assert(widget._weatherIconForCode(97) === 'weather-storm-symbolic',
    'Heavy thunderstorm must use the storm icon');
assert(!widget._isWindy(25, 'mph') && widget._isWindy(25.01, 'mph') &&
    !widget._isWindy(40.2336, 'km/h') && widget._isWindy(40.234, 'km/h'),
    'Wind threshold must be strictly above 25 mph in both units');
assert(widget._weatherIconForCode(19, 'large', true, true) === 'weather-tornado-symbolic' &&
    widget._weatherIconForCode(61, 'large', true, true) === 'weather-windy-symbolic',
    'Tornado must take precedence over wind, and wind over other weather');
const hourlyTarget = widget._forecastTargets[1];
assert(hourlyTarget.actor.reactive && hourlyTarget.actor.visible, 'Hourly icon must have a hover target');
assert(windowGroup.children.indexOf(hourlyTarget.actor) < windowGroup.children.indexOf(application) &&
    windowGroup.children.indexOf(widget._tooltip) < windowGroup.children.indexOf(application),
    'Forecast targets and tooltip must remain below application windows');
Object.assign(hourlyTarget.icon, {x: 290, y: 40, width: 20, height: 20});
hourlyTarget.icon.emit('notify::allocation');
assert(hourlyTarget.actor.x === 290 && hourlyTarget.actor.y === 40 &&
    hourlyTarget.actor.width === 20 && hourlyTarget.actor.height === 20,
    'Hover target must follow the forecast icon allocation');
hourlyTarget.actor.hover = true;
hourlyTarget.actor.emit('notify::hover');
assert(widget._tooltip.visible && widget._tooltip.text === 'Slight rain' && widget._tooltip.x === 220,
    'Hourly tooltip must show the forecast and fit within the work area');
hourlyTarget.actor.hover = false;
hourlyTarget.actor.emit('notify::hover');
assert(!widget._tooltip.visible, 'Tooltip must hide when the pointer leaves');
hourlyTarget.actor.hover = true;
hourlyTarget.actor.emit('notify::hover');
widget._updateHourly(hours, 'mph');
assert(widget._hourly.children.length === 6 && hourlyTarget.actor.destroyed && !widget._tooltip.visible &&
    widget._forecastTargets.length === 6, 'Refreshing must replace hover targets and hide stale tooltips');

const days = Array.from({length: 6}, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    high: i + 10,
    low: i - 2,
    conditions: i === 1 ? 'Slight rain' : 'Clear sky',
    weatherCode: i === 1 ? 61 : 0,
    windSpeedMax: i === 2 ? 41 : 40,
}));
widget._updateDaily(days, 'km/h');
assert(widget._daily.children.length === 6, 'Expected six daily forecast columns');
const rainyDay = widget._daily.children[1];
assert(rainyDay.children[0].text.includes('02'), 'Daily date label is incorrect');
assert(rainyDay.children[1].icon_name === 'weather-showers-symbolic', 'Daily icon is incorrect');
assert(rainyDay.children[2].text === '11°' && rainyDay.children[3].text === '-1°',
    'Daily high and low are incorrect');
assert(widget._daily.children[2].children[1].icon_name === 'weather-windy-symbolic' &&
    widget._forecastTargets[8].actor.accessible_name === 'Clear sky · Max wind 41 km/h',
    'Daily wind icon must use the daily maximum wind speed');
widget._weatherIcon = new Actor();
widget._currentWeatherCode = 19;
widget._currentIsDay = false;
widget._currentIsWindy = true;
widget._setColorIcons(true);
assert(widget._weatherIcon.icon_name === 'weather-tornado-large' &&
    widget._hourly.children[1].children[1].icon_name === 'weather-showers-small' &&
    widget._hourly.children[2].children[1].icon_name === 'weather-few-clouds-night-small' &&
    widget._hourly.children[3].children[1].icon_name === 'weather-windy-small' &&
    rainyDay.children[1].icon_name === 'weather-showers-small',
    'Enabling color icons must update current and forecast icons');
widget._setColorIcons(false);
assert(widget._weatherIcon.icon_name === 'weather-tornado-symbolic' &&
    widget._hourly.children[1].children[1].icon_name === 'weather-showers-symbolic' &&
    widget._hourly.children[2].children[1].icon_name === 'weather-few-clouds-night-symbolic' &&
    widget._hourly.children[3].children[1].icon_name === 'weather-windy-symbolic' &&
    rainyDay.children[1].icon_name === 'weather-showers-symbolic',
    'Disabling color icons must restore symbolic icons');
widget._setForecastMode('daily');
assert(widget._daily.visible && !widget._hourly.visible && widget._dailyTab.style_class.includes('selected'),
    'Daily tab did not switch views');
const dailyTarget = widget._forecastTargets.find(target => target.mode === 'daily' && target.icon === rainyDay.children[1]);
assert(dailyTarget.actor.visible && widget._forecastTargets.filter(target => target.mode === 'hourly')
    .every(target => !target.actor.visible), 'Only daily hover targets should be visible');
Object.assign(dailyTarget.actor, {x: 10, y: 5, width: 20, height: 20, hover: true});
dailyTarget.actor.emit('notify::hover');
assert(widget._tooltip.visible && widget._tooltip.text === 'Slight rain' && widget._tooltip.y === 29,
    'Daily tooltip must show its forecast below an icon near the top edge');
widget._setForecastMode('hourly');
assert(!widget._tooltip.visible && !dailyTarget.actor.visible, 'Switching tabs must hide the daily tooltip');
widget._setForecastMode('daily');
widget._updateDaily(days, 'km/h');
assert(widget._daily.visible && widget._daily.children.length === 6 && dailyTarget.actor.destroyed &&
    widget._forecastTargets.length === 12, 'Refreshing must replace daily hover targets');
widget._setForecastMode('hourly');
assert(widget._hourly.visible && !widget._daily.visible && widget._hourlyTab.style_class.includes('selected'),
    'Hourly tab did not switch views');
print('Forecast widget checks passed');
