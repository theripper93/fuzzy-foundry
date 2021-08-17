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
  game.settings.register("fuzzy-foundry", "deepFile", {
    name: game.i18n.localize("fuzz.settings.deepFile.name"),
    hint: game.i18n.localize("fuzz.settings.deepFile.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: (sett)=>{
      if(sett) canvas.deepSearchCache = new FilePickerDeepSearch();
    }
  });
  if(game.settings.get("fuzzy-foundry", "deepFile"))canvas.deepSearchCache = new FilePickerDeepSearch();
});

Hooks.on("getFilePickerHeaderButtons", () => {
  
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
