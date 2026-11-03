// public/js/ui.js

export function el(tag, props = {}, children = []) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (key === "className") {
      element.className = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined) {
      element.setAttribute(key, value);
    }
  }

  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    if (child === null || child === undefined) continue;
    if (typeof child === "string" || typeof child === "number") {
      element.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  }

  return element;
}

export function formatPrice(cents) {
  const naira = cents / 100;
  return (
    "₦" +
    naira.toLocaleString("en-NG", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}
