class FuzzySearchFilters {

    static onMatchFolder(folder, folderIds, autoExpandIds, { autoExpand=true }={}) {
        if ( typeof folder === "string" ) folder = this.collection.folders.get(folder);
        if ( !folder ) return;
        const folderId = folder._id;
        const visited = folderIds.has(folderId);
        folderIds.add(folderId);
        if ( autoExpand ) autoExpandIds.add(folderId);
        if ( !visited && folder.folder ) return FuzzySearchFilters.onMatchFolder.bind(this)(folder.folder, folderIds, autoExpandIds);
    }

    static _matchSearchEntries(query, entryIds, folderIds, autoExpandIds, options={}) {
        const nameOnlySearch = this.collection.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME;
        const entries = this.collection.index ?? this.collection.contents;
        const matchedFolderIds = new Set(folderIds);

        const result = [];
        const fuzzyDB = entries.map((e) => e.name);
        const fs = FuzzySearchFilters.FuzzySet(fuzzyDB, true);
        const qResult = fs.get(query.source) || [];
        for (let r of qResult) {
            if (r[0] > 0.5) {
                result.push(r[1]);
            }
        }
    
        for ( const entry of entries ) {
          const entryId = entry._id;
    
          if ( matchedFolderIds.has(entry.folder?._id ?? entry.folder) ) entryIds.add(entryId);
    
          else if ((nameOnlySearch && (query.test(foundry.applications.ux.SearchFilter.cleanQuery(entry.name))) || result.includes(entry.name) || FuzzySearchFilters.fuzzyMatchActor(entry, query.source))) {
            entryIds.add(entryId);
            FuzzySearchFilters.onMatchFolder.bind(this)(entry.folder, folderIds, autoExpandIds);
          }
        }
    
        if ( nameOnlySearch ) return;
    
        const matches = this.collection.search({ query: query.source, exclude: Array.from(entryIds) });
        for ( const match of matches ) {
          if ( entryIds.has(match._id) ) continue;
          entryIds.add(match._id);
          FuzzySearchFilters.onMatchFolder.bind(this)(match.folder, folderIds, autoExpandIds);
        }
      }

    static FuzzySet(arr, useLevenshtein, gramSizeLower, gramSizeUpper) {
        var fuzzyset = {};

        // default options
        arr = arr || [];
        fuzzyset.gramSizeLower = gramSizeLower || 2;
        fuzzyset.gramSizeUpper = gramSizeUpper || 3;
        fuzzyset.useLevenshtein = typeof useLevenshtein !== "boolean" ? true : useLevenshtein;

        // define all the object functions and attributes
        fuzzyset.exactSet = {};
        fuzzyset.matchDict = {};
        fuzzyset.items = {};

        // helper functions
        var levenshtein = function (str1, str2) {
            var current = [],
                prev,
                value;

            for (var i = 0; i <= str2.length; i++)
                for (var j = 0; j <= str1.length; j++) {
                    if (i && j)
                        if (str1.charAt(j - 1) === str2.charAt(i - 1)) value = prev;
                        else value = Math.min(current[j], current[j - 1], prev) + 1;
                    else value = i + j;

                    prev = current[j];
                    current[j] = value;
                }

            return current.pop();
        };

        // return an edit distance from 0 to 1
        var _distance = function (str1, str2) {
            if (str1 === null && str2 === null) throw "Trying to compare two null values";
            if (str1 === null || str2 === null) return 0;
            str1 = String(str1);
            str2 = String(str2);

            var distance = levenshtein(str1, str2);
            if (str1.length > str2.length) {
                return 1 - distance / str1.length;
            } else {
                return 1 - distance / str2.length;
            }
        };
        var _nonWordRe = /[^a-zA-Z0-9\u00C0-\u00FF, ]+/g;

        var _iterateGrams = function (value, gramSize) {
            gramSize = gramSize || 2;
            var simplified = "-" + value.toLowerCase().replace(_nonWordRe, "") + "-",
                lenDiff = gramSize - simplified.length,
                results = [];
            if (lenDiff > 0) {
                for (var i = 0; i < lenDiff; ++i) {
                    simplified += "-";
                }
            }
            for (var i = 0; i < simplified.length - gramSize + 1; ++i) {
                results.push(simplified.slice(i, i + gramSize));
            }
            return results;
        };

        var _gramCounter = function (value, gramSize) {
            // return an object where key=gram, value=number of occurrences
            gramSize = gramSize || 2;
            var result = {},
                grams = _iterateGrams(value, gramSize),
                i = 0;
            for (i; i < grams.length; ++i) {
                if (grams[i] in result) {
                    result[grams[i]] += 1;
                } else {
                    result[grams[i]] = 1;
                }
            }
            return result;
        };

        // the main functions
        fuzzyset.get = function (value, defaultValue, minMatchScore) {
            // check for value in set, returning defaultValue or null if none found
            if (minMatchScore === undefined) {
                minMatchScore = 0.33;
            }
            var result = this._get(value, minMatchScore);
            if (!result && typeof defaultValue !== "undefined") {
                return defaultValue;
            }
            return result;
        };

        fuzzyset._get = function (value, minMatchScore) {
            var results = [];
            // start with high gram size and if there are no results, go to lower gram sizes
            for (var gramSize = this.gramSizeUpper; gramSize >= this.gramSizeLower; --gramSize) {
                results = this.__get(value, gramSize, minMatchScore);
                if (results && results.length > 0) {
                    return results;
                }
            }
            return null;
        };

        fuzzyset.__get = function (value, gramSize, minMatchScore) {
            var normalizedValue = this._normalizeStr(value),
                matches = {},
                gramCounts = _gramCounter(normalizedValue, gramSize),
                items = this.items[gramSize],
                sumOfSquareGramCounts = 0,
                gram,
                gramCount,
                i,
                index,
                otherGramCount;

            for (gram in gramCounts) {
                gramCount = gramCounts[gram];
                sumOfSquareGramCounts += Math.pow(gramCount, 2);
                if (gram in this.matchDict) {
                    for (i = 0; i < this.matchDict[gram].length; ++i) {
                        index = this.matchDict[gram][i][0];
                        otherGramCount = this.matchDict[gram][i][1];
                        if (index in matches) {
                            matches[index] += gramCount * otherGramCount;
                        } else {
                            matches[index] = gramCount * otherGramCount;
                        }
                    }
                }
            }

            function isEmptyObject(obj) {
                for (var prop in obj) {
                    if (obj.hasOwnProperty(prop)) return false;
                }
                return true;
            }

            if (isEmptyObject(matches)) {
                return null;
            }

            var vectorNormal = Math.sqrt(sumOfSquareGramCounts),
                results = [],
                matchScore;
            // build a results list of [score, str]
            for (var matchIndex in matches) {
                matchScore = matches[matchIndex];
                results.push([matchScore / (vectorNormal * items[matchIndex][0]), items[matchIndex][1]]);
            }
            var sortDescending = function (a, b) {
                if (a[0] < b[0]) {
                    return 1;
                } else if (a[0] > b[0]) {
                    return -1;
                } else {
                    return 0;
                }
            };
            results.sort(sortDescending);
            if (this.useLevenshtein) {
                var newResults = [],
                    endIndex = Math.min(50, results.length);
                // truncate somewhat arbitrarily to 50
                for (var i = 0; i < endIndex; ++i) {
                    newResults.push([_distance(results[i][1], normalizedValue), results[i][1]]);
                }
                results = newResults;
                results.sort(sortDescending);
            }
            newResults = [];
            results.forEach(
                function (scoreWordPair) {
                    if (scoreWordPair[0] >= minMatchScore) {
                        newResults.push([scoreWordPair[0], this.exactSet[scoreWordPair[1]]]);
                    }
                }.bind(this),
            );
            return newResults;
        };

        fuzzyset.add = function (value) {
            var normalizedValue = this._normalizeStr(value);
            if (normalizedValue in this.exactSet) {
                return false;
            }

            var i = this.gramSizeLower;
            for (i; i < this.gramSizeUpper + 1; ++i) {
                this._add(value, i);
            }
        };

        fuzzyset._add = function (value, gramSize) {
            var normalizedValue = this._normalizeStr(value),
                items = this.items[gramSize] || [],
                index = items.length;

            items.push(0);
            var gramCounts = _gramCounter(normalizedValue, gramSize),
                sumOfSquareGramCounts = 0,
                gram,
                gramCount;
            for (gram in gramCounts) {
                gramCount = gramCounts[gram];
                sumOfSquareGramCounts += Math.pow(gramCount, 2);
                if (gram in this.matchDict) {
                    this.matchDict[gram].push([index, gramCount]);
                } else {
                    this.matchDict[gram] = [[index, gramCount]];
                }
            }
            var vectorNormal = Math.sqrt(sumOfSquareGramCounts);
            items[index] = [vectorNormal, normalizedValue];
            this.items[gramSize] = items;
            this.exactSet[normalizedValue] = value;
        };

        fuzzyset._normalizeStr = function (str) {
            if (Object.prototype.toString.call(str) !== "[object String]") throw "Must use a string as argument to FuzzySet functions";
            return str.toLowerCase();
        };

        // return length of items in set
        fuzzyset.length = function () {
            var count = 0,
                prop;
            for (prop in this.exactSet) {
                if (this.exactSet.hasOwnProperty(prop)) {
                    count += 1;
                }
            }
            return count;
        };

        // return is set is empty
        fuzzyset.isEmpty = function () {
            for (var prop in this.exactSet) {
                if (this.exactSet.hasOwnProperty(prop)) {
                    return false;
                }
            }
            return true;
        };

        // return list of values loaded into set
        fuzzyset.values = function () {
            var values = [],
                prop;
            for (prop in this.exactSet) {
                if (this.exactSet.hasOwnProperty(prop)) {
                    values.push(this.exactSet[prop]);
                }
            }
            return values;
        };

        // initialization
        var i = fuzzyset.gramSizeLower;
        for (i; i < fuzzyset.gramSizeUpper + 1; ++i) {
            fuzzyset.items[i] = [];
        }
        // add all the items to the set
        for (i = 0; i < arr.length; ++i) {
            fuzzyset.add(arr[i]);
        }

        return fuzzyset;
    }

    static fuzzyMatchActor(document, query, forceDeepSearch = false) {
        query = query.replaceAll("\\", "")
        const matchExact = query.startsWith("!");
        const deepSearch = forceDeepSearch || query.startsWith("&");
        if (deepSearch) {
            if (query.startsWith("&")) {
                query = query.slice(1).toLowerCase();
            }
            const searchString = SearchFilter.cleanQuery(JSON.stringify(document).toLowerCase());
            //if the query contains && or || we need to split the query into an array of objects containing the queries and the operator
            if (query.includes("&&") || query.includes("|")) {
                const queries = query.split(/(\&\&|\|)/g).map((q) => q.replace('\\',"").trim()).filter((q) => q);
                let operator = "";
                let currentResult = false;
                for (let q of queries) {
                    if (q === "&&" || q === "||" || q === "|") {
                        operator = q;
                        continue;
                    } else {
                        const termResult = searchString.includes(q);
                        if (operator === "&&") {
                            currentResult = currentResult && termResult;
                        } else {
                            currentResult = currentResult || termResult;
                        }
                    }
                }
                return currentResult;
            }
            if (searchString.includes(query)) {
                try {
                    if (document instanceof JournalEntry) {
                        const page = Array.from(document.pages).find((p) => p?.text?.content?.toLowerCase()?.includes(query));
                        const pageByTitle = Array.from(document.pages).find((p) => p?.name?.toLowerCase()?.includes(query));
                        const res = page || pageByTitle;
                        if (res) {
                            const html = $(res.text.content);
                            let scrollPoint;
                            html.each((i, el) => {
                                if (el.textContent.toLowerCase().includes(query)) {
                                    scrollPoint = $(el);
                                    return false;
                                }
                            });
                            let anchor = scrollPoint?.closest("h1,h2,h3,h4,h5,h6")?.first();
                            if (!anchor?.length) {
                                let prevSibling;
                                scrollPoint = scrollPoint[0];
                                while (!prevSibling?.nodeName?.toLowerCase()?.includes("h")) {
                                    prevSibling = scrollPoint.previousSibling;
                                    if (!prevSibling || prevSibling.length == 0) break;
                                    scrollPoint = prevSibling;
                                }
                                anchor = $(prevSibling);
                            }
                            const anchorText = anchor?.text()?.slugify() ?? null;
                            document.deepSearchResult = { pageId: res.id, anchor: anchorText };
                        }
                    }
                } catch (e) {}
                return true;
            } else return false;
        }

        if (document.documentName != "Actor") {
            return false;
        }
        const deepProps = game.settings.get("fuzzy-foundry", "props").split(",");
        for (let prop of deepProps) {
            const p = Object.byString(document.system, prop);
            if (!p) continue;
            const propValue = String(p);

            if (matchExact) {
                if (propValue.toLowerCase() === query.replace("!", "").toLowerCase()) return true;
                else continue;
            }
            const fs = FuzzySearchFilters.FuzzySet(propValue, true);
            const qresult = fs.get(query) || [];
            if (qresult.length > 0 || propValue.toLowerCase().includes(query.toLowerCase())) {
                return true;
            }
        }
    }
}
