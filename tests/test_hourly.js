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

class SignalSource {
    constructor() {
        this.handlers = new Map();
        this.nextId = 1;
    }

    connect(name, callback) {
        const id = this.nextId++;
        this.handlers.set(id, {name, callback});
        return id;
    }

    disconnect(id) {
        this.handlers.delete(id);
    }

    emit(name) {
        for (const handler of this.handlers.values()) {
            if (handler.name === name)
                handler.callback();
        }
    }
}

class WindowActor extends SignalSource {
    constructor(title, type, x, y, width, height) {
        super();
        this.meta_window = new SignalSource();
        this.meta_window.get_title = () => title;
        this.meta_window.get_window_type = () => type;
        Object.assign(this, {x, y, width, height, painted: true});
    }

    get_paint_visibility() {
        return this.painted;
    }

    get_transformed_position() {
        return [this.x, this.y];
    }

    get_transformed_size() {
        return [this.width, this.height];
    }
}

let windows = [];
const Widget = new Function('Extension', 'St', 'Clutter', 'GLib', 'Meta', 'Main', 'global', source)(
    class {}, {BoxLayout: Actor, Label: Actor, Icon: Actor}, {ActorAlign: {CENTER: 0}}, GLib,
    {WindowType: {DESKTOP: 0}}, {}, {get_window_actors: () => windows});
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

Object.assign(widget._hourlyTab, {x: 0, y: 0, width: 72, height: 24});
Object.assign(widget._dailyTab, {x: 76, y: 0, width: 72, height: 24});
Object.assign(widget._settingsButton, {x: 150, y: 0, width: 18, height: 18});
widget._windowSignals = new Map();
const desktop = new WindowActor('Desktop Icons 1', 1, 0, 0, 300, 300);
const desktopWindow = new WindowActor(null, 0, 0, 0, 300, 300);
const application = new WindowActor('Application', 1, 200, 0, 100, 100);
windows = [desktop, desktopWindow, application];
widget._syncWindows();
assert(widget._hourlyTab.visible && widget._dailyTab.visible && widget._settingsButton.visible,
    'Desktop and non-overlapping windows must not hide controls');
application.x = 50;
application.meta_window.emit('position-changed');
assert(!widget._hourlyTab.visible && !widget._dailyTab.visible && widget._settingsButton.visible,
    'Overlapping windows must hide only the affected controls');
application.x = 140;
application.meta_window.emit('position-changed');
assert(widget._hourlyTab.visible && !widget._dailyTab.visible && !widget._settingsButton.visible,
    'Controls must respond when a window moves');
application.painted = false;
application.emit('notify::mapped');
assert(widget._hourlyTab.visible && widget._dailyTab.visible && widget._settingsButton.visible,
    'Controls must reappear when a window is hidden');
windows = [desktop, desktopWindow];
widget._syncWindows();
assert(application.handlers.size === 0 && application.meta_window.handlers.size === 0,
    'Removed windows must have their signals disconnected');

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
