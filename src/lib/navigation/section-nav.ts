"use client";

const HIGHLIGHT_ATTR = "data-nav-highlighted";

export function navigateToSection(path: string, anchor: string) {
  if (typeof window === "undefined") return;
  window.location.assign(`${path}#${anchor}`);
}

export function scrollToSection(anchor: string) {
  if (typeof document === "undefined") return;
  const element = document.getElementById(anchor);
  if (!element) return;
  highlightSection(element);
  element.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function highlightSection(element: HTMLElement) {
  if (element.getAttribute(HIGHLIGHT_ATTR) === "true") return;
  const previousTransition = element.style.transition;
  const previousBoxShadow = element.style.boxShadow;
  const previousBackground = element.style.backgroundColor;

  element.setAttribute(HIGHLIGHT_ATTR, "true");
  element.style.transition = "box-shadow 180ms ease, background-color 180ms ease";
  element.style.boxShadow = "0 0 0 2px rgba(14, 165, 233, 0.35)";
  element.style.backgroundColor = "rgba(14, 165, 233, 0.06)";

  window.setTimeout(() => {
    element.style.boxShadow = previousBoxShadow;
    element.style.backgroundColor = previousBackground;
    element.style.transition = previousTransition;
    element.removeAttribute(HIGHLIGHT_ATTR);
  }, 1600);
}

export function highlightSectionFromHash() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const anchor = window.location.hash.replace(/^#/, "");
  if (!anchor) return;
  const element = document.getElementById(anchor);
  if (!element) return;
  highlightSection(element);
  element.scrollIntoView({ behavior: "smooth", block: "start" });
}
