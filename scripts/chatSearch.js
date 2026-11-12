import { MODULE_ID } from "./main.js";
import { cleanText, htmlToText } from "./lib/utils.js";
import { getSetting } from "./settings.js";

const RESULT_LIMIT = 100;
const states = new Map();
const textCache = new WeakMap();

export function registerChatSearch() {
    Hooks.on("renderChatLog", onRenderChatLog);
    Hooks.on("closeChatLog", (app) => states.delete(app));
    const refresh = foundry.utils.debounce(refreshAll, 250);
    for (const hook of ["createChatMessage", "updateChatMessage", "deleteChatMessage"]) Hooks.on(hook, refresh);
}

function onRenderChatLog(app, html) {
    let header = html.querySelector(`.${MODULE_ID}-chat-search`);
    if (!getSetting("chatSearch")) {
        header?.remove();
        states.delete(app);
        showLog(html);
        return;
    }
    if (!header) {
        const label = game.i18n.localize(`${MODULE_ID}.chat.search`);
        header = document.createElement("header");
        header.className = `directory-header ${MODULE_ID}-chat-search`;
        header.innerHTML = `<search><i class="inline-control icon fa-solid fa-magnifying-glass" inert></i><input type="search" name="${MODULE_ID}-chat-search" autocomplete="off"></search>`;
        const input = header.querySelector("input");
        input.placeholder = label;
        input.ariaLabel = label;
        html.prepend(header);
    }
    let state = states.get(app);
    if (!state) {
        state = { query: "", token: null, input: null };
        state.filter = new foundry.applications.ux.SearchFilter({
            inputSelector: `input[name="${MODULE_ID}-chat-search"]`,
            callback: (event, query) => search(app, query),
        });
        states.set(app, state);
    }
    const input = header.querySelector("input");
    if (state.input !== input) {
        state.input = input;
        state.filter.bind(html);
    } else if (state.query) search(app, state.query);
}

function refreshAll() {
    for (const [app, state] of states) {
        if (app.rendered && state.query) search(app, state.query);
    }
}

function showLog(html) {
    html.querySelector(`.${MODULE_ID}-chat-results`)?.remove();
    const log = html.querySelector(".chat-scroll > ol.chat-log");
    if (log) log.style.display = "";
}

async function search(app, query) {
    const state = states.get(app);
    if (!state || !app.element) return;
    state.query = query;
    const token = (state.token = {});
    if (!query) {
        showLog(app.element);
        app.scrollBottom?.();
        return;
    }

    const text = cleanText(query);
    const matches = game.messages.contents.filter((message) => message.visible && messageText(message).includes(text)).sort((a, b) => a.timestamp - b.timestamp);
    const shown = matches.slice(-RESULT_LIMIT);
    const elements = (await Promise.all(shown.map((message) => message.renderHTML().catch(() => null)))).filter(Boolean);
    if (state.token !== token || !app.rendered) return;

    const scroll = app.element.querySelector(".chat-scroll");
    const log = scroll?.querySelector(":scope > ol.chat-log");
    if (!scroll || !log) return;
    let results = scroll.querySelector(`.${MODULE_ID}-chat-results`);
    if (!results) {
        results = document.createElement("ol");
        results.className = `chat-log plain ${MODULE_ID}-chat-results`;
        log.after(results);
    }
    const hint = matches.length ? (matches.length > shown.length ? game.i18n.format(`${MODULE_ID}.chat.truncated`, { shown: shown.length, total: matches.length }) : null) : game.i18n.localize(`${MODULE_ID}.chat.noResults`);
    if (hint) {
        const li = document.createElement("li");
        li.className = `${MODULE_ID}-chat-hint hint`;
        li.textContent = hint;
        elements.unshift(li);
    }
    results.replaceChildren(...elements);
    log.style.display = "none";
    scroll.scrollTop = scroll.scrollHeight;
}

function messageText(message) {
    const stamp = message._stats?.modifiedTime ?? message.timestamp;
    const cached = textCache.get(message);
    if (cached?.stamp === stamp) return cached.text;
    const parts = [message.alias, htmlToText(message.flavor)];
    if (message.isContentVisible) {
        parts.push(htmlToText(message.content));
        for (const roll of message.rolls) parts.push(roll.formula, roll.total);
    }
    const text = cleanText(parts.filter((part) => part !== undefined && part !== null).join(" "));
    textCache.set(message, { stamp, text });
    return text;
}
