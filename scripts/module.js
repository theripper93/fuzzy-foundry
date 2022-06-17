class FilePickerDeepSearch {
  constructor(as = false) {
    this._fileCache = [];
    this._fileNameCache = [];
    this._fileIndexCache = {};
    this._searchCache = {};
    this.validExtensions = [
      ".jpg",
      ".JPG",
      ".jpeg",
      ".JPEG",
      ".png",
      ".PNG",
      ".svg",
      ".SVG",
      ".webp",
      ".WEBP",
      ".mp4",
      ".MP4",
      ".ogg",
      ".OGG",
      ".webm",
      ".WEBM",
      ".m4v",
      ".M4V",
      ".mp3",
      ".MP3",
      ".wav",
      ".WAV",
      ".flac",
      ".FLAC",
      ".aac",
      ".AAC",
      ".m4a",
      ".M4A",
      ".ogg",
      ".OGG",
      ".glb",
      ".GLB",
      ".gltf",
      ".GLTF",
      ".fbx",
      ".FBX",
    ];
    this.s3 = game.settings.get("fuzzy-foundry", "useS3");
    this.s3name = game.settings.get("fuzzy-foundry", "useS3name");
    if(!as) this.buildAllCache();
  }

  async buildAllCache(force = false){
    
    // This is the smalll patch, that enables support for subdomains.
    // Fixes this issue https://github.com/theripper93/fuzzy-foundry/issues/6



    // Get the URL of the current game
    let gamepath = window.location.pathname.split("/")
    let notgoodURL = "game";
    let prefixURL = "";
    //test, if the prefixURL isn't /game
    // ExampleURL:
    // dnd.someserver.com/game

    // There probably is a better way to test the string "game" if it equals the first array Item, but this works.
    if (gamepath[1].normalize() === notgoodURL.normalize()) {
 
      // Since the URL only contains the "Game" part and nothing has been defined as a prefix,
      // we can just nullify the prefixURL
      prefixURL = "";
    } else {

      // Since the URL contains the "Game" part and something was defined as a prefix,
      // we can relay the prefixURL

      // NOTE: if someone were to set the Prefix to game this would probably cause issues.
      //       I highly doubt that THAT could cause any harm, since noone would configure their
      //       instance as "dnd.someurl.com/game/game" ...
      prefixURL = "/"+gamepath[1];
    }

    let storedCacheResponse = await (await fetch(prefixURL + "/DigDownCache.json"));
    if(storedCacheResponse.ok && !force){
      let storedCache = JSON.parse(await storedCacheResponse.text());
      this._fileCache = storedCache._fileCache;
      this._fileNameCache = storedCache._fileNameCache;
      this._fileIndexCache = storedCache._fileIndexCache;
      console.log(this._fileCache.length + " files loaded from cache")
      return;
    }
    if (game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("fuzz.warn.cache"), {permanent: true});
      await this.buildCache("./")
      if (this.s3) await this.buildCache("");
      await this.buildForge();
      this.saveCache();
    }
  }

  async buildCache(dir) {
      const isS3 = this.s3;
      let content = isS3
        ? await FilePicker.browse("s3", dir, { bucket: this.s3name })
        : await FilePicker.browse("user", dir);
      for (let directory of content.dirs) {
        await this.buildCache(
          isS3 ? directory : directory + "/"
        );
      }
      for (let file of content.files) {
        const ff = file
        const ext = "." + ff.split(".").pop();
        if(!this.validExtensions.includes(ext)) continue;
        const fileName = file.split("/").pop();
        this._fileCache.push(file);
        this._fileNameCache.push(fileName);
        this._fileIndexCache[fileName] = file;
      }
  }

  async buildForge() {
    if (typeof ForgeVTT !== "undefined" && ForgeVTT.usingTheForge) {
      const contents = await ForgeAPI.call("/assets");

      for (let file of contents.assets) {
        const fileName = file.name.split("/").pop()
        this._fileCache.push(file.url);
        this._fileNameCache.push(fileName);
        this._fileIndexCache[fileName] = file.url;
      }
    } else {
      return;
    }
  }

  async loadCache(){
    await FilePicker.browse("user", "modules/fuzzy-foundry");
  }

  async saveCache(){
    const data = {
      _fileCache : this._fileCache,
      _fileNameCache : this._fileNameCache,
      _fileIndexCache : this._fileIndexCache
    }

    let blob = new Blob([JSON.stringify(data)], {
      type: 'text/plain'
  })
    let file = new File([blob], "DigDownCache.json", { type: "text" });
    await FilePicker.upload("data", "", file, {});

    //await game.settings.set("fuzzy-foundry", "fileCache", data);
    ui.notifications.info(game.i18n.localize("fuzz.warn.done"))
    console.log(`Saved ${this._fileCache.length} files to cache`);
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
    const folder = $(html).find(`input[name="target"]`)[0].value.replaceAll(" ", "%20");
    const dmode = $(html).find(".display-mode.active")[0].dataset.mode;
    const cache = canvas.deepSearchCache;
    let qresult = [];
    if(!cache._searchCache[query]){
      const fs = FuzzySearchFilters.FuzzySet(cache._fileNameCache, true);
      const queryRes = fs.get(query);
      qresult = queryRes
        ? queryRes
            .filter((e) => {
              return e[0] > 0.3;
            })
            .map((r) => r[1]) || []
        : [];
  
      for (let fn of cache._fileNameCache) {
        if (qresult.includes(fn)) continue;
        if (fn.toLowerCase().includes(query.toLowerCase())) {
          qresult.push(fn);
        }
      }
      if (qresult.length == 0) {
        return wrapped(event, query, rgx, html);
      }
    }else{
      qresult = cache._searchCache[query];
    }
    
    $("section.filepicker-body").html("");
    let $ol = $(`<ol class="directory files-list ${dmode}-list">`);
    cache._searchCache[query] = qresult;
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
    const validExt = [
      ".jpg",
      ".JPG",
      ".jpeg",
      ".JPEG",
      ".png",
      ".PNG",
      ".svg",
      ".SVG",
      ".webp",
      ".WEBP",
      ".mp4",
      ".MP4",
      ".ogg",
      ".OGG",
      ".webm",
      ".WEBM",
      ".m4v",
      ".M4V",
    ];
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
    if (!isWildcard || queryRes.length == 1) return cache._fileIndexCache[queryRes[0][1]];
    if (queryRes.length < 2) return undefined;
    const path1 = cache._fileIndexCache[queryRes[0][1]];
    const fileName1 = queryRes[0][1];
    const fileName2 = queryRes[1][1];
    const wildcard = tokenExcavator.makeWildcard(fileName1, fileName2);
    return path1.replace(fileName1, wildcard);
  }
}
