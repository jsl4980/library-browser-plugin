class FakeElement {
  constructor(tagName, ownerDocument, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = { ...attributes };
    this.children = [];
    this.dataset = {};
    this.hidden = false;
    this.parentNode = null;
    this.parentElement = null;
    this.href = attributes.href || "";
    this.id = attributes.id || "";
    this.className = attributes.class || "";
    this._textContent = "";
    this.style = {};
    this.listeners = new Map();
    this.width = Number(attributes.width || 0);
    this.height = Number(attributes.height || 0);
    this.offsetHeight = 240;
  }

  get textContent() {
    if (this.children.length) {
      return this.children.map((child) => child.textContent).join(" ");
    }
    return this._textContent || "";
  }

  set textContent(value) {
    this._textContent = value;
    this.children = [];
  }

  getAttribute(name) {
    if (name === "href") {
      return this.href || this.attributes.href || "";
    }
    if (name === "class") {
      return this.className;
    }
    return this.attributes[name] || "";
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === "href") {
      this.href = value;
    }
    if (name === "id") {
      this.id = value;
      this.ownerDocument.registerElement(this);
    }
    if (name === "class") {
      this.className = value;
    }
  }

  matches(selector) {
    return matchesSimpleSelector(this, selector);
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (matchesSimpleSelector(node, selector)) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  addEventListener(eventName, handler) {
    const list = this.listeners.get(eventName) || [];
    list.push(handler);
    this.listeners.set(eventName, list);
  }

  removeEventListener(eventName, handler) {
    const list = this.listeners.get(eventName) || [];
    this.listeners.set(
      eventName,
      list.filter((entry) => entry !== handler)
    );
  }

  dispatchEvent(event) {
    const type = typeof event === "string" ? event : event.type;
    for (const handler of this.listeners.get(type) || []) {
      handler(event);
    }
  }

  getBoundingClientRect() {
    return { top: 100, right: 200, bottom: 220, left: 80, width: 120, height: 120 };
  }

  remove() {
    if (!this.parentNode) {
      return;
    }
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
    this.parentElement = null;
  }

  prepend(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.unshift(child);
    this.ownerDocument.registerElement(child);
  }

  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    this.ownerDocument.registerElement(child);
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];

    const childPattern = /<([a-z0-9]+)([^>]*)>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = childPattern.exec(html))) {
      const [, tagName, rawAttributes, innerContent] = match;
      const attributes = parseAttributes(rawAttributes);
      const child = new FakeElement(tagName, this.ownerDocument, attributes);
      if (/<[a-z]/i.test(innerContent)) {
        child.innerHTML = innerContent;
      } else {
        child.textContent = stripTags(innerContent).trim();
      }
      this.appendChild(child);
    }
  }

  get innerHTML() {
    return this._innerHTML || "";
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    if (selector.includes(",")) {
      return selector
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .flatMap((part) => this.querySelectorAll(part));
    }

    const direct = this.children.filter((child) => matchesSimpleSelector(child, selector));
    const nested = this.children.flatMap((child) =>
      typeof child.querySelectorAll === "function" ? child.querySelectorAll(selector) : []
    );
    return direct.concat(nested);
  }
}

class FakeHtmlNode {
  constructor(textContent) {
    this.textContent = textContent;
  }
}

class FakeDocument {
  constructor(html) {
    this.html = html;
    this.readyState = "complete";
    this.listeners = new Map();
    this.elementsById = new Map();
    this.liveElements = new Set();
    this.documentElement = new FakeElement("html", this, { id: "html" });
    this.body = new FakeElement("body", this, { id: "body" });
    this.main = new FakeElement("main", this, { id: "main" });
    this.body.appendChild(this.main);
    this.documentElement.appendChild(this.body);
  }

  registerElement(element) {
    this.liveElements.add(element);
    if (element.id) {
      this.elementsById.set(element.id, element);
    }
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  addEventListener(eventName, handler) {
    this.listeners.set(eventName, handler);
  }

  dispatchEvent(eventName) {
    const handler = this.listeners.get(eventName);
    if (handler) {
      handler();
    }
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  querySelector(selector) {
    if (selector.includes(",")) {
      for (const part of selector.split(",").map((value) => value.trim()).filter(Boolean)) {
        const match = this.querySelector(part);
        if (match) {
          return match;
        }
      }
      return null;
    }

    const [ancestorSelector, descendantSelector] = selector.split(/\s+(.*)/).filter(Boolean);
    if (descendantSelector) {
      const ancestorMatch = this._matchFirst(ancestorSelector);
      if (!ancestorMatch) {
        return null;
      }
      return this._materialize(this._matchFirst(descendantSelector, ancestorMatch.innerHtml));
    }

    if (selector === "main") {
      return this.main;
    }

    if (selector === "body") {
      return this.body;
    }

    return this._materialize(this._matchFirst(selector));
  }

  querySelectorAll(selector) {
    if (selector.includes(",")) {
      return selector
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .flatMap((part) => this.querySelectorAll(part));
    }

    const liveMatches = [...this.liveElements].filter((element) => matchesSimpleSelector(element, selector));
    if (liveMatches.length) {
      return liveMatches;
    }

    const [ancestorSelector, descendantSelector] = selector.split(/\s+(.*)/).filter(Boolean);
    if (descendantSelector) {
      const ancestors = this._matchAll(ancestorSelector);
      if (descendantSelector === "*") {
        return ancestors.map((match) => new FakeHtmlNode(stripTags(match.innerHtml)));
      }

      return ancestors.flatMap((ancestorMatch) =>
        this._matchAll(descendantSelector, ancestorMatch.innerHtml).map((match) => this._materialize(match))
      );
    }

    return this._matchAll(selector).map((match) => this._materialize(match));
  }

  _materialize(match) {
    if (!match) {
      return null;
    }

    const element = new FakeElement(match.tagName, this, match.attributes);
    if (match.attributes.href) {
      element.href = match.attributes.href;
    }
    if (match.innerHtml && /<img\b/i.test(match.innerHtml)) {
      const imgMatch = match.innerHtml.match(/<img\b([^>]*)>/i);
      if (imgMatch) {
        const imgAttrs = parseAttributes(imgMatch[1]);
        const img = new FakeElement("img", this, imgAttrs);
        img.width = Number(imgAttrs.width || 100);
        img.height = Number(imgAttrs.height || 150);
        img._textContent = "";
        element.appendChild(img);
      }
    } else {
      element._textContent = match.textContent;
    }
    this.registerElement(element);
    return element;
  }

  _matchFirst(selector, html = this.html) {
    return this._matchAll(selector, html)[0] || null;
  }

  _matchAll(selector, html = this.html) {
    if (selector.startsWith("#")) {
      return matchByAttribute(html, "id", selector.slice(1));
    }

    if (selector.startsWith(".")) {
      return matchByClass(html, selector.slice(1));
    }

    const dataTestId = selector.match(/^\[data-testid='([^']+)'\]$/);
    if (dataTestId) {
      return matchByAttribute(html, "data-testid", dataTestId[1]);
    }

    const scriptType = selector.match(/^script\[type='([^']+)'\]$/);
    if (scriptType) {
      return matchByTagAndAttribute(html, "script", "type", scriptType[1]);
    }

    const hrefContains = selector.match(/^a\[href\*="([^"]+)"\]$/i);
    if (hrefContains) {
      return matchByTagAndAttributeContains(html, "a", "href", hrefContains[1]);
    }

    const tagAndClass = selector.match(/^([a-z0-9]+)\.([a-zA-Z0-9_-]+)$/i);
    if (tagAndClass) {
      return matchByTagAndClass(html, tagAndClass[1], tagAndClass[2]);
    }

    const tagOnly = selector.match(/^[a-z0-9]+$/i);
    if (tagOnly) {
      return matchByTag(html, selector);
    }

    return [];
  }
}

function parseAttributes(rawAttributes) {
  const attributes = {};
  const pattern = /([a-zA-Z0-9:_-]+)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(rawAttributes))) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchByTag(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  return collectMatches(pattern, html, tagName);
}

function matchByAttribute(html, attribute, value) {
  const pattern = new RegExp(
    `<([a-z0-9]+)\\b([^>]*)${attribute}="${escapeRegExp(value)}"([^>]*)>([\\s\\S]*?)<\\/\\1>`,
    "gi"
  );
  return collectMatches(pattern, html);
}

function matchByClass(html, className) {
  const pattern = new RegExp(
    `<([a-z0-9]+)\\b([^>]*)class="([^"]*\\b${escapeRegExp(className)}\\b[^"]*)"([^>]*)>([\\s\\S]*?)<\\/\\1>`,
    "gi"
  );
  return collectMatches(pattern, html);
}

function matchByTagAndAttribute(html, tagName, attribute, value) {
  const pattern = new RegExp(
    `<${tagName}\\b([^>]*)${attribute}="${escapeRegExp(value)}"([^>]*)>([\\s\\S]*?)<\\/${tagName}>`,
    "gi"
  );
  return collectMatches(pattern, html, tagName);
}

function matchByTagAndAttributeContains(html, tagName, attribute, value) {
  const pattern = new RegExp(
    `<${tagName}\\b([^>]*)${attribute}="([^"]*${escapeRegExp(value)}[^"]*)"([^>]*)>([\\s\\S]*?)<\\/${tagName}>`,
    "gi"
  );
  const matches = [];
  let match;
  while ((match = pattern.exec(html))) {
    matches.push({
      tagName,
      attributes: parseAttributes(`${match[1]} ${attribute}="${match[2]}" ${match[3]}`),
      innerHtml: match[4],
      textContent: stripTags(match[4])
    });
  }
  return matches;
}

function matchByTagAndClass(html, tagName, className) {
  const pattern = new RegExp(
    `<${tagName}\\b([^>]*)class="([^"]*\\b${escapeRegExp(className)}\\b[^"]*)"([^>]*)>([\\s\\S]*?)<\\/${tagName}>`,
    "gi"
  );
  return collectMatches(pattern, html, tagName);
}

function collectMatches(pattern, html, forcedTagName) {
  const matches = [];
  let match;
  while ((match = pattern.exec(html))) {
    const fullMatch = match[0];
    const tagName = forcedTagName || match[1];
    const attributeChunks = match.slice(1, -1).filter((value) => typeof value === "string");
    matches.push({
      tagName,
      raw: fullMatch,
      attributes: parseAttributes(attributeChunks.join(" ")),
      innerHtml: match[match.length - 1],
      textContent: stripTags(match[match.length - 1])
    });
  }
  return matches;
}

function matchesSimpleSelector(element, selector) {
  if (!element || !selector) {
    return false;
  }

  if (selector.includes("[")) {
    const hrefContains = selector.match(/^a\[href\*="([^"]+)"\]$/i);
    if (hrefContains) {
      return (
        element.tagName === "A" &&
        String(element.getAttribute("href") || element.href || "").includes(hrefContains[1])
      );
    }

    const dataTestId = selector.match(/^\[data-testid='([^']+)'\]$/);
    if (dataTestId) {
      return element.getAttribute("data-testid") === dataTestId[1];
    }

    const attrContains = selector.match(/^([a-z0-9]*)\[([a-z0-9_-]+)\*="([^"]+)"\]$/i);
    if (attrContains) {
      const [, tagName, attr, value] = attrContains;
      if (tagName && element.tagName.toLowerCase() !== tagName.toLowerCase()) {
        return false;
      }
      return String(element.getAttribute(attr) || "").includes(value);
    }
  }

  if (selector.startsWith(".")) {
    return String(element.className || "")
      .split(/\s+/)
      .includes(selector.slice(1));
  }

  if (selector.startsWith("#")) {
    return element.id === selector.slice(1);
  }

  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function createDocumentFromHtml(html) {
  return new FakeDocument(html);
}

module.exports = {
  createDocumentFromHtml
};
