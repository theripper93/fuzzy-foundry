const ESCAPE_SEQUENCE = /\\(?:x([0-9a-f]{2})|u([0-9a-f]{4})|(.))/gi;

export function queryFromRegExp(rgx) {
    return rgx.source.replace(ESCAPE_SEQUENCE, (_, hex, unicode, char) => char ?? String.fromCharCode(parseInt(hex ?? unicode, 16)));
}

export function cleanText(text) {
    return foundry.applications.ux.SearchFilter.cleanQuery(String(text ?? "")).toLowerCase();
}

export function normalizeName(text) {
    return cleanText(text).replace(/[\s_\-]+/g, " ").trim();
}

export function safeDecode(text) {
    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
}

export function fileName(path) {
    return path.slice(path.lastIndexOf("/") + 1);
}

export function fileExtension(path) {
    const name = fileName(path);
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function htmlToText(html) {
    if (!html) return "";
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content.textContent ?? "";
}

export function createLimiter(limit) {
    let active = 0;
    const queue = [];
    const next = () => {
        if (active >= limit || !queue.length) return;
        active++;
        const { fn, resolve, reject } = queue.shift();
        fn()
            .then(resolve, reject)
            .finally(() => {
                active--;
                next();
            });
    };
    return (fn) =>
        new Promise((resolve, reject) => {
            queue.push({ fn, resolve, reject });
            next();
        });
}
