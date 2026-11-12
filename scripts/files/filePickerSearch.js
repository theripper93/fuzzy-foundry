import { fileExtension, fileName, safeDecode } from "../lib/utils.js";
import { getSetting } from "../settings.js";
import { fileIndex } from "./fileIndex.js";

const BODY_TEMPLATE = "templates/apps/file-picker/body.hbs";
const RESULTS_ATTRIBUTE = "data-fuzzy-foundry-results";
const MODEL_EXTENSIONS = new Set(["glb", "gltf", "fbx"]);

export async function onFilePickerSearch(wrapped, event, query, rgx, html) {
    const result = wrapped(event, query, rgx, html);
    if (this.type === "folder" || !this.rendered) return result;
    const showingResults = !!this.element.querySelector(`[${RESULTS_ATTRIBUTE}]`);
    const active = fileIndex.enabled && fileIndex.ready && query.length >= getSetting("deepFileCharLimit");
    if (!active) {
        if (showingResults) await this.render({ parts: ["body"] });
        return result;
    }
    if (!isCurrentQuery(this, query)) return result;

    const results = fileIndex.search(query, {
        source: this.activeSource,
        folder: this.result?.target ?? "",
        extensions: pickerExtensions(this),
    });
    if (!results.length) {
        if (showingResults) await this.render({ parts: ["body"] });
        return result;
    }

    const files = results.map((entry) => toFileEntry(entry.path));
    const markup = await foundry.applications.handlebars.renderTemplate(BODY_TEMPLATE, { dirs: [], files, displayMode: this.displayMode, noResults: false });
    if (!this.rendered || !isCurrentQuery(this, query)) return result;

    const template = document.createElement("template");
    template.innerHTML = markup;
    const list = template.content.querySelector("ul.files-list");
    const section = this.element.querySelector("section[data-files]");
    if (!list || !section) return result;
    list.setAttribute(RESULTS_ATTRIBUTE, "");
    for (const li of list.querySelectorAll("li[data-file]")) {
        li.draggable = !!game.user.isGM;
        li.addEventListener("dragstart", onDragStart);
    }
    const existing = section.querySelector("ul.files-list");
    if (existing) existing.replaceWith(list);
    else section.append(list);
    section.querySelector(".hint")?.remove();
    const folders = section.querySelector("ul.folders");
    if (!folders || folders.style.display === "none") list.style.gridColumn = "1 / -1";
    this.setPosition({ height: "auto" });
    return result;
}

export function focusFilePickerSearch(app, html, context, options) {
    if (!options.isFirstRender || !app.hasFrame) return;
    html.querySelector('input[name="filter"]')?.focus();
}

function isCurrentQuery(app, query) {
    const input = app.element.querySelector('input[name="filter"]');
    return !input || foundry.applications.ux.SearchFilter.cleanQuery(input.value) === query;
}

function pickerExtensions(app) {
    if (!app.extensions?.length) return null;
    return new Set(app.extensions.map((extension) => extension.replace(/^\./, "").toLowerCase()));
}

function toFileEntry(path) {
    const { ImageHelper, VideoHelper } = foundry.helpers.media;
    const extension = fileExtension(path);
    let img;
    let icon;
    if (VideoHelper.hasVideoExtension(path)) icon = "fa-solid fa-file-video";
    else if (foundry.audio.AudioHelper.hasAudioExtension(path)) icon = "fa-solid fa-file-audio";
    else if (ImageHelper.hasImageExtension(path)) {
        img = path;
        icon = "fa-solid fa-file-image";
    } else if (MODEL_EXTENSIONS.has(extension)) {
        icon = "fa-solid fa-cube";
        if (game.modules.get("filepicker-plus")?.active) img = `${path.slice(0, -extension.length)}webp`;
    } else icon = "fa-solid fa-file";
    return { name: safeDecode(fileName(path)), url: path, img, icon };
}

function onDragStart(event) {
    if (!game.user.isGM || !(canvas.activeLayer instanceof foundry.canvas.layers.TilesLayer)) {
        event.preventDefault();
        return;
    }
    const li = event.currentTarget;
    const tileSize = parseInt(li.closest("form")?.elements.tileSize?.value) || canvas.dimensions.size;
    const ratio = canvas.dimensions.size / tileSize;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Tile", texture: { src: li.dataset.path }, fromFilePicker: true, tileSize }));
    const img = li.querySelector("img");
    if (!img?.naturalWidth) return;
    const width = img.naturalWidth * ratio * canvas.stage.scale.x;
    const height = img.naturalHeight * ratio * canvas.stage.scale.y;
    const preview = foundry.applications.ux.DragDrop.implementation.createDragImage(img, width, height);
    event.dataTransfer.setDragImage(preview, width / 2, height / 2);
}
