class FilePickerDeepSearch {
  constructor(force = false) {
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
    this._excludeKeywords = game.settings.get("fuzzy-foundry", "deepFileExclude").split(",").map((e) => e.replace(/\s/g, "%20")).map((e) => e.trim()).filter((e) => e);
    this.s3 = game.settings.get("fuzzy-foundry", "useS3");
    this.s3name = game.settings.get("fuzzy-foundry", "useS3name");
    this.fpPlus = game.modules.get("filepicker-plus")?.active;
    this.s3URLPrefix = undefined;
    this.buildAllCache(force).then(() => {
      this.fs = FuzzySearchFilters.FuzzySet(Object.keys(this._fileIndexCache), true);
    });
  }

  en(string) {
    return LZString.compressToBase64(string);
  }

  de(string) {
    return LZString.decompressFromBase64(string);
  }

  async getS3URLPrefix() {
    if (this.s3URLPrefix === undefined) {
      // Set s3URLPrefix lazily, the first time it is needed. 
      this.s3URLPrefix = await this.discoverS3URLPrefix();
    }
    return this.s3URLPrefix;
  }

  async discoverS3URLPrefix(dir = "") {
    // Scan the s3 bucket to find the first file, then extract the URL prefix from the filename
    const content = await FilePicker.browse("s3", dir, { bucket: this.s3name });
    if (content.files.length !== 0) {
      const url = content.files[0];
      const offset = ((dir === "") ? url.lastIndexOf(`/`) : url.indexOf(`/${dir}/`));
      return url.slice(0, offset);
    } else {
      for (const dir of content.dirs) {
        const result = await this.discoverS3URLPrefix(dir);
        if (result) return result;
      }
    }
    return null;
  }

  async buildAllCache(force = false) {
    const localCache = game.settings.get("fuzzy-foundry", "localFileCache");
    let storedCache, storedCacheResponse;
    if (!localCache) storedCacheResponse = await fetch("modules/fuzzy-foundry/storage/DigDownCache.json");
    if ((localCache || storedCacheResponse.ok) && !force) {
      storedCache = localCache || (await storedCacheResponse.text());
      if (!localCache) { 
            try {
                await game.settings.set("fuzzy-foundry", "localFileCache", storedCache);
            } catch {
                game.settings.set("fuzzy-foundry", "localFileCache", "");
                console.warn("Dig Down | Failed to save local cache. This is normal when indexing a very high amount of files, you might experience slower initialization.");
            }
      }
      this.unpackCache(storedCache);
      console.log(Object.values(this._fileIndexCache).flat().length + " files loaded from cache");
      return;
    }
    if (game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("fuzz.warn.cache"), {
        permanent: true,
      });
      await this.buildCache("./", "user");
      await this.buildCache("./", "public");
      if (this.s3) await this.buildCache("", "s3");
      await this.buildForge();
      this.saveCache();
    }
  }

  unpackCache(json) {
    try{
      let cache = JSON.parse(this.de(json));
      let pathList = cache._fileCache.filter((f) => !!f);
      let fileIndexCache = {};
      for (let path of pathList) {
        const fileName = path.split("/").pop();
        fileIndexCache[fileName] ??= [];
        fileIndexCache[fileName].push(path);
      }
      this._fileIndexCache = fileIndexCache;
    } catch (e) {
      ui.notifications.error("Dig Down | New Caching System requires rebuild. Rebuilding Cache...");
      this.buildAllCache(true);
    }

  }

  async buildCache(dir, type = "user") {
    const isS3 = this.s3;
    let content = isS3
      ? await FilePicker.browse(type, dir, { bucket: this.s3name })
      : await FilePicker.browse(type, dir);

    if (content.files.some(path => path.split("/").pop() == "noscan.txt")) {
      console.log(`Dig Down | Skipping directory ${dir} due to noscan.txt file`);
      return;
    }

    let promises = [];
    SceneNavigation.displayProgressBar({label: "Indexing " + dir, pct: 99});
    for (let directory of content.dirs) {
      promises.push(this.buildCache(isS3 ? directory : directory + "/", type));
    }
    for (let path of content.files) {
      const ext = "." + path.split(".").pop();
      if (!this.validExtensions.includes(ext) || (this._excludeKeywords?.length && this._excludeKeywords.some(k => path.includes(k)))) continue;
      const fileName = path.split("/").pop();
      this._fileIndexCache[fileName] ??= [];
      this._fileIndexCache[fileName].push(path);
    }

    if (promises.length > 0)
      return Promise.all(promises);
    else
      return
  }

  async buildForge() {
    if (typeof ForgeVTT !== "undefined" && ForgeVTT.usingTheForge) {
      const contents = await ForgeAPI.call("/assets");

      for (let asset of contents.assets) {
        const fileName = asset.name.split("/").pop();
        this._fileIndexCache[fileName] ??= [];
        this._fileIndexCache[fileName].push(asset.url);
      }
    } else {
      return;
    }
  }

  async loadCache() {
    await FilePicker.browse("user", "modules/fuzzy-foundry");
  }

  async saveCache() {
    const data = {
      _fileCache: Object.values(this._fileIndexCache).flat(),
    };
    const string = this.en(JSON.stringify(data));
    try {
      await game.settings.set("fuzzy-foundry", "localFileCache", string);
    } catch { 
      game.settings.set("fuzzy-foundry", "localFileCache", "");
      console.warn("Dig Down | Failed to save local cache. This is normal when indexing a very high amount of files, you might experience slower initialization.");
    }

    let blob = new Blob([string], {
      type: "text/plain",
    });
    let file = new File([blob], "DigDownCache.json", { type: "text" });
    await FilePicker.uploadPersistent("fuzzy-foundry", "", file, {});

    //await game.settings.set("fuzzy-foundry", "fileCache", data);
    ui.notifications.info(game.i18n.localize("fuzz.warn.done"), {
      permanent: true,
    });
    console.log(`Saved ${data._fileCache.length} files to cache`);
  }

  static buildHtml(dmode, data) {

    const filename = data.fn.replaceAll("%20", " ");
    let src = data.fp;
    const ext = src.split(".").pop();
    let is3D = false;
    if((ext == "glb" || ext == "gltf") && canvas.deepSearchCache.fpPlus){
      is3D = true;
      src = src.replace(ext, "webp");
    }
    let html = "";
    switch (dmode) {
      case "tiles":
        html = `<img width="100" height="100" draggable="true" title="${filename}" src="${src}">`;
        break;
      case "thumbs":
        html =  `<img width="48" height="48" src="${src}">
        <span class="filename">${filename}</span>`;
        break;
      case "list":
        html =  `<i class="fas fa-file fa-fw"></i>${filename}`;
        break;
      case "images":
        html =  `<img title="${filename}" draggable="true" src="${src}">
        <span class="filename">${filename}</span>`;
        break;
    }
    if(is3D){
      html += `<i style="pointer-events: none; position: absolute; left: 0.2rem" class="fas fa-cube fa-fw"></i>`;
    }
    return html;
  }

  static async _onSearchFilter(wrapped, event, query, rgx, html) {
    const enableDeepSearch = game.settings.get("fuzzy-foundry", "deepFile");
    if (!enableDeepSearch) return wrapped(event, query, rgx, html);
    const enablePlayers = game.settings.get("fuzzy-foundry", "deepFilePlayers");
    if (!enablePlayers && !game.user.isGM) return wrapped(event, query, rgx, html);
    const qLength = game.settings.get("fuzzy-foundry", "deepFileCharLimit");
    if ((!query || query.length < qLength) && !this.reset) {
      this.reset = true;
      this.render(true);
      $(html).find(`input[name="filter"]`).focus();
      return wrapped(event, query, rgx, html);
    }
    if (!query || query.length < qLength) {
      return wrapped(event, query, rgx, html);
    } else {
      this.reset = false;
    }
    //await FilePickerDeepSearch.wait(300);
    const cache = canvas.deepSearchCache;
    if ($(this.element).find(`input[name="filter"]`).val() !== query) return;
    let folder = $(this.element)
      .find(`input[name="target"]`)[0]
      .value.replaceAll(" ", "%20");
    if (folder !== "") {
      const activeBucket = $(this.element).find(".filepicker-header > .form-group.bucket > select")[0]?.value;
      if (activeBucket) {
        const s3URLPrefix = await cache.getS3URLPrefix();
        folder = `${s3URLPrefix}/${folder}`;
      }
    }
    const dmode = $(this.element).find(".display-mode.active")[0].dataset.mode;
    const queryLC = query.toLowerCase();
    let qresult = [];
    if (!cache._searchCache[query]) {
      qresult = Object.keys(cache._fileIndexCache).filter(fn => fn.toLowerCase().indexOf(queryLC) !== -1);
      qresult.sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      const fs = cache.fs;
      const queryRes = fs.get(query);
      const fuzzyResults = queryRes
        ? queryRes
            .filter((e) => {
              return e[0] > 0.3;
            })
            .map((r) => r[1]) || []
        : [];

      fuzzyResults.sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      for (let fn of fuzzyResults) {
        if (qresult.includes(fn)) continue;
        qresult.push(fn);
      }

      if (qresult.length == 0) {
        return wrapped(event, query, rgx, html);
      }
    } else {
      qresult = cache._searchCache[query];
    }

    const ol = this.element[0].querySelector("ol.directory.files-list");
    const customOl = document.createElement("ol");
    customOl.classList.add("directory", "files-list", `${dmode}-list`);
    const directoryOl = this.element[0].querySelector("ol.folders-list");
    cache._searchCache[query] = qresult;
    let olHtml = "";
    for (let file of qresult) {
      const ext = "." + file.split(".").pop();
      const pathList = cache._fileIndexCache[file];
      if (!pathList) continue;
      for (const path of pathList) {
        if (!path.startsWith(folder)) continue;
        if (this.extensions && !this.extensions.includes(ext)) continue;
        olHtml += `<li style="position: relative;" class="file${
          dmode == "thumbs" ? " flexrow" : ""
        }" data-path="${path}" data-name="${path}" data-tooltip="${path}" draggable="true">`;
        olHtml += FilePickerDeepSearch.buildHtml(dmode, {
          fn: file,
          fp: path,
        });
        olHtml += `</li>`;  
      }
    }

    (ol ?? customOl).innerHTML = olHtml;
    directoryOl.after((ol ?? customOl));


    this.element.on("dragstart", ".file", (e) => {
      e.dataTransfer = e.originalEvent.dataTransfer;
      this._onDragStart(e);
    });
    if(!ol)this.element.on("click", ".file", (e) => {
      const path = e.currentTarget.dataset.path;
      const selected = this.element[0].querySelector(`input[name="file"]`)
      if(selected) selected.value = path;
    });
    this.setPosition({ height: "auto" });
    this.element.find(`input[name="filter"]`).focus();
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
      ".webm",
      ".WEBM",
    ];
    const cache = canvas.deepSearchCache;
    const fs = cache.fs;
    const queryRes = fs.get(query, []).filter((q) => {
      const ext = "." + q[1].split(".").pop();
      if (!validExt.includes(ext)) return false;
      if (exclude.length == 0) return true;
      for (let ex of exclude) {
        if (cache._fileIndexCache[q[1]][0].includes(ex)) return true;
      }
      return false;
    });
    if (!queryRes || queryRes.length === 0) return undefined;
    if (!isWildcard || queryRes.length == 1) return cache._fileIndexCache[queryRes[0][1]][0];
    if (queryRes.length < 2) return undefined;
    const path1 = cache._fileIndexCache[queryRes[0][1]][0];
    const fileName1 = queryRes[0][1];
    const fileName2 = queryRes[1][1];
    const wildcard = tokenExcavator.makeWildcard(fileName1, fileName2);
    return path1.replace(fileName1, wildcard);
  }
}