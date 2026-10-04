import { appState } from '../store.js';

/**
 * @file How the flowchart is laid out — its direction, and whether arrows into one note merge — and the
 * one writer for both. No page, no disk.
 *
 * Not roles: a role points a part of the chart at a property (flowchart-options.js), and these hold
 * a word and a yes or no. So they have a store, a key in the layouts file (`flowchartLayout`, beside
 * `flowchart`) and a writer of their own, in the same shape as the roles': an unknown value is dropped
 * rather than corrected, and absent means the default. See plans/completed/flowchart-dagre-elk-layout.md,
 * *Layout settings*.
 */

/** Each setting, the values it may take, and its default — the first. */
const SETTINGS = {
    direction: ['TB', 'LR'],
    merge: [false, true],
};

/**
 * A setting's value: what was chosen, or the default.
 * @param {'direction'|'merge'} name
 * @returns {*}
 */
export function flowchartLayoutSetting(name) {
    return appState.flowchartLayout[name] ?? SETTINGS[name][0];
}

/**
 * Records a setting, or forgets it. The one way into appState.flowchartLayout.
 *
 * A name or value this does not know is dropped, and the default is stored as nothing, so choosing
 * it and never having chosen are the same state on disk.
 *
 * @param {string} name
 * @param {*} value - Text from a select is read as its value would be written: 'true' is true.
 * @returns {void}
 */
export function setFlowchartLayoutSetting(name, value) {
    if (!SETTINGS[name]) return;
    const read = value === 'true' ? true : value === 'false' ? false : value;
    if (!SETTINGS[name].includes(read) || read === SETTINGS[name][0]) delete appState.flowchartLayout[name];
    else appState.flowchartLayout[name] = read;
}

/**
 * Fills appState.flowchartLayout from a file's `flowchartLayout` object, replacing what was there, each
 * entry through the one writer.
 * @param {*} raw - As parsed from the file, or anything at all.
 * @returns {void}
 */
export function applyFlowchartLayoutFromFile(raw) {
    for (const name of Object.keys(appState.flowchartLayout)) delete appState.flowchartLayout[name];
    if (!raw || typeof raw !== 'object') return;
    for (const [name, value] of Object.entries(raw)) setFlowchartLayoutSetting(name, value);
}

/**
 * The settings as the object a file holds: only those someone changed.
 * @returns {Object}
 */
export function flowchartLayoutFromState() {
    return { ...appState.flowchartLayout };
}

/**
 * The settings, as the select rows in the options dialog show them.
 * @returns {{name: string, label: string, choices: {value: string, label: string}[]}[]}
 */
export function flowchartLayoutChoices() {
    return [
        { name: 'direction', label: 'direction', choices: [
            { value: 'TB', label: 'top to bottom' }, { value: 'LR', label: 'left to right' }] },
        { name: 'merge', label: 'arrows', choices: [
            { value: 'false', label: 'each its own line' }, { value: 'true', label: 'merged into a note' }] },
    ];
}
