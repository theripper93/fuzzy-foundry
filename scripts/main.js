import { registerChatSearch } from "./chatSearch.js";
import { findImage, registerExcavate } from "./excavate.js";
import { fileIndex } from "./files/fileIndex.js";
import { focusFilePickerSearch, onFilePickerSearch } from "./files/filePickerSearch.js";
import { consumeJournalTarget, matchSearchEntries } from "./search/directorySearch.js";
import { getSetting, registerSettings } from "./settings.js";
import "../scss/module.scss";

export const MODULE_ID = "fuzzy-foundry";

Hooks.once("init", () => {
    registerSettings();
    libWrapper.register(MODULE_ID, "foundry.applications.sidebar.DocumentDirectory.prototype._matchSearchEntries", matchSearchEntries, "OVERRIDE");
    libWrapper.register(MODULE_ID, "foundry.applications.apps.FilePicker.implementation.prototype._onSearchFilter", onFilePickerSearch, "WRAPPER");
    libWrapper.register(MODULE_ID, "foundry.applications.apps.FilePicker.implementation.upload", onUpload, "WRAPPER");
    registerExcavate();
    registerChatSearch();
    game.modules.get(MODULE_ID).api = { fileIndex, findImage };
    try {
        localStorage.removeItem(`${MODULE_ID}.localFileCache`);
    } catch {}
});

Hooks.once("ready", () => {
    fileIndex.registerSocket();
    fileIndex.initialize();
});

Hooks.on("renderFilePicker", focusFilePickerSearch);

Hooks.on("renderJournalEntrySheet", (app, html, context, options) => {
    if (!options.isFirstRender) return;
    const target = consumeJournalTarget(app.document.uuid);
    if (target) app.goToPage(target.pageId, { anchor: target.anchor });
});

Hooks.on("renderSettings", (app, html) => {
    if (!game.user.isGM || html.querySelector(`#${MODULE_ID}-rebuild`)) return;
    const anchor = html.querySelector('button[data-app="modules"]');
    if (!anchor) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = `${MODULE_ID}-rebuild`;
    button.className = anchor.className;
    button.innerHTML = `<i class="fa-solid fa-server" inert></i> ${game.i18n.localize(`${MODULE_ID}.index.rebuild`)}`;
    button.addEventListener("click", async () => {
        if (!getSetting("deepFile")) return ui.notifications.warn(`${MODULE_ID}.index.disabled`, { localize: true });
        const icon = button.querySelector("i");
        button.disabled = true;
        icon.classList.replace("fa-server", "fa-spinner");
        icon.classList.add("fa-spin");
        try {
            await fileIndex.build();
        } finally {
            button.disabled = false;
            icon.classList.remove("fa-spin");
            icon.classList.replace("fa-spinner", "fa-server");
        }
    });
    anchor.after(button);
});

async function onUpload(wrapped, source, path, file, body = {}, options = {}) {
    const result = await wrapped(source, path, file, body, options);
    if (result?.path) fileIndex.onFileUploaded(source, result.path, body?.bucket);
    return result;
}
