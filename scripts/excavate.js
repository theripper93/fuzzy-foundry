import { MODULE_ID } from "./main.js";
import { fileIndex } from "./files/fileIndex.js";
import { fileName } from "./lib/utils.js";
import { getListSetting, getSetting } from "./settings.js";

function imageExtensions() {
    return new Set([...Object.keys(CONST.IMAGE_FILE_EXTENSIONS), ...Object.keys(CONST.VIDEO_FILE_EXTENSIONS)]);
}

function longestCommonSubstring(a, b) {
    let common = "";
    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
            let length = 0;
            while (i + length < a.length && j + length < b.length && a[i + length] === b[j + length]) length++;
            if (length > common.length) common = a.substr(i, length);
        }
    }
    return common;
}

function makeWildcard(a, b) {
    const common = longestCommonSubstring(a, b);
    if (!common) return null;
    return a
        .split(common)
        .map((part) => (part ? "*" : ""))
        .join(common)
        .replace(/\*+/g, "*");
}

export function findImage(name, { wildcard = false, filters = getListSetting("excavateFilters") } = {}) {
    if (!fileIndex.ready) {
        ui.notifications.warn(`${MODULE_ID}.excavate.noIndex`, { localize: true });
        return undefined;
    }
    const [first, second] = fileIndex.search(name, { extensions: imageExtensions(), include: filters, limit: 2 });
    if (!first) return undefined;
    if (!wildcard || !second) return first.path;
    const folder = first.path.slice(0, first.path.lastIndexOf("/") + 1);
    if (second.path.slice(0, second.path.lastIndexOf("/") + 1) !== folder) return first.path;
    const pattern = makeWildcard(fileName(first.path), fileName(second.path));
    return pattern?.includes("*") ? folder + pattern : first.path;
}

export function registerExcavate() {
    foundry.canvas.placeables.Token.prototype.excavate = async function (wildCheck = false, filters) {
        const path = findImage(this.actor?.name ?? this.document.name, { filters: filters ?? getListSetting("excavateFilters") });
        if (path) await this.document.update({ "texture.src": path });
        return path;
    };

    foundry.documents.Actor.prototype.excavate = async function (wildCheck = true, filters) {
        filters ??= getListSetting("excavateFilters");
        const wildcard = wildCheck && getSetting("excavateWildcard");
        const tokenPath = findImage(this.name, { wildcard, filters });
        if (!tokenPath) return undefined;
        const update = { "prototypeToken.texture.src": tokenPath, "prototypeToken.randomImg": tokenPath.includes("*") };
        const defaultImg = this.constructor.getDefaultArtwork(this.toObject()).img;
        if (!this.img || this.img === defaultImg || this.img === CONST.DEFAULT_TOKEN) update.img = findImage(this.name, { filters }) ?? this.img;
        await this.update(update);
        return tokenPath;
    };

    foundry.documents.collections.Actors.prototype.excavateAll = async function (wildCheck = true, filters, folderName) {
        const folder = folderName ? game.folders.find((f) => f.type === "Actor" && f.name === folderName) : null;
        if (folderName && !folder) {
            ui.notifications.error(game.i18n.format(`${MODULE_ID}.excavate.folderNotFound`, { folder: folderName }));
            return [];
        }
        const results = [];
        for (const actor of this.filter((a) => !folder || a.folder?.id === folder.id)) {
            results.push({ actor: actor.name, path: (await actor.excavate(wildCheck, filters)) ?? null });
        }
        return results;
    };
}
