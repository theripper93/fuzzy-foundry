class FilePickerDeepSearch {
  constructor() {
    this._fileCache = [];
    this._fileNameCache = [];
    this._fileIndexCache = {};
    if(game.user.isGM) this.buildCache();
  }

  async buildCache(dir = "./") {
    let content = await FilePicker.browse("user", dir);
    for (let directory of content.dirs) {
      this.buildCache(directory + "/");
    }
    for (let file of content.files) {
      const fileName = file.split("/").pop();
      this._fileCache.push(file);
      this._fileNameCache.push(fileName);
      this._fileIndexCache[fileName] = file;
    }
  }

  static _onSearchFilter(wrapped,event, query, rgx, html) {
    if(!game.settings.get("fuzzy-foundry", "deepFile") || !game.user.isGM){
      return wrapped(event, query, rgx, html);
    }
    if ((!query || query.length < 4) && !this.reset) {
      this.reset = true;
      this.render(true).then($(html).find(`input[name="filter"]`).focus());
      return wrapped(event, query, rgx, html);
    }
    if (!query || query.length < 4) {
      return wrapped(event, query, rgx, html);
    } else {
      this.reset = false;
    }
    const folder = $(html).find(`input[name="target"]`)[0].value;
    const cache = canvas.deepSearchCache;
    const fs = FuzzySearchFilters.FuzzySet(cache._fileNameCache, true);
    const queryRes= fs.get(query)
    let qresult = queryRes ? queryRes.filter((e) => {
      return e[0]>0.3}).map((r) => r[1]) || [] : [];
    if(qresult.length == 0) {
      return wrapped(event, query, rgx, html)
    }
    $("section.filepicker-body").html("");
    let $ol = $(`<ol class="directory files-list thumbs-list">`);

    for (let file of qresult) {
      if(!cache._fileIndexCache[file]?.startsWith-(folder)) continue
      $ol.append(`
        <li class="file flexrow" data-path="${cache._fileIndexCache[file]}" draggable="true">
        <img width="48" height="48" src="${cache._fileIndexCache[file]}">
        <span class="filename">${file}</span>
        </li>
        `);
    }
    $("section.filepicker-body").append($ol);
    const _this = this;
    this.element.on("dragstart", ".file", (e) => {
      e.dataTransfer = e.originalEvent.dataTransfer;
      this._onDragStart(e);
    });
    this.activateListeners($(html));
    this.setPosition({ height: "auto" });
    $(html).find(`input[name="filter"]`).focus();
  }
}
