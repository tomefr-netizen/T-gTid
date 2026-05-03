# TågTid Manual Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a user-facing manual page in the TågTid visual style and add a same-window link to it from the app settings.

**Architecture:** Keep the manual as a standalone static HTML page that reuses the existing shared stylesheet so it inherits the app theme. Add a small amount of CSS for article-specific layout, then expose the page through a plain anchor in the settings view.

**Tech Stack:** Static HTML, shared CSS, vanilla JavaScript-free content, Node test runner for content regression checks

---

### Task 1: Add regression checks for the manual page and link

**Files:**
- Create: `tests/manual-page.test.js`
- Test: `tests/manual-page.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manualHtml = fs.existsSync(path.join(root, 'manual.html'))
  ? fs.readFileSync(path.join(root, 'manual.html'), 'utf8')
  : '';

test('settings view links to the manual page', () => {
  assert.match(indexHtml, /href="manual\.html"/);
});

test('manual page contains key onboarding guidance', () => {
  assert.match(manualHtml, /Kom igång/i);
  assert.match(manualHtml, /API-nyckel/i);
  assert.match(manualHtml, /plats/i);
  assert.match(manualHtml, /Tillbaka till appen/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/manual-page.test.js`
Expected: FAIL because `manual.html` and the settings link do not exist yet.

- [ ] **Step 3: Write minimal implementation**

No production code in this task.

- [ ] **Step 4: Run test to verify it still fails for the expected reason**

Run: `node --test tests/manual-page.test.js`
Expected: FAIL with missing link or missing manual content.

- [ ] **Step 5: Commit**

```bash
git add tests/manual-page.test.js
git commit -m "Add manual page regression tests"
```

### Task 2: Build the manual page

**Files:**
- Create: `manual.html`
- Modify: `css/main.css`
- Test: `tests/manual-page.test.js`

- [ ] **Step 1: Write the failing test**

Use the test from Task 1. Do not change it yet.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/manual-page.test.js`
Expected: FAIL because the page and content are still missing.

- [ ] **Step 3: Write minimal implementation**

Create `manual.html` with:
- the same head metadata pattern as `index.html`
- a top hero section matching the app colors
- jump links to onboarding and help sections
- sections for onboarding, API key, GPS/station lookup, departures/arrivals, train details, saved trains, theme/update, and troubleshooting
- a same-window back link to `index.html#/`

Add focused CSS in `css/main.css` for:
- `.manual-page`
- `.manual-shell`
- `.manual-hero`
- `.manual-grid`
- `.manual-card`
- `.manual-steps`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/manual-page.test.js`
Expected: one test may still fail because the app link is not added yet, but the manual content test should pass.

- [ ] **Step 5: Commit**

```bash
git add manual.html css/main.css tests/manual-page.test.js
git commit -m "Build manual page"
```

### Task 3: Link the manual from app settings and verify end-to-end

**Files:**
- Modify: `index.html`
- Test: `tests/manual-page.test.js`

- [ ] **Step 1: Write the failing test**

Use the existing settings-link test from Task 1. It should still fail until the link is added.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/manual-page.test.js`
Expected: FAIL on the settings link assertion if the link is not present yet.

- [ ] **Step 3: Write minimal implementation**

Add a `Manual` link in the settings app section of `index.html`, styled with the existing secondary button class and pointing to `manual.html`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/manual-page.test.js`
Expected: PASS

Run: `git diff --stat`
Expected: shows `manual.html`, `index.html`, `css/main.css`, and `tests/manual-page.test.js`

- [ ] **Step 5: Commit**

```bash
git add index.html manual.html css/main.css tests/manual-page.test.js
git commit -m "Add in-app manual link"
```
