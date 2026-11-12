import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const root = Gio.File.new_for_path(System.programInvocationName).get_parent().get_parent();
const loaderFile = root.get_child('extension').get_child('desktop-weather@local').get_child('extension.js');
const [, loaderBytes] = loaderFile.load_contents(null);
const loaderSource = new TextDecoder().decode(loaderBytes)
    .replace(/^import .*;$/gm, '')
    .replace('export default class', 'return class');
const Loader = new Function('GLib', 'Extension', loaderSource)(GLib, class {
    constructor(metadata) {
        this.metadata = metadata;
        this.dir = metadata.dir;
    }
});

const directory = Gio.File.new_for_path(GLib.dir_make_tmp('desktop-weather-test-XXXXXX'));
const firstName = `widget-${'a'.repeat(64)}.js`;
const secondName = `widget-${'b'.repeat(64)}.js`;
const files = [firstName, secondName, 'widget-module', 'active-widget'];
const write = (name, contents) => GLib.file_set_contents(directory.get_child(name).get_path(), contents);
const assert = (condition, message) => {
    if (!condition)
        throw new Error(message);
};

try {
    for (const [name, version] of [[firstName, 1], [secondName, 2]]) {
        write(name, `export default class {
            enable() { globalThis.testWidgetVersion = ${version}; }
            disable() { globalThis.testWidgetVersion = 0; }
        }`);
    }

    const loader = new Loader({dir: directory});
    write('widget-module', firstName);
    await loader.enable();
    assert(globalThis.testWidgetVersion === 1, 'First widget did not activate');
    let [, activeBytes] = directory.get_child('active-widget').load_contents(null);
    assert(new TextDecoder().decode(activeBytes) === firstName, 'Active module was not recorded');
    loader.disable();
    assert(globalThis.testWidgetVersion === 0, 'First widget did not disable');

    write('widget-module', secondName);
    await loader.enable();
    assert(globalThis.testWidgetVersion === 2, 'Updated widget did not activate');
    loader.disable();

    write('widget-module', '../invalid.js');
    let rejected = false;
    try {
        await loader.enable();
    } catch (error) {
        rejected = error.message.includes('Invalid Desktop Weather widget module name');
    }
    assert(rejected, 'Invalid module name was not rejected');
    print('Widget reload checks passed');
} finally {
    for (const name of files) {
        const file = directory.get_child(name);
        if (file.query_exists(null))
            file.delete(null);
    }
    directory.delete(null);
}
