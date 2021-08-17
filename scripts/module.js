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

  static buildHtml(dmode,data){
    switch(dmode){
      case "tiles":
        return `<img width="100" height="100" title="${data.fn}" src="${data.fp}">`
      case "thumbs":
        return `        <img width="48" height="48" src="${data.fp}">
        <span class="filename">${data.fn}</span>`
      case "list":
        return `<i class="fas fa-file fa-fw"></i>${data.fn}`
      case "images":
        return `<img title="${data.fn}" src="${data.fp}">
        <span class="filename">${data.fn}</span>`
    }
  }

  static _onSearchFilter(wrapped,event, query, rgx, html) {
    console.log(this)
    if(!game.settings.get("fuzzy-foundry", "deepFile") || !game.user.isGM){
      return wrapped(event, query, rgx, html);
    }
    if ((!query || query.length < 4) && !this.reset) {
      this.reset = true;
      this.render(true)
      $(html).find(`input[name="filter"]`).focus()
      return wrapped(event, query, rgx, html);
    }
    if (!query || query.length < 4) {
      return wrapped(event, query, rgx, html);
    } else {
      this.reset = false;
    }
    const folder = $(html).find(`input[name="target"]`)[0].value;
    const dmode = $(html).find(".display-mode.active")[0].dataset.mode
    const cache = canvas.deepSearchCache;
    const fs = FuzzySearchFilters.FuzzySet(cache._fileNameCache, true);
    const queryRes= fs.get(query)
    let qresult = queryRes ? queryRes.filter((e) => {
      return e[0]>0.3}).map((r) => r[1]) || [] : [];
    if(qresult.length == 0) {
      return wrapped(event, query, rgx, html)
    }
    $("section.filepicker-body").html("");
    let $ol = $(`<ol class="directory files-list ${dmode}-list">`);

    for (let file of qresult) {
      const ext = "." + file.split(".").pop();
      if((!cache._fileIndexCache[file]?.startsWith(folder))) continue
      if(this.extensions && !this.extensions.includes(ext)) continue
      let olHtml = `<li class="file${dmode == "thumbs" ? " flexrow" : ""}" data-path="${cache._fileIndexCache[file]}" draggable="true">`
      olHtml+= FilePickerDeepSearch.buildHtml(dmode,{fn:file,fp:cache._fileIndexCache[file]})
      olHtml += `</li>`
      $ol.append(olHtml);
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