import { MODULE_ID } from "./main.js";
import { fileIndex } from "./files/fileIndex.js";

export function registerSettings() {
    const reinitializeIndex = () => fileIndex.initialize();

    const settings = {
        deepFile: {
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
            onChange: reinitializeIndex,
        },
        deepFilePlayers: {
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: reinitializeIndex,
        },
        deepFileCharLimit: {
            scope: "world",
            config: true,
            type: Number,
            range: { min: 1, max: 10, step: 1 },
            default: 4,
        },
        deepFileExclude: {
            scope: "world",
            config: true,
            type: String,
            default: "",
        },
        indexWorlds: {
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
        },
        indexSystems: {
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
        },
        indexModules: {
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
        },
        useS3: {
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
        },
        useS3name: {
            scope: "world",
            config: true,
            type: String,
            default: "",
        },
        chatSearch: {
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => ui.chat.render({ force: true }),
        },
        props: {
            scope: "world",
            config: true,
            type: String,
            default: "details.cr",
        },
        excavateFilters: {
            scope: "world",
            config: true,
            type: String,
            default: "",
        },
        excavateWildcard: {
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
        },
        indexVersion: {
            scope: "world",
            config: false,
            type: String,
            default: "",
            onChange: () => fileIndex.load(),
        },
    };

    for (const [key, value] of Object.entries(settings)) {
        value.name ??= `${MODULE_ID}.settings.${key}.name`;
        value.hint ??= `${MODULE_ID}.settings.${key}.hint`;
        game.settings.register(MODULE_ID, key, value);
    }
}

export function getSetting(key) {
    return game.settings.get(MODULE_ID, key);
}

export async function setSetting(key, value) {
    return await game.settings.set(MODULE_ID, key, value);
}

export function getListSetting(key) {
    return getSetting(key)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}
