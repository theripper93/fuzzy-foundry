class FilePickerDeepSearch {
  constructor() {
    this._fileCache = [];
    this._fileNameCache = [];
    this._fileIndexCache = {};
    this.s3 = game.settings.get("fuzzy-foundry", "useS3");
    this.s3name = game.settings.get("fuzzy-foundry", "useS3name");
    if (game.user.isGM) this.buildCache(this.s3 ? "" : "./");
  }

  async buildCache(dir) {
    const isS3 = this.s3;
    let content = isS3
      ? await FilePicker.browse("s3", dir, { bucket: this.s3name })
      : await FilePicker.browse("user", dir);
    for (let directory of content.dirs) {
      this.buildCache(
        isS3 ? directory : directory + "/"
      );
    }
    for (let file of content.files) {
      const fileName = file.split("/").pop();
      this._fileCache.push(file);
      this._fileNameCache.push(fileName);
      this._fileIndexCache[fileName] = file;
    }
  }

  static buildHtml(dmode, data) {
    switch (dmode) {
      case "tiles":
        return `<img width="100" height="100" draggable="true" title="${data.fn}" src="${data.fp}">`;
      case "thumbs":
        return `<img width="48" height="48" src="${data.fp}">
        <span class="filename">${data.fn}</span>`;
      case "list":
        return `<i class="fas fa-file fa-fw"></i>${data.fn}`;
      case "images":
        return `<img title="${data.fn}" draggable="true" src="${data.fp}">
        <span class="filename">${data.fn}</span>`;
    }
  }

  static async _onSearchFilter(wrapped, event, query, rgx, html) {
    if (!game.settings.get("fuzzy-foundry", "deepFile") || !game.user.isGM) {
      return wrapped(event, query, rgx, html);
    }
    if ((!query || query.length < 4) && !this.reset) {
      this.reset = true;
      this.render(true);
      $(html).find(`input[name="filter"]`).focus();
      return wrapped(event, query, rgx, html);
    }
    if (!query || query.length < 4) {
      return wrapped(event, query, rgx, html);
    } else {
      this.reset = false;
    }
    await FilePickerDeepSearch.wait(800);
    if ($(html).find(`input[name="filter"]`).val() !== query) return;
    const folder = $(html).find(`input[name="target"]`)[0].value;
    const dmode = $(html).find(".display-mode.active")[0].dataset.mode;
    const cache = canvas.deepSearchCache;
    const fs = FuzzySearchFilters.FuzzySet(cache._fileNameCache, true);
    const queryRes = fs.get(query);
    let qresult = queryRes
      ? queryRes
          .filter((e) => {
            return e[0] > 0.3;
          })
          .map((r) => r[1]) || []
      : [];
    if (qresult.length == 0) {
      return wrapped(event, query, rgx, html);
    }
    $("section.filepicker-body").html("");
    let $ol = $(`<ol class="directory files-list ${dmode}-list">`);

    for (let file of qresult) {
      const ext = "." + file.split(".").pop();
      if (!cache._fileIndexCache[file]?.startsWith(folder)) continue;
      if (this.extensions && !this.extensions.includes(ext)) continue;
      let olHtml = `<li class="file${
        dmode == "thumbs" ? " flexrow" : ""
      }" data-path="${cache._fileIndexCache[file]}" draggable="true">`;
      olHtml += FilePickerDeepSearch.buildHtml(dmode, {
        fn: file,
        fp: cache._fileIndexCache[file],
      });
      olHtml += `</li>`;
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

  static wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

class tokenExcavator {
  static findCommon(s1, s2) {
    //find the largest common substring between two strings
    let maxl = 0;
    let common = "";
    for (let i = 0; i < s1.length; i++) {
      for (let j = 0; j < s2.length; j++) {
        let l = 0;
        while (
          i + l < s1.length &&
          j + l < s2.length &&
          s1[i + l] == s2[j + l]
        ) {
          l++;
        }
        if (l > maxl) {
          maxl = l;
          common = s1.substr(i, l);
        }
      }
    }
    return common;
  }

  static makeWildcard(s1, s2) {
    //make a wildcard string that will match s1 and s2
    let common = tokenExcavator.findCommon(s1, s2);
    let wildcard = s1;
    let parts = s1.split(common);
    for (let part of parts) {
      if (part !== "") wildcard = wildcard.replace(part, `*`);
    }
    return wildcard;
  }

  static excavate(query, isWildcard = false, exclude = []) {
    exclude = exclude.map((e) => e.replace(/\s/g, "%20"));
    const validExt = [".jpg", ".JPG", ".jpeg", ".JPEG", ".png", ".PNG", ".svg", ".SVG", ".webp", ".WEBP", ".mp4", ".MP4", ".ogg", ".OGG", ".webm", ".WEBM", ".m4v", ".M4V",];
    const cache = canvas.deepSearchCache;
    const fs = FuzzySearchFilters.FuzzySet(cache._fileNameCache, true);
    const queryRes = fs.get(query, []).filter((q) => {
      const ext = "." + q[1].split(".").pop();
      if (!validExt.includes(ext)) return false;
      if (exclude.length == 0) return true;
      for (let ex of exclude) {
        if (cache._fileIndexCache[q[1]].includes(ex)) return true;
      }
      return false;
    });
    if (!queryRes || queryRes.length === 0) return undefined;
    if (!isWildcard) return cache._fileIndexCache[queryRes[0][1]];
    if (queryRes.length < 2) return undefined;
    const path1 = cache._fileIndexCache[queryRes[0][1]];
    const fileName1 = queryRes[0][1];
    const fileName2 = queryRes[1][1];
    const wildcard = tokenExcavator.makeWildcard(fileName1, fileName2);
    return path1.replace(fileName1, wildcard);
  }
}

