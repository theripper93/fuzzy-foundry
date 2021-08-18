Hooks.once("init", function () {
  libWrapper.register(
    "fuzzy-foundry",
    "SidebarDirectory.prototype._onSearchFilter",
    FuzzySearchFilters.SidebarDirectorySearch,
    "OVERRIDE"
  );

  libWrapper.register(
    "fuzzy-foundry",
    "Compendium.prototype._onSearchFilter",
    FuzzySearchFilters.CompendiumSearch,
    "OVERRIDE"
  );

  libWrapper.register(
    "fuzzy-foundry",
    "FilePicker.prototype._onSearchFilter",
    FilePickerDeepSearch._onSearchFilter,
    "MIXED"
  );
});

Hooks.once("ready", async function () {
  game.settings.register("fuzzy-foundry", "props", {
    name: game.i18n.localize("fuzz.settings.props.name"),
    hint: game.i18n.localize("fuzz.settings.props.hint"),
    scope: "world",
    config: true,
    type: String,
    default: "data.details.cr",
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

  game.settings.register("fuzzy-foundry", "deepFile", {
    name: game.i18n.localize("fuzz.settings.deepFile.name"),
    hint: game.i18n.localize("fuzz.settings.deepFile.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (sett) => {
      if (sett) canvas.deepSearchCache = new FilePickerDeepSearch();
    },
  });

  game.settings.register("fuzzy-foundry", "useS3", {
    name: game.i18n.localize("fuzz.settings.useS3.name"),
    hint: game.i18n.localize("fuzz.settings.useS3.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (sett) => {
      if (sett) canvas.deepSearchCache = new FilePickerDeepSearch();
    },
  });

  game.settings.register("fuzzy-foundry", "useS3name", {
    name: game.i18n.localize("fuzz.settings.useS3name.name"),
    hint: game.i18n.localize("fuzz.settings.useS3name.hint"),
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: (sett) => {
      if (sett) canvas.deepSearchCache = new FilePickerDeepSearch();
    },
  });

  game.settings.register("fuzzy-foundry", "fileCache", {
    name: "",
    hint: "",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });


  if (game.settings.get("fuzzy-foundry", "deepFile"))
    canvas.deepSearchCache = new FilePickerDeepSearch();
});

Hooks.on("renderTokenConfig", (app, html) => {
  if (!game.settings.get("fuzzy-foundry", "deepFile"))
    return;
  let button = `<button type="button" id="excavator" class="file-picker" data-type="imagevideo" data-target="img" title="${game.i18n.localize(
    "fuzz.tconfing.excavat.tip"
  )}" tabindex="-1">
  <i id="exicon" class="fab fa-digg"></i>
</button>`;
  html.find(".file-picker").after(button);
  const name = app.object?.actor?.data?.name || app.object?.data?.name;
  const exclude = game.settings.get("fuzzy-foundry", "excavateFilters").split(",").filter((s) => s !== "");
  html.on("click", "#excavator", (e) => {
    e.preventDefault();
    const wildCheck = html.find(`input[name="randomImg"]`)[0] ? html.find(`input[name="randomImg"]`)[0].checked : false;
    const isWildcard = wildCheck && game.settings.get("fuzzy-foundry", "excavateWildcard");
    const btn = $(e.currentTarget);
    btn.find("#exicon")[0].className = "fas fa-spinner fa-spin";
    btn.prop("disabled", true);
    setTimeout(() => {
      const newPath = tokenExcavator.excavate(name, isWildcard, exclude);
      if (newPath) html.find(".image")[0].value = newPath;
      btn.prop("disabled", false);
      btn.find("#exicon")[0].className = newPath
        ? "fab fa-digg"
        : "fas fa-times";
    }, 150);
  });
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

Hooks.on("changeSidebarTab",(settings) => {
  if(!game.user.isGM) return
  const html = settings.element
  if(html.find("#digDownCache").length !== 0) return
  const button = `<button id="digDownCache">
  <i class="fas fa-server"></i> ${game.i18n.localize("fuzz.settings.rebuildchash.name")}
</button>`
  html.find(`button[data-action="modules"]`).after(button)
  html.find("#digDownCache").on("click",async (e) => {
    e.preventDefault();
    $(e.currentTarget).prop("disabled", true).find("i").removeClass("fas fa-server").addClass("fas fa-spinner fa-spin")
    await FilePickerDeepSearch.wait(100);
    canvas.deepSearchCache = await new FilePickerDeepSearch(true).buildAllCache(true);
    $(e.currentTarget).prop("disabled", false).find("i").removeClass("fas fa-spinner fa-spin").addClass("fas fa-server")
  })
});

