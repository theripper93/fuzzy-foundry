import { MODULE_ID } from "../main.js";
import { FuzzySet } from "../lib/fuzzyset.js";
import { idbGet, idbSet } from "../lib/idb.js";
import { cleanText, createLimiter, fileExtension, fileName, normalizeName, safeDecode } from "../lib/utils.js";
import { getListSetting, getSetting, setSetting } from "../settings.js";

const INDEX_FILE = "index.json";
const FORMAT_VERSION = 2;
const CONCURRENCY = 24;
const FUZZY_FALLBACK_THRESHOLD = 10;
const FUZZY_MIN_SCORE = 0.5;
const FUZZY_CHUNK = 2000;
const SAVE_DELAY = 3000;
const MODEL_EXTENSIONS = ["glb", "gltf", "fbx"];
const OPT_IN_ROOTS = { worlds: "indexWorlds", systems: "indexSystems", modules: "indexModules" };
const URL_SOURCES = new Set(["s3", "forgevtt"]);


function splitPath(path) {
    const slash = path.lastIndexOf("/");
    return slash === -1 ? ["", path] : [path.slice(0, slash), path.slice(slash + 1)];
}

function isForge() {
    return typeof ForgeVTT !== "undefined" && ForgeVTT.usingTheForge;
}

class FileIndex {
    #data = null;
    #entries = [];
    #byKey = new Map();
    #fuzzy = null;
    #fuzzyToken = null;
    #building = null;
    #loading = null;
    #saveTimeout = null;
    #extensions = null;

    get extensions() {
        this.#extensions ??= new Set([...Object.keys(CONST.IMAGE_FILE_EXTENSIONS), ...Object.keys(CONST.VIDEO_FILE_EXTENSIONS), ...Object.keys(CONST.AUDIO_FILE_EXTENSIONS), ...MODEL_EXTENSIONS]);
        return this.#extensions;
    }

    get enabled() {
        return getSetting("deepFile") && (game.user.isGM || getSetting("deepFilePlayers"));
    }

    get ready() {
        return !!this.#data;
    }

    get building() {
        return !!this.#building;
    }

    get size() {
        return this.#entries.length;
    }

    get indexURL() {
        return foundry.utils.getRoute(`modules/${MODULE_ID}/storage/${INDEX_FILE}`);
    }

    registerSocket() {
        game.socket.on(`module.${MODULE_ID}`, ({ action, source, folder, bucket }) => {
            if (action === "refreshFolder" && game.users.activeGM?.isSelf) this.refreshFolder(source, folder, bucket);
        });
    }

    async initialize() {
        this.#clear();
        if (!this.enabled) return;
        await this.load({ autoBuild: true });
    }

    async load({ autoBuild = false } = {}) {
        if (!this.enabled) return this.#clear();
        if (this.#data && String(this.#data.created) === getSetting("indexVersion")) return;
        this.#loading ??= this.#load(autoBuild).finally(() => (this.#loading = null));
        return this.#loading;
    }

    async #load(autoBuild) {
        const signature = await this.#remoteSignature();
        let data = null;
        if (signature !== null) {
            const cached = signature ? await idbGet(this.indexURL) : null;
            data = cached?.signature === signature ? cached.data : await this.#download(signature);
        }
        if (data?.version !== FORMAT_VERSION) {
            this.#clear();
            if (autoBuild && game.users.activeGM?.isSelf) await this.build();
            return;
        }
        this.#setData(data);
    }

    async #remoteSignature() {
        try {
            const response = await fetch(this.indexURL, { method: "HEAD", cache: "no-store" });
            if (response.status === 404) return null;
            if (!response.ok) return "";
            return response.headers.get("etag") ?? response.headers.get("last-modified") ?? "";
        } catch {
            return "";
        }
    }

    async #download(signature) {
        try {
            const response = await fetch(this.indexURL, { cache: "no-store" });
            if (!response.ok) return null;
            const data = await response.json();
            if (signature) await idbSet(this.indexURL, { signature, data });
            return data;
        } catch (error) {
            console.warn(`${MODULE_ID} | Could not download the file index`, error);
            return null;
        }
    }

    #clear() {
        this.#data = null;
        this.#entries = [];
        this.#byKey = new Map();
        this.#fuzzy = null;
        this.#fuzzyToken = null;
    }

    #setData(data) {
        this.#clear();
        this.#data = data;
        for (const [source, dirs] of Object.entries(data.sources)) {
            for (const [dir, files] of Object.entries(dirs)) {
                for (const file of files) this.#addEntry(source, dir ? `${dir}/${file}` : file);
            }
        }
        this.#buildFuzzy();
    }

    #addEntry(source, path) {
        const name = safeDecode(fileName(path));
        const entry = { source, path, name, key: normalizeName(name), lowerPath: cleanText(safeDecode(path)), extension: fileExtension(path) };
        this.#entries.push(entry);
        if (!this.#byKey.has(entry.key)) this.#byKey.set(entry.key, []);
        this.#byKey.get(entry.key).push(entry);
        this.#fuzzy?.add(entry.key);
        return entry;
    }

    async #buildFuzzy() {
        const token = {};
        this.#fuzzyToken = token;
        const set = new FuzzySet();
        const keys = [...this.#byKey.keys()];
        for (let i = 0; i < keys.length; i += FUZZY_CHUNK) {
            if (this.#fuzzyToken !== token) return;
            for (const key of keys.slice(i, i + FUZZY_CHUNK)) set.add(key);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (this.#fuzzyToken !== token) return;
        for (const key of this.#byKey.keys()) set.add(key);
        this.#fuzzy = set;
    }

    search(query, { source = null, folder = "", extensions = null, include = [], limit = 1000 } = {}) {
        const text = normalizeName(query);
        if (!text || !this.ready) return [];
        const excluded = getListSetting("deepFileExclude").map(cleanText);
        const included = include.map(cleanText).filter(Boolean);
        const scope = folder.replace(/^\.\/?/, "").replace(/\/+$/, "");
        const accepts = (entry) =>
            (!extensions || extensions.has(entry.extension)) &&
            this.#inScope(entry, source, scope) &&
            !excluded.some((keyword) => entry.lowerPath.includes(keyword)) &&
            (!included.length || included.some((keyword) => entry.lowerPath.includes(keyword)));

        const ranked = [];
        for (const entry of this.#entries) {
            const index = entry.key.indexOf(text);
            if (index === -1 || !accepts(entry)) continue;
            const rank = index === 0 ? 0 : /[a-z0-9]/.test(entry.key[index - 1]) ? 2 : 1;
            ranked.push([rank, entry]);
        }
        ranked.sort(([rankA, a], [rankB, b]) => rankA - rankB || a.key.length - b.key.length || a.key.localeCompare(b.key));
        const results = ranked.map(([, entry]) => entry);

        if (results.length < FUZZY_FALLBACK_THRESHOLD && this.#fuzzy) {
            const seen = new Set(results);
            for (const [, key] of this.#fuzzy.get(text, FUZZY_MIN_SCORE)) {
                for (const entry of this.#byKey.get(key) ?? []) {
                    if (seen.has(entry) || !accepts(entry)) continue;
                    seen.add(entry);
                    results.push(entry);
                }
            }
        }
        return results.slice(0, limit);
    }

    #inScope(entry, source, folder) {
        if (!folder) return true;
        if (source && entry.source !== source) return false;
        if (URL_SOURCES.has(entry.source)) return safeDecode(entry.path).includes(`/${safeDecode(folder)}/`);
        return entry.path.startsWith(`${folder}/`);
    }

    async build() {
        if (!game.user.isGM) return false;
        this.#building ??= this.#build().finally(() => (this.#building = null));
        return this.#building;
    }

    async #build() {
        clearTimeout(this.#saveTimeout);
        const stats = { folders: 0, files: 0 };
        const progress = ui.notifications.info(game.i18n.localize(`${MODULE_ID}.index.building`), { progress: true });
        let lastPct = 0;
        let lastUpdate = 0;
        const update = (pending) => {
            const now = Date.now();
            if (now - lastUpdate < 500) return;
            lastUpdate = now;
            lastPct = Math.max(lastPct, Math.min(0.99, stats.folders / (stats.folders + pending + 1)));
            progress.update({ pct: lastPct, message: game.i18n.format(`${MODULE_ID}.index.progress`, stats) });
        };

        const sources = {};
        const forge = isForge();
        sources.data = await this.#scan("data", {}, stats, update, (dir) => {
            const optIn = OPT_IN_ROOTS[dir.toLowerCase()];
            return optIn ? getSetting(optIn) : !forge;
        });
        sources.public = await this.#scan("public", {}, stats, update);
        const bucket = getSetting("useS3name");
        if (getSetting("useS3") && bucket) sources.s3 = await this.#scan("s3", { bucket }, stats, update);
        if (forge) sources.forgevtt = await this.#scanForge(stats);

        const data = { version: FORMAT_VERSION, created: Date.now(), sources };
        this.#setData(data);
        const saved = await this.#save(data);
        progress.update({ pct: 1, message: game.i18n.format(`${MODULE_ID}.index.done`, stats) });
        if (!saved) ui.notifications.error(`${MODULE_ID}.index.saveFailed`, { localize: true, permanent: true });
        return saved;
    }

    async #scan(source, browseOptions, stats, update, includeRoot = () => true) {
        const FilePicker = foundry.applications.apps.FilePicker.implementation;
        const limit = createLimiter(CONCURRENCY);
        const dirs = {};
        let pending = 0;
        const visit = async (target, depth) => {
            pending++;
            let result;
            try {
                result = await limit(() => FilePicker.browse(source, target, browseOptions));
            } catch (error) {
                console.warn(`${MODULE_ID} | Could not index ${source}:${target}`, error);
            } finally {
                pending--;
            }
            if (!result || result.files.some((path) => fileName(path).toLowerCase() === "noscan.txt")) return;
            stats.folders++;
            for (const path of result.files) {
                if (!this.extensions.has(fileExtension(path))) continue;
                const [dir, name] = splitPath(path);
                (dirs[dir] ??= []).push(name);
                stats.files++;
            }
            update(pending);
            const children = depth === 0 ? result.dirs.filter(includeRoot) : result.dirs;
            await Promise.all(children.map((dir) => visit(dir, depth + 1)));
        };
        await visit("", 0);
        return dirs;
    }

    async #scanForge(stats) {
        const dirs = {};
        try {
            const response = await ForgeAPI.call("assets");
            for (const asset of response?.assets ?? []) {
                if (!asset.url || asset.name?.endsWith("/") || !this.extensions.has(fileExtension(asset.name ?? asset.url))) continue;
                const [dir, name] = splitPath(asset.url);
                (dirs[dir] ??= []).push(name);
                stats.files++;
            }
        } catch (error) {
            console.warn(`${MODULE_ID} | Could not list the Forge Assets Library`, error);
        }
        return dirs;
    }

    async #save(data) {
        const FilePicker = foundry.applications.apps.FilePicker.implementation;
        await this.#ensureStorage();
        const file = new File([JSON.stringify(data)], INDEX_FILE, { type: "application/json" });
        const result = await FilePicker.uploadPersistent(MODULE_ID, "", file, {}, { notify: false }).catch((error) => {
            console.error(`${MODULE_ID} | Could not save the file index`, error);
            return null;
        });
        if (!result?.path) return false;
        const signature = await this.#remoteSignature();
        if (signature) await idbSet(this.indexURL, { signature, data });
        await setSetting("indexVersion", String(data.created));
        return true;
    }

    async #ensureStorage() {
        const FilePicker = foundry.applications.apps.FilePicker.implementation;
        const target = `modules/${MODULE_ID}/storage`;
        try {
            const result = await FilePicker.browse("data", target);
            if (result.target.replace(/\/+$/, "") === target) return;
        } catch {}
        try {
            await FilePicker.createDirectory("data", target, { notify: false });
        } catch (error) {
            console.warn(`${MODULE_ID} | Could not create the storage folder`, error);
        }
    }

    onFileUploaded(source, path, bucket) {
        if (!getSetting("deepFile") || !path || !this.extensions.has(fileExtension(path))) return;
        const folder = splitPath(path)[0];
        if (game.users.activeGM?.isSelf) this.refreshFolder(source, folder, bucket);
        else game.socket.emit(`module.${MODULE_ID}`, { action: "refreshFolder", source, folder, bucket });
    }

    async refreshFolder(source, folder, bucket) {
        if (!this.#data || this.#building) return;
        const optIn = source === "data" ? OPT_IN_ROOTS[folder.split("/")[0].toLowerCase()] : null;
        if (optIn && !getSetting(optIn)) return;
        let result;
        try {
            result = await foundry.applications.apps.FilePicker.implementation.browse(source, folder, bucket ? { bucket } : {});
        } catch (error) {
            console.warn(`${MODULE_ID} | Could not refresh ${source}:${folder}`, error);
            return;
        }
        const dirs = (this.#data.sources[source] ??= {});
        let changed = false;
        for (const path of result.files) {
            if (!this.extensions.has(fileExtension(path))) continue;
            const [dir, name] = splitPath(path);
            const files = (dirs[dir] ??= []);
            if (files.includes(name)) continue;
            files.push(name);
            this.#addEntry(source, path);
            changed = true;
        }
        if (changed) this.#scheduleSave();
    }

    #scheduleSave() {
        clearTimeout(this.#saveTimeout);
        this.#saveTimeout = setTimeout(() => {
            if (!this.#data || this.#building) return;
            this.#data.created = Date.now();
            this.#save(this.#data);
        }, SAVE_DELAY);
    }
}

export const fileIndex = new FileIndex();
