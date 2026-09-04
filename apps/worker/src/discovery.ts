import { chromium, type Page } from "playwright";
import path from "node:path";
import { promises as fs } from "node:fs";
import { assertPublicHttpUrl } from "./urlSafety.js";
import type { DiscoveredElement, DiscoveredPage, DiscoveryResult } from "./types.js";

/**
 * Deterministic, non-AI application discovery: navigate the real app with a
 * plain scripted Playwright crawl and produce a structured locator inventory
 * for the generation prompt to consume. No model call happens anywhere in
 * this file - this is the "AI only interprets, deterministic components
 * inspect the application" split the platform design calls for, kept exactly
 * that way on purpose so it never costs Copilot credits to run.
 */

const PAGE_TIMEOUT_MS = 15_000;
const OVERALL_TIMEOUT_MS = 60_000;
const MAX_ELEMENTS_PER_PAGE = 300;

export interface DiscoveryOptions {
  appUrl: string;
  username?: string;
  password?: string;
  /** Screenshots are written here as page-0.png, page-1.png, ... */
  outputDir: string;
}

export async function discoverApplication(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const { appUrl, username, password, outputDir } = options;
  const entryUrl = await assertPublicHttpUrl(appUrl);

  const warnings: string[] = [];
  const pages: DiscoveredPage[] = [];
  const deadline = Date.now() + OVERALL_TIMEOUT_MS;

  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);

    await page.goto(entryUrl.toString(), { waitUntil: "domcontentloaded" });
    await waitForSpaHydration(page, warnings, "the entry page");
    pages.push(await snapshotPage(page, outputDir, pages.length));

    if (username && password && Date.now() < deadline) {
      const attempted = await attemptGenericLogin(page, username, password, warnings);
      if (attempted) {
        await waitForSpaHydration(page, warnings, "the post-login page");
        pages.push(await snapshotPage(page, outputDir, pages.length));
      }
    } else if (Date.now() >= deadline) {
      warnings.push("Overall discovery deadline reached before a login attempt could be made.");
    }
  } finally {
    await browser.close();
  }

  return { pages, warnings };
}

/**
 * "domcontentloaded"/"networkidle" alone can fire before a client-rendered
 * SPA has actually mounted its content - confirmed by hand against this exact
 * kind of app earlier in this project (the real form only appears after an
 * extra beat past networkidle). The fixed extra wait is a known flakiness
 * tradeoff, not a real synchronization signal; short enough not to matter
 * across a handful of pages.
 */
async function waitForSpaHydration(page: Page, warnings: string[], label: string): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: PAGE_TIMEOUT_MS }).catch(() => {
    warnings.push(`${label} did not reach networkidle within the timeout; continuing anyway.`);
  });
  await page.waitForTimeout(1500);
}

/**
 * Best-effort generic login: fills the first password field and the nearest
 * text/email field before it, then submits. This is a heuristic, not a
 * per-app integration - it covers the common single-page login form case
 * (confirmed against the live SecureBank app) and reports a warning rather
 * than failing silently when the page doesn't match that shape.
 */
async function attemptGenericLogin(
  page: Page,
  username: string,
  password: string,
  warnings: string[]
): Promise<boolean> {
  const passwordInput = page.locator('input[type="password"]').first();
  if ((await passwordInput.count()) === 0) {
    warnings.push("No password field found on the entry page; skipped the login attempt.");
    return false;
  }

  const usernameInput = page.locator('input[type="text"], input[type="email"], input:not([type])').first();
  if ((await usernameInput.count()) === 0) {
    warnings.push("No username/email field found on the entry page; skipped the login attempt.");
    return false;
  }

  await usernameInput.fill(username);
  await passwordInput.fill(password);

  const submitButton = page.getByRole("button", { name: /sign in|log in|login/i }).first();
  if ((await submitButton.count()) > 0) {
    await submitButton.click();
  } else {
    warnings.push('No button matching "sign in / log in / login" found; submitted via Enter on the password field instead.');
    await passwordInput.press("Enter");
  }

  return true;
}

async function snapshotPage(page: Page, outputDir: string, index: number): Promise<DiscoveredPage> {
  const screenshotPath = path.join(outputDir, `page-${index}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {
    // Screenshot failures shouldn't fail the whole discovery pass.
  });

  // A string passed to page.evaluate() is evaluated as a bare expression, not
  // called with an arg - so the arrow function's value itself is embedded and
  // invoked here, rather than relying on evaluate's arg-passing (which only
  // applies to an actual function reference, the thing this string exists to
  // avoid - see EXTRACT_ELEMENTS_SCRIPT's comment).
  const elements = (await page.evaluate(`(${EXTRACT_ELEMENTS_SCRIPT})(${MAX_ELEMENTS_PER_PAGE})`)) as DiscoveredElement[];

  return {
    url: page.url(),
    title: await page.title(),
    screenshotPath,
    elements,
  };
}

/**
 * Runs inside the browser page via page.evaluate. Passed as a raw string
 * (not a function reference) deliberately: tsx/esbuild's transform injects a
 * `__name(...)` helper-call wrapper around nested named functions, and that
 * helper doesn't exist once Playwright extracts just this function's source
 * to run in the browser context - confirmed by hitting exactly that
 * ReferenceError with a function reference. A string is sent to the browser
 * verbatim, so it never passes through that transform.
 *
 * Plain DOM/ARIA inspection, no Node APIs available here. Produces Playwright
 * selector strings directly usable as entries in the framework's String[]
 * locator pools, ordered by the same priority (role > test id > placeholder >
 * id > name > text) the platform's design docs specify.
 */
const EXTRACT_ELEMENTS_SCRIPT = `(maxElements) => {
  const SELECTOR =
    'input, button, a[href], select, textarea, [role="button"], [role="link"], ' +
    '[role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"]';
  const TEST_ID_ATTRS = ["data-testid", "data-test", "data-qa", "data-cy", "data-test-id"];

  function computeAccessibleName(el) {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();

    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl && labelEl.textContent) return labelEl.textContent.trim();
    }

    const elId = el.id;
    if (elId) {
      const label = document.querySelector('label[for="' + CSS.escape(elId) + '"]');
      if (label && label.textContent) return label.textContent.trim();
    }

    const parentLabel = el.closest("label");
    if (parentLabel && parentLabel.textContent) return parentLabel.textContent.trim();

    const placeholder = el.getAttribute("placeholder");
    if (placeholder) return placeholder.trim();

    const text = el.textContent ? el.textContent.trim() : "";
    if (text) return text.slice(0, 100);

    const title = el.getAttribute("title");
    if (title) return title.trim();

    return undefined;
  }

  function computeRole(el) {
    const explicitRole = el.getAttribute("role");
    if (explicitRole) return explicitRole;

    const tag = el.tagName.toLowerCase();
    if (tag === "button") return "button";
    if (tag === "a" && el.hasAttribute("href")) return "link";
    if (tag === "select") return "combobox";
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "submit" || type === "button") return "button";
      return "textbox";
    }
    if (tag === "textarea") return "textbox";
    return undefined;
  }

  function escapeAttr(value) {
    return value.replace(/"/g, '\\\\"');
  }

  const results = [];
  const elements = Array.from(document.querySelectorAll(SELECTOR));

  for (const el of elements) {
    if (results.length >= maxElements) break;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    const tag = el.tagName.toLowerCase();
    const elementType = tag === "input" ? (el.getAttribute("type") || "text") : undefined;
    const role = computeRole(el);
    const accessibleName = computeAccessibleName(el);
    const placeholder = el.getAttribute("placeholder") || undefined;
    const id = el.id || undefined;
    const name = el.getAttribute("name") || undefined;
    const text = (tag === "button" || tag === "a") && el.textContent ? el.textContent.trim().slice(0, 100) : undefined;

    let testId;
    let testIdAttr;
    for (const attr of TEST_ID_ATTRS) {
      const value = el.getAttribute(attr);
      if (value) {
        testId = value;
        testIdAttr = attr;
        break;
      }
    }

    const locators = [];

    if (role && accessibleName) {
      locators.push('role=' + role + '[name="' + escapeAttr(accessibleName) + '"]');
    }
    if (testId && testIdAttr) {
      locators.push('[' + testIdAttr + '="' + escapeAttr(testId) + '"]');
    }
    if (placeholder) {
      locators.push('[placeholder="' + escapeAttr(placeholder) + '"]');
    }
    if (id) {
      locators.push('#' + CSS.escape(id));
    }
    if (name) {
      locators.push('[name="' + escapeAttr(name) + '"]');
    }
    if (text) {
      locators.push('text=' + text);
    }

    if (locators.length === 0) continue;

    results.push({ tag, elementType, role, accessibleName, placeholder, testId, id, name, text, locators });
  }

  return results;
}`;
