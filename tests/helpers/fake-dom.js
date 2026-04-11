class FakeElement {
  constructor(tagName, ownerDocument, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = { ...attributes };
    this.children = [];
    this.dataset = {};
    this.hidden = false;
    this.parentNode = null;
    this.href = attributes.href || "";
    this.id = attributes.id || "";
    this.className = attributes.class || "";
    this.textContent = "";
  }

  prepend(child) {
    child.parentNode = this;
    this.children.unshift(child);
    if (child.id) {
      this.ownerDocument.registerElement(child);
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    if (child.id) {
      this.ownerDocument.registerElement(child);
    }
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
      child.textContent = stripTags(innerContent).trim();
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
    return this.children.filter((child) => matchesSimpleSelector(child, selector));
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
    this.body = new FakeElement("body", this, { id: "body" });
    this.main = new FakeElement("main", this, { id: "main" });
    this.body.appendChild(this.main);
  }

  registerElement(element) {
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
    element.textContent = match.textContent;
    if (element.id) {
      this.registerElement(element);
    }
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
  if (selector.startsWith(".")) {
    return element.className.split(/\s+/).includes(selector.slice(1));
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
