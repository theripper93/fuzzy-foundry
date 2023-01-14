class FuzzySearchFilters {

  static SidebarDirectorySearch(event, query, rgx, html) {
    const isSearch = !!query;
    let entityIds = new Set();
    let folderIds = new Set();
    let result = [];
    let qresult = [];
    // Match documents and folders
    const ols = html.querySelectorAll("ol .subdirectory");
    if(query){
      ols.forEach(ol => {
        ol.dataset.prevDisplay = ol.style.display;
        ol.style.display = "flex";
        ol.style.flexDirection = "column";
      });
    }else{
      ols.forEach(ol => {
        ol.style.display = null;
      });
    }
    if (isSearch) {
      const fuzzyDB = this.documents.map((d) => d.name);
      const fs = FuzzySearchFilters.FuzzySet(fuzzyDB, true);
      qresult = fs.get(query) || [];
      for (let r of qresult) {
        if (r[0] > 0.5) {
          result.push(r[1]);
        }
      }
      // Match document names
      for (let d of this.documents) {
        if(d.deepSearchResult) delete d.deepSearchResult;
        const fuzzyMatch = FuzzySearchFilters.fuzzyMatchActor(d,query);
        if (
          fuzzyMatch || rgx.test(SearchFilter.cleanQuery(d.name)) ||
          result?.includes(d.name)
        ) {
          entityIds.add(d.id);
          if (d.folder) folderIds.add(d.folder.id);
        }
      }

      // Match folder tree
      const includeFolders = (fids) => {
        const folders = this.folders.filter((f) => fids.has(f.id));
        let pids = [];
        for(let f of folders) {
          for(let a of f.ancestors) {
            pids.push(a.id);
          }
        }
        pids = new Set(pids);
        if (pids.size) {
          pids.forEach((p) => folderIds.add(p));
          includeFolders(pids);
        }
      };
      includeFolders(folderIds);
    }

    // Toggle each directory item
    for (let el of html.querySelectorAll(".directory-item")) {
      // Entities
      if (el.classList.contains("document")) {
        el.style.display = !isSearch || entityIds.has(el.dataset.documentId) ? "flex" : "none";
        if(el.style.display == "none") {
          el.style.order = 0; continue;
        }        
        const name = el.querySelector('.document-name').innerText;
        const rgxTest = rgx.test(SearchFilter.cleanQuery(name));
        const match = result?.includes(name);
        let order = 0;
        if(match) order = qresult.find(r => r[1]==name)[0]*100 ?? 0;
        if(rgxTest) order += 1000;
        el.style.order = (match || rgxTest) ? parseInt(-order) : 0;
      }

      // Folders
      if (el.classList.contains("folder")) {
        let match = isSearch && folderIds.has(el.dataset.folderId);
        el.style.display = !isSearch || match ? "flex" : "none";
        if (isSearch && match) el.classList.remove("collapsed");
        else
          el.classList.toggle(
            "collapsed",
            !game.folders._expanded[el.dataset.folderId]
          );
      }
    }
  }

  static CompendiumSearch(event, query, rgx, html) {
    let fuzzyDB = [];
    if(!query) {
      html.style.display = "block";
      for (let li of html.children) {
        li.style.display = "flex";
        li.style.order = 0;
      }
      return;
    }
    for (let li of html.children) {
      fuzzyDB.push(li.querySelector(".document-name").textContent);
    }
    const fs = FuzzySearchFilters.FuzzySet(fuzzyDB, true);
    const qresult = fs.get(query) || [];
    let result = [];
    for (let r of qresult) {
      if (r[0] > 0.3) {
        result.push(r[1]);
      }
    }
    html.style.display = "flex";
    html.style.flexDirection = "column";
    for (let li of html.children) {
      const name = li.querySelector(".document-name").textContent;
      const isRgx = rgx.test(SearchFilter.cleanQuery(name));
      const isFuzzy = result?.includes(name);
      const match =  isRgx || isFuzzy;
      let order = 0;
      if(isFuzzy) order = qresult.find(r => r[1]==name)[0]*100;
      if(isRgx) order += 1000;
      li.style.display = match ? "flex" : "none";
      li.style.order = match ? parseInt(-order) : 0;
    }
  }

  static FuzzySet(arr, useLevenshtein, gramSizeLower, gramSizeUpper) {
    var fuzzyset = {};

    // default options
    arr = arr || [];
    fuzzyset.gramSizeLower = gramSizeLower || 2;
    fuzzyset.gramSizeUpper = gramSizeUpper || 3;
    fuzzyset.useLevenshtein =
      typeof useLevenshtein !== "boolean" ? true : useLevenshtein;

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
      if (str1 === null && str2 === null)
        throw "Trying to compare two null values";
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
      for (
        var gramSize = this.gramSizeUpper;
        gramSize >= this.gramSizeLower;
        --gramSize
      ) {
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
        results.push([
          matchScore / (vectorNormal * items[matchIndex][0]),
          items[matchIndex][1],
        ]);
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
          newResults.push([
            _distance(results[i][1], normalizedValue),
            results[i][1],
          ]);
        }
        results = newResults;
        results.sort(sortDescending);
      }
      newResults = [];
      results.forEach(
        function (scoreWordPair) {
          if (scoreWordPair[0] >= minMatchScore) {
            newResults.push([
              scoreWordPair[0],
              this.exactSet[scoreWordPair[1]],
            ]);
          }
        }.bind(this)
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
      if (Object.prototype.toString.call(str) !== "[object String]")
        throw "Must use a string as argument to FuzzySet functions";
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

  static fuzzyMatchActor(document,query){
    const matchExact = query.startsWith("!")
    const deepSearch = query.startsWith("&")
    if(deepSearch){
      const searchString = JSON.stringify(document).toLowerCase()
      if (searchString.includes(query.replace("&", "").toLowerCase())) {
        if (document instanceof JournalEntry) {
          const page = Array.from(document.pages).find((p) => p?.text?.content?.toLowerCase()?.includes(query.replace("&", "").toLowerCase()));
          const pageByTitle = Array.from(document.pages).find((p) => p?.name?.toLowerCase()?.includes(query.replace("&", "").toLowerCase()));
          const res = page || pageByTitle
          if (res) {
            const html = $(res.text.content)
            let scrollPoint
            html.each((i, el) => {
                if (el.textContent.toLowerCase().includes(query.replace("&", "").toLowerCase())) {
                    scrollPoint = $(el);
                    return false;
                }
            });
            let anchor = scrollPoint.closest("h1,h2,h3,h4,h5,h6").first();
            if (!anchor.length) { 
              let prevSibling;
              scrollPoint = scrollPoint[0]
              while(!prevSibling?.nodeName?.toLowerCase()?.includes("h")){
                prevSibling = scrollPoint.previousSibling;
                if(!prevSibling || prevSibling.length == 0) break;
                scrollPoint = prevSibling;
              }
              anchor = $(prevSibling);
            }
            const anchorText = anchor.text().slugify();
            document.deepSearchResult = { pageId: res.id, anchor: anchorText }
          }
        }
        return true
      }
      else
        return false
    }

    if(document.documentName != "Actor"){
      return false;
    }
    const deepProps = game.settings.get("fuzzy-foundry", "props").split(",")
    for(let prop of deepProps){
      const p = Object.byString(document,prop);
      if(!p) continue;
      const propValue = String(p);


      if(matchExact){
        if(propValue.toLowerCase()=== query.replace("!","").toLowerCase())
          return true;
        else
          continue;
      }
      const fs = FuzzySearchFilters.FuzzySet(propValue, true);
      const qresult = fs.get(query) || [];
      if(qresult.length > 0 || propValue.toLowerCase().includes(query.toLowerCase())){
        return true;
      }
    }
    
  }
}