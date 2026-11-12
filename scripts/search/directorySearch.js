import { FuzzySet } from "../lib/fuzzyset.js";
import { cleanText, queryFromRegExp } from "../lib/utils.js";
import { getListSetting } from "../settings.js";

const FUZZY_NAME_SCORE = 0.6;
const FUZZY_PROP_SCORE = 0.7;
const journalTargets = new Map();
const nameSetCache = new WeakMap();

export function consumeJournalTarget(uuid) {
    const target = journalTargets.get(uuid);
    journalTargets.delete(uuid);
    return target;
}

export function matchSearchEntries(query, entryIds, folderIds, autoExpandIds) {
    const collection = this.collection;
    const search = parseQuery(queryFromRegExp(query));
    const nameOnlySearch = collection.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME;
    const entries = collection.index ?? collection.contents;
    const matchedFolderIds = new Set(folderIds);
    const fuzzyNames = search.type === "name" ? fuzzyNameMatches(collection, entries, search.text) : null;
    const props = search.type !== "deep" && collection.documentName === "Actor" ? getListSetting("props") : [];
    const onMatch = (folder) => matchFolder(collection, folder, folderIds, autoExpandIds);
    if (search.type === "deep" && collection.documentName === "JournalEntry") journalTargets.clear();

    for (const entry of entries) {
        if (matchedFolderIds.has(entry.folder?._id ?? entry.folder)) entryIds.add(entry._id);
        let matched;
        if (search.type === "deep") matched = deepMatch(entry, search);
        else matched = (nameOnlySearch && query.test(foundry.applications.ux.SearchFilter.cleanQuery(entry.name ?? ""))) || !!fuzzyNames?.has(entry.name?.toLowerCase()) || propMatch(entry, search, props);
        if (!matched) continue;
        entryIds.add(entry._id);
        onMatch(entry.folder);
    }

    if (nameOnlySearch || search.type === "deep") return;

    for (const match of collection.search({ query: search.raw, exclude: Array.from(entryIds) })) {
        if (entryIds.has(match._id)) continue;
        entryIds.add(match._id);
        onMatch(match.folder);
    }
}

function parseQuery(raw) {
    if (raw.startsWith("&")) {
        const groups = raw
            .slice(1)
            .split(/\|\|?/)
            .map((group) => group.split("&&").map(cleanText).map((term) => term.trim()).filter(Boolean))
            .filter((group) => group.length);
        return { type: "deep", raw, groups };
    }
    if (raw.startsWith("!")) return { type: "exact", raw, text: cleanText(raw.slice(1)).trim() };
    return { type: "name", raw, text: cleanText(raw) };
}

function matchFolder(collection, folder, folderIds, autoExpandIds) {
    if (typeof folder === "string") folder = collection.folders.get(folder);
    while (folder && !folderIds.has(folder._id)) {
        folderIds.add(folder._id);
        autoExpandIds.add(folder._id);
        folder = folder.folder;
    }
}

function fuzzyNameMatches(collection, entries, text) {
    const names = entries.map((entry) => entry.name).filter((name) => typeof name === "string");
    const signature = names.join("\n");
    let cached = nameSetCache.get(collection);
    if (cached?.signature !== signature) {
        cached = { signature, set: new FuzzySet(names) };
        nameSetCache.set(collection, cached);
    }
    return new Set(cached.set.get(text, FUZZY_NAME_SCORE).map(([, name]) => name.toLowerCase()));
}

function deepMatch(entry, search) {
    if (!search.groups.length) return false;
    const text = cleanText(JSON.stringify(entry));
    const group = search.groups.find((terms) => terms.every((term) => text.includes(term)));
    if (!group) return false;
    if (entry.documentName === "JournalEntry" && entry.pages) {
        const target = findJournalTarget(entry, group[0]);
        if (target) journalTargets.set(entry.uuid, target);
    }
    return true;
}

function propMatch(entry, search, props) {
    if (!props.length || !entry.system || !search.text) return false;
    for (const prop of props) {
        const value = foundry.utils.getProperty(entry.system, prop);
        if (value === undefined || value === null || typeof value === "object") continue;
        const text = cleanText(value);
        if (search.type === "exact") {
            if (text === search.text) return true;
            continue;
        }
        if (text.includes(search.text)) return true;
        if (typeof value === "string" && new FuzzySet([text]).get(search.text, FUZZY_PROP_SCORE).length) return true;
    }
    return false;
}

function findJournalTarget(journal, term) {
    for (const page of journal.pages) {
        if (page.type === "text") {
            const template = document.createElement("template");
            template.innerHTML = page.text?.content ?? "";
            const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            let heading = null;
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (/^H[1-6]$/.test(node.tagName)) heading = node;
                    continue;
                }
                if (cleanText(node.textContent).includes(term)) return { pageId: page.id, anchor: anchorFor(page, heading) };
            }
            if (cleanText(template.content.textContent).includes(term)) return { pageId: page.id };
        }
        if (cleanText(page.name).includes(term)) return { pageId: page.id };
    }
    return null;
}

function anchorFor(page, heading) {
    if (!heading) return undefined;
    const text = heading.textContent.trim();
    return Object.values(page.toc ?? {}).find((entry) => entry.text === text)?.slug;
}
