import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class DesktopWeatherExtension extends Extension {
    async enable() {
        const [, contents] = this.dir.get_child('widget-module').load_contents(null);
        const moduleName = new TextDecoder().decode(contents).trim();
        if (!/^widget-[a-f0-9]{64}\.js$/.test(moduleName))
            throw new Error('Invalid Desktop Weather widget module name');

        const module = await import(this.dir.get_child(moduleName).get_uri());
        this._widgetExtension = new module.default(this.metadata);
        this._widgetExtension.enable();
        try {
            GLib.file_set_contents(this.dir.get_child('active-widget').get_path(), moduleName);
        } catch (error) {
            this._widgetExtension.disable();
            this._widgetExtension = null;
            throw error;
        }
    }

    disable() {
        this._widgetExtension.disable();
        this._widgetExtension = null;
    }
}
