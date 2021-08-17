# Dig Down
Perform deep searches on sidebars and fuzzy searches on compendiums/sidebars

![Latest Release Download Count](https://img.shields.io/github/downloads/theripper93/fuzzy-foundry/latest/module.zip?color=2b82fc&label=DOWNLOADS&style=for-the-badge) [![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Ffuzzy-foundry&colorB=03ff1c&style=for-the-badge)](https://forge-vtt.com/bazaar#package=fuzzy-foundry) ![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Ftheripper93%2Ffuzzy-foundry%2Fmain%2Fmodule.json&label=Foundry%20Version&query=$.compatibleCoreVersion&colorB=orange&style=for-the-badge) [![alt-text](https://img.shields.io/badge/-Patreon-%23ff424d?style=for-the-badge)](https://www.patreon.com/theripper93) [![alt-text](https://img.shields.io/badge/-Discord-%235662f6?style=for-the-badge)](https://discord.gg/F53gBjR97G)

# How to use

This module has four main features

1. Deep Folder Search: This feature is optional, if enabled it will allow you to search in subfolders when using the file picker
2.  Fuzzy search: This will be automatic, what this does is it finds the closest matches to your search, for example searching for accolite will show "Acolyte" in the results, this works on compendiums and actor sidebar and it's enabled by default
3. Prop search: starting a search with "!" will search in the properties defined in the settings. For example if "data.details.cr" is a property defined in the settings searching for !1 will filter for creatures with cr 1
4. Deep search: the deep search starts with the "&" symbol, this search will look into the items to find a property or value that matches the search. For example searching for the name of an image will filter for any entity that is using that image

NOTICE: The search might be slow on huge directories

# Screenshots/Examples

## The text in this journals contains the word "Tips"
![image](https://user-images.githubusercontent.com/1346839/129585437-045d7ddd-bb5a-48e4-8af4-ee609c521caa.png)

## These scenes have tiles with images that include cobbler in their name
![image](https://user-images.githubusercontent.com/1346839/129585504-fc44ed02-0f17-44a6-86c4-5c866317f199.png)

## Search for CR in dnd5e using the deep search
![image](https://user-images.githubusercontent.com/1346839/129585572-22ea8284-ed22-495e-bf93-47902e48796d.png)

## A more advanced search for compendium (these creatures where imported from the dndsrd monsters compendium)
![image](https://user-images.githubusercontent.com/1346839/129585653-fb3e83b9-0f80-49d4-8985-05ccb1862642.png)


# License / Credits

## Fuzzyset.js

This package is licensed under the Prosperity Public License 3.0.

That means that this package is free to use for non-commercial projects

See https://github.com/Glench/fuzzyset.js for more details
