const NON_WORD = /[^a-zA-Z0-9À-ÿ, ]+/g;

function levenshtein(a, b) {
    const current = [];
    let prev;
    let value;
    for (let i = 0; i <= b.length; i++) {
        for (let j = 0; j <= a.length; j++) {
            if (i && j) value = a.charAt(j - 1) === b.charAt(i - 1) ? prev : Math.min(current[j], current[j - 1], prev) + 1;
            else value = i + j;
            prev = current[j];
            current[j] = value;
        }
    }
    return current.pop();
}

function similarity(a, b) {
    const distance = levenshtein(a, b);
    return 1 - distance / Math.max(a.length, b.length);
}

function grams(value, gramSize) {
    let simplified = "-" + value.toLowerCase().replace(NON_WORD, "") + "-";
    while (simplified.length < gramSize) simplified += "-";
    const results = [];
    for (let i = 0; i < simplified.length - gramSize + 1; i++) results.push(simplified.slice(i, i + gramSize));
    return results;
}

function gramCounts(value, gramSize) {
    const counts = {};
    for (const gram of grams(value, gramSize)) counts[gram] = (counts[gram] ?? 0) + 1;
    return counts;
}

export class FuzzySet {
    constructor(values = [], { gramSizeLower = 2, gramSizeUpper = 3 } = {}) {
        this.gramSizeLower = gramSizeLower;
        this.gramSizeUpper = gramSizeUpper;
        this.exactSet = new Map();
        this.matchDict = new Map();
        this.items = {};
        for (let size = gramSizeLower; size <= gramSizeUpper; size++) this.items[size] = [];
        for (const value of values) this.add(value);
    }

    get size() {
        return this.exactSet.size;
    }

    add(value) {
        if (typeof value !== "string" || !value) return false;
        const normalized = value.toLowerCase();
        if (this.exactSet.has(normalized)) return false;
        for (let size = this.gramSizeLower; size <= this.gramSizeUpper; size++) {
            const items = this.items[size];
            const index = items.length;
            let sumOfSquares = 0;
            for (const [gram, count] of Object.entries(gramCounts(normalized, size))) {
                sumOfSquares += count * count;
                const key = `${size}:${gram}`;
                if (!this.matchDict.has(key)) this.matchDict.set(key, []);
                this.matchDict.get(key).push([index, count]);
            }
            items.push([Math.sqrt(sumOfSquares), normalized]);
        }
        this.exactSet.set(normalized, value);
        return true;
    }

    get(value, minScore = 0.33) {
        if (typeof value !== "string" || !value) return [];
        const normalized = value.toLowerCase();
        for (let size = this.gramSizeUpper; size >= this.gramSizeLower; size--) {
            const results = this.#get(normalized, size, minScore);
            if (results.length) return results;
        }
        return [];
    }

    #get(normalized, size, minScore) {
        const matches = new Map();
        let sumOfSquares = 0;
        for (const [gram, count] of Object.entries(gramCounts(normalized, size))) {
            sumOfSquares += count * count;
            for (const [index, otherCount] of this.matchDict.get(`${size}:${gram}`) ?? []) {
                matches.set(index, (matches.get(index) ?? 0) + count * otherCount);
            }
        }
        if (!matches.size) return [];
        const items = this.items[size];
        const vectorNormal = Math.sqrt(sumOfSquares);
        const candidates = [...matches]
            .map(([index, score]) => [score / (vectorNormal * items[index][0]), items[index][1]])
            .sort((a, b) => b[0] - a[0])
            .slice(0, 50)
            .map(([, item]) => [similarity(item, normalized), item])
            .sort((a, b) => b[0] - a[0]);
        return candidates.filter(([score]) => score >= minScore).map(([score, item]) => [score, this.exactSet.get(item)]);
    }
}
