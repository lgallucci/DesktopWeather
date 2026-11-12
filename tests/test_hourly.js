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
    }

    add_child(child) {
        this.children.push(child);
    }

    destroy_all_children() {
        this.children = [];
    }

    set_style_class_name(name) {
        this.style_class = name;
    }
}

const background = new Actor();
const windowGroup = {
    children: [],
    get_children() {
        return [...this.children];
    },
    set_child_above_sibling(child, sibling) {
        this.children.splice(this.children.indexOf(child), 1);
        this.children.splice(this.children.indexOf(sibling) + 1, 0, child);
    },
};
const Widget = new Function('Extension', 'St', 'Clutter', 'GLib', 'Meta', 'Main', 'global', source)(
    class {}, {BoxLayout: Actor, Label: Actor, Icon: Actor}, {ActorAlign: {CENTER: 0}}, GLib,
    {WindowType: {DESKTOP: 0}}, {layoutManager: {_backgroundGroup: background}}, {window_group: windowGroup});
const widget = new Widget();
widget._hourly = new Actor();
widget._daily = new Actor();
widget._hourlyTab = new Actor();
widget._dailyTab = new Actor();
widget._settingsButton = new Actor();
const assert = (condition, message) => {
    if (!condition)
        throw new Error(message);
};

const hiddenApp = {mapped: false, meta_window: {get_window_type: () => 1}};
const desktop = {mapped: true, meta_window: {get_window_type: () => 1, customJS_ding: {keepAtBottom: true}}};
const secondDesktop = {mapped: true, meta_window: {get_window_type: () => 1, customJS_ding: {keepAtBottom: true}}};
const desktopWindow = {mapped: true, meta_window: {get_window_type: () => 0}};
const application = {mapped: true, meta_window: {get_window_type: () => 1}};
const controls = [widget._settingsButton, widget._hourlyTab, widget._dailyTab];
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
    conditions: i === 1 ? 'Rain' : 'Clear sky',
}));
widget._updateHourly(hours);
assert(widget._hourly.children.length === 6, 'Expected six hourly forecast columns');
const rain = widget._hourly.children[1];
assert(rain.children[0].text === '01:00', 'Hour label is incorrect');
assert(rain.children[1].icon_name === 'weather-showers-symbolic', 'Forecast icon is incorrect');
assert(rain.children[2].text === '-1°', 'Forecast temperature is incorrect');
widget._updateHourly(hours);
assert(widget._hourly.children.length === 6, 'Refreshing duplicated hourly columns');

const days = Array.from({length: 6}, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    high: i + 10,
    low: i - 2,
    conditions: i === 1 ? 'Rain' : 'Clear sky',
}));
widget._updateDaily(days);
assert(widget._daily.children.length === 6, 'Expected six daily forecast columns');
const rainyDay = widget._daily.children[1];
assert(rainyDay.children[0].text.includes('02'), 'Daily date label is incorrect');
assert(rainyDay.children[1].icon_name === 'weather-showers-symbolic', 'Daily icon is incorrect');
assert(rainyDay.children[2].text === '11°' && rainyDay.children[3].text === '-1°',
    'Daily high and low are incorrect');
widget._setForecastMode('daily');
assert(widget._daily.visible && !widget._hourly.visible && widget._dailyTab.style_class.includes('selected'),
    'Daily tab did not switch views');
widget._updateDaily(days);
assert(widget._daily.visible && widget._daily.children.length === 6, 'Refreshing changed or duplicated the daily view');
widget._setForecastMode('hourly');
assert(widget._hourly.visible && !widget._daily.visible && widget._hourlyTab.style_class.includes('selected'),
    'Hourly tab did not switch views');
print('Forecast widget checks passed');
