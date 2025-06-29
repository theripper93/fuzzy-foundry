Hooks.once("init", function () {
    libWrapper.register("fuzzy-foundry", "foundry.applications.sidebar.DocumentDirectory.prototype._matchSearchEntries", FuzzySearchFilters._matchSearchEntries, "OVERRIDE");

    libWrapper.register("fuzzy-foundry", "foundry.applications.apps.FilePicker.implementation.prototype._onSearchFilter", FilePickerDeepSearch._onSearchFilter, "MIXED");
});

Hooks.once("init", function () {
    function initializeDeepSearchCache() {
        if (game.settings.get("fuzzy-foundry", "deepFile") && (game.user.isGM || game.settings.get("fuzzy-foundry", "deepFilePlayers")))
            canvas.deepSearchCache = new FilePickerDeepSearch();
        else
            canvas.deepSearchCache = null;
    }
    
    game.settings.register("fuzzy-foundry", "deepFile", {
        name: game.i18n.localize("fuzz.settings.deepFile.name"),
        hint: game.i18n.localize("fuzz.settings.deepFile.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: initializeDeepSearchCache
    });

    game.settings.register("fuzzy-foundry", "deepFileExclude", {
        name: game.i18n.localize("fuzz.settings.deepFileExclude.name"),
        hint: game.i18n.localize("fuzz.settings.deepFileExclude.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "",
        onChange: initializeDeepSearchCache
    });

    game.settings.register("fuzzy-foundry", "deepFilePlayers", {
        name: game.i18n.localize("fuzz.settings.deepFilePlayers.name"),
        hint: game.i18n.localize("fuzz.settings.deepFilePlayers.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
    });

    game.settings.register("fuzzy-foundry", "deepFileCharLimit", {
        name: game.i18n.localize("fuzz.settings.deepFileCharLimit.name"),
        hint: game.i18n.localize("fuzz.settings.deepFileCharLimit.hint"),
        scope: "world",
        config: true,
        type: Number,
        range: {
            min: 1,
            max: 10,
            step: 1,
        },
        default: 4,
    });

    game.settings.register("fuzzy-foundry", "chatSearch", {
        name: game.i18n.localize("fuzz.settings.chatSearch.name"),
        hint: game.i18n.localize("fuzz.settings.chatSearch.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            ui.chat.render(true);
        },
    });
  
      game.settings.register("fuzzy-foundry", "props", {
          name: game.i18n.localize("fuzz.settings.props.name"),
          hint: game.i18n.localize("fuzz.settings.props.hint"),
          scope: "world",
          config: true,
          type: String,
          default: "details.cr",
      });

      game.settings.register("fuzzy-foundry", "excavateFilters", {
          name: game.i18n.localize("fuzz.settings.excavateFilters.name"),
          hint: game.i18n.localize("fuzz.settings.excavateFilters.hint"),
          scope: "world",
          config: true,
          type: String,
          default: "",
      });

      game.settings.register("fuzzy-foundry", "excavateWildcard", {
          name: game.i18n.localize("fuzz.settings.excavateWildcard.name"),
          hint: game.i18n.localize("fuzz.settings.excavateWildcard.hint"),
          scope: "world",
          config: true,
          type: Boolean,
          default: false,
      });

    game.settings.register("fuzzy-foundry", "useS3", {
        name: game.i18n.localize("fuzz.settings.useS3.name"),
        hint: game.i18n.localize("fuzz.settings.useS3.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: initializeDeepSearchCache
    });

    game.settings.register("fuzzy-foundry", "useS3name", {
        name: game.i18n.localize("fuzz.settings.useS3name.name"),
        hint: game.i18n.localize("fuzz.settings.useS3name.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "",
        onChange: initializeDeepSearchCache
    });

    game.settings.register("fuzzy-foundry", "localFileCache", {
        name: "",
        hint: "",
        scope: "client",
        config: false,
        type: String,
        default: "",
    });

    Hooks.once("ready", initializeDeepSearchCache);
});

Object.byString = function (o, s) {
    s = s.replace(/\[(\w+)\]/g, ".$1"); // convert indexes to properties
    s = s.replace(/^\./, ""); // strip a leading dot
    var a = s.split(".");
    for (var i = 0, n = a.length; i < n; ++i) {
        var k = a[i];
        if (k in o) {
            o = o[k];
        } else {
            return;
        }
    }
    return o;
};

Hooks.on("renderFilePicker", (app, html) => {
    html.querySelector('input[type="search"]').focus();
});

Hooks.on("renderSettings", (settings) => {
    if (!game.user.isGM) return;

    const html = settings.element;
    if (html.querySelector("#digDownCache")) return;

    const button = document.createElement("button");
    button.id = "digDownCache";
    button.innerHTML = `<i class="fas fa-server"></i> ${game.i18n.localize("fuzz.settings.rebuildchash.name")}`;

    const modulesButton = html.querySelector(`button[data-app="modules"]`);
    if (modulesButton) {
        modulesButton.insertAdjacentElement("afterend", button);

        button.addEventListener("click", async (e) => {
            e.preventDefault();
            button.disabled = true;
            const icon = button.querySelector("i");
            icon.classList.remove("fa-server");
            icon.classList.add("fa-spinner", "fa-spin");

            await FilePickerDeepSearch.wait(100);
            canvas.deepSearchCache = new FilePickerDeepSearch(true);

            button.disabled = false;
            icon.classList.remove("fa-spinner", "fa-spin");
            icon.classList.add("fa-server");
        });
    }
});


foundry.canvas.placeables.Token.prototype.excavate = async function (wildCheck = false, exclude) {
    exclude =
        exclude ??
        game.settings
            .get("fuzzy-foundry", "excavateFilters")
            .split(",")
            .filter((s) => s !== "");
    const isWildcard = wildCheck && game.settings.get("fuzzy-foundry", "excavateWildcard");
    const newPath = tokenExcavator.excavate(this.actor?.name ?? this.document.name, isWildcard, exclude);
    if (newPath) await this.document.update({ img: newPath });
    console.log(newPath ? `Excavation Successfull! ${newPath}` : "Excavation Failed!");
    return newPath;
};

Actor.prototype.excavate = async function (wildCheck = true, exclude) {
    exclude =
        exclude ??
        game.settings
            .get("fuzzy-foundry", "excavateFilters")
            .split(",")
            .filter((s) => s !== "");
    const isWildcard = wildCheck && game.settings.get("fuzzy-foundry", "excavateWildcard");
    const newPath = tokenExcavator.excavate(this.document.name, isWildcard, exclude);
    const portrait = this.document.img == "icons/svg/mystery-man.svg" ? tokenExcavator.excavate(this.document.name, false, exclude) : this.document.img;
    if (newPath) await this.update({ img: portrait, "token.img": newPath, "token.randomImg": isWildcard });
    console.log(newPath ? `Excavation Successfull! ${newPath}` : "Excavation Failed!");
    return newPath;
};

foundry.documents.collections.Actors.prototype.excavateAll = async function (wildCheck = true, exclude, folderName) {
    if (folderName && !game.folders.getName(folderName)) {
        return ui.notifications.error("Folder Not Found");
    }
    const folderId = folderName ? game.folders.getName(folderName).id : null;
    let processed = 0;
    const actors = folderId ? Array.from(this).filter((a) => a?.folder.id === folderId) : Array.from(this);
    const tot = actors.length;
    for (let actor of actors) {
        if (folderId && actor?.folder.id !== folderId) continue;
        let filename = await actor.excavate(wildCheck, exclude);
        processed++;
        console.log(`Processed Actor ${processed} of ${tot}: ${actor.document.name} - ${filename ? filename : "Failed"}`);
    }
};

Hooks.on("renderJournalSheet", (app, html) => {
    if (app.document.deepSearchResult?.anchor) {
        setTimeout(() => {
            app.document.sheet.render(true, { pageId: app.document.deepSearchResult.pageId, anchor: app.document.deepSearchResult.anchor });
            delete app.document.deepSearchResult;
        }, 100);
    }
});
