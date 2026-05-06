// content.js – Workday Autofill (label/text-based, exact selectors from real DOM)

// ─── Utilities ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Workday uses React — must bypass synthetic event system with native setter
function setNativeValue(el, value) {
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  return true;
}

// Apply value to a regular text input AND mark it touched (focus → set → blur).
// The blur/focusout events are what Workday's React form uses to clear validation errors.
async function fillInput(input, value) {
  if (!input) return;
  input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  input.dispatchEvent(new FocusEvent('focus',   { bubbles: true }));
  input.focus();
  await sleep(60);
  setNativeValue(input, value);
  await sleep(60);
  input.dispatchEvent(new FocusEvent('blur',     { bubbles: true }));
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  await sleep(60);
}

// Workday date spinbuttons — separate Month and Year <input role="spinbutton"> elements.
// Must fire a full focus → value → blur cycle; without blur Workday's form state
// never marks the field as "touched" and shows "field is required" even with a value.
async function fillSpinbutton(input, numericValue) {
  if (!input) return;
  // Focus
  input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  input.dispatchEvent(new FocusEvent('focus',   { bubbles: true }));
  input.focus();
  await sleep(80);
  // Set value
  setNativeValue(input, String(numericValue));
  // Update aria-valuetext so Workday's spinbutton widget sees the change
  input.setAttribute('aria-valuetext', String(numericValue));
  input.setAttribute('aria-valuenow',  String(numericValue));
  await sleep(80);
  // Blur — clears the validation error
  input.dispatchEvent(new FocusEvent('blur',     { bubbles: true }));
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  await sleep(80);
}

// Wait for a selector to appear in DOM
async function waitFor(selector, maxMs = 5000, root = document) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const el = root.querySelector(selector);
    if (el) return el;
    await sleep(150);
  }
  return null;
}

// Find a [role="group"] section by its heading text (label-based, ID-agnostic)
function findSectionByHeading(headingText) {
  const groups = document.querySelectorAll('[role="group"]');
  for (const g of groups) {
    const labelId = g.getAttribute('aria-labelledby');
    if (!labelId) continue;
    const labelEl = document.getElementById(labelId);
    if (!labelEl) continue;  // guard: aria-labelledby may point to non-existent ID
    const labelText = labelEl.textContent.trim().toLowerCase();
    if (labelText.includes(headingText.toLowerCase())) {
      return g;
    }
  }
  return null;
}

// Inside a section, get all DIRECT entry sub-groups.
// e.g. "Work History (Optional) 1", "Education (Optional) 1"
// Excludes deeply-nested role=group elements like dateInputWrapper.
function getEntryGroups(sectionGroup) {
  return Array.from(sectionGroup.querySelectorAll('[role="group"][aria-labelledby]'))
    .filter(g => {
      // The nearest role=group ancestor must be the section itself — not an entry panel
      const nearestGroupParent = g.parentElement.closest('[role="group"]');
      if (nearestGroupParent !== sectionGroup) return false;
      // Entry panel labels always end with a number: "Work History (Optional) 1"
      const labelId = g.getAttribute('aria-labelledby');
      const labelEl = document.getElementById(labelId);
      return labelEl && /\d+\s*$/.test(labelEl.textContent.trim());
    });
}

// Click the "Add" / "Add Another" button inside a section group
function clickAddInSection(sectionGroup) {
  const btn = sectionGroup.querySelector('button[data-automation-id="add-button"]');
  if (btn) { btn.click(); return true; }
  const all = sectionGroup.querySelectorAll('button');
  for (const b of all) {
    const t = b.textContent.trim().toLowerCase();
    if (t === 'add' || t === 'add another') { b.click(); return true; }
  }
  return false;
}

// ─── Work Experience ─────────────────────────────────────────────────────────

async function fillOneWorkExperience(entryGroup, entry) {
  // Job Title
  const jobTitleInput = entryGroup.querySelector('[data-automation-id="formField-jobTitle"] input');
  await fillInput(jobTitleInput, entry.jobTitle);

  // Company  (automation-id is "companyName" not "company")
  const companyInput = entryGroup.querySelector('[data-automation-id="formField-companyName"] input');
  await fillInput(companyInput, entry.company);

  // Location (optional)
  if (entry.location) {
    const locInput = entryGroup.querySelector('[data-automation-id="formField-location"] input');
    await fillInput(locInput, entry.location);
  }

  // Currently work here checkbox
  if (entry.currentlyWorkHere) {
    const cb = entryGroup.querySelector('[data-automation-id="formField-currentlyWorkHere"] input[type="checkbox"]');
    if (cb && !cb.checked) { cb.click(); await sleep(400); }
  }

  // From date — separate Month + Year spinbuttons
  if (entry.from) {
    const [fromMonth, fromYear] = entry.from.split('/');
    const startField = entryGroup.querySelector('[data-automation-id="formField-startDate"]');
    if (startField) {
      const monthInput = startField.querySelector('[data-automation-id="dateSectionMonth-input"]');
      const yearInput  = startField.querySelector('[data-automation-id="dateSectionYear-input"]');
      await fillSpinbutton(monthInput, parseInt(fromMonth, 10));
      await fillSpinbutton(yearInput,  parseInt(fromYear,  10));
    }
  }

  // To date
  if (!entry.currentlyWorkHere && entry.to) {
    const [toMonth, toYear] = entry.to.split('/');
    const endField = entryGroup.querySelector('[data-automation-id="formField-endDate"]');
    if (endField) {
      const monthInput = endField.querySelector('[data-automation-id="dateSectionMonth-input"]');
      const yearInput  = endField.querySelector('[data-automation-id="dateSectionYear-input"]');
      await fillSpinbutton(monthInput, parseInt(toMonth, 10));
      await fillSpinbutton(yearInput,  parseInt(toYear,  10));
    }
  }

  // Role Description
  if (entry.description) {
    const textarea = entryGroup.querySelector('[data-automation-id="formField-roleDescription"] textarea');
    if (textarea) await fillInput(textarea, entry.description);
  }

  console.log(`[Workday Autofill] ✅ Work: ${entry.jobTitle} @ ${entry.company}`);
}

async function fillAllWorkExperience(entries) {
  const status = { filled: 0, failed: 0 };

  const weSection = findSectionByHeading('Work Experience') || findSectionByHeading('Work History');
  if (!weSection) {
    console.error('[Workday Autofill] Could not find Work Experience/History section');
    return { filled: 0, failed: entries.length };
  }

  for (let i = 0; i < entries.length; i++) {
    console.log(`[Workday Autofill] Adding WE ${i + 1}/${entries.length}…`);

    // Workday pre-creates entry 1 when you first open the section.
    // Reuse any existing empty slots before clicking "Add Another".
    const existingGroups = getEntryGroups(weSection);
    let entryGroup = null;

    if (i < existingGroups.length) {
      // Slot already exists (pre-created by Workday) — fill it directly
      entryGroup = existingGroups[i];
      console.log(`[Workday Autofill] Reusing existing slot ${i + 1}`);
    } else {
      // Need a new slot — click Add Another and wait for it to appear
      const clicked = clickAddInSection(weSection);
      if (!clicked) { status.failed++; continue; }
      await sleep(900);
      const groups = getEntryGroups(weSection);
      entryGroup = groups[groups.length - 1];
    }

    if (!entryGroup) { status.failed++; continue; }

    try {
      await fillOneWorkExperience(entryGroup, entries[i]);
      status.filled++;
    } catch (e) {
      console.error('[Workday Autofill] Error:', e);
      status.failed++;
    }
    await sleep(400);
  }
  return status;
}

// ─── Education ───────────────────────────────────────────────────────────────

async function fillOneEducation(entryGroup, entry) {
  // School
  const schoolInput = entryGroup.querySelector('[data-automation-id="formField-schoolName"] input');
  await fillInput(schoolInput, entry.school);

  // Degree dropdown (listbox button)
  const degreeField = entryGroup.querySelector('[data-automation-id="formField-degree"]');
  if (degreeField) {
    const degBtn = degreeField.querySelector('button[aria-haspopup="listbox"]');
    if (degBtn) {
      degBtn.click();
      await sleep(700);
      const options = document.querySelectorAll('[role="option"]');
      let matched = false;
      for (const opt of options) {
        const txt = opt.textContent.trim().toLowerCase();
        if (
          txt.includes(entry.degree.toLowerCase()) ||
          (txt.includes('bachelor') && /bachelor/i.test(entry.degree)) ||
          (txt.includes('post')     && /post/i.test(entry.degree))
        ) {
          opt.click();
          matched = true;
          break;
        }
      }
      if (!matched) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(400);
    }
  }

  // Field of Study (multiselect search input)
  if (entry.fieldOfStudy) {
    const fosField = entryGroup.querySelector('[data-automation-id="formField-fieldOfStudy"]');
    if (fosField) {
      const searchInput = fosField.querySelector('input[data-uxi-widget-type="selectinput"], input[placeholder="Search"]');
      if (searchInput) {
        await fillInput(searchInput, entry.fieldOfStudy);
        await sleep(700);
        const firstOpt = document.querySelector('[data-automation-id="multiselectOption"], [role="option"]');
        if (firstOpt) firstOpt.click();
        else searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await sleep(300);
      }
    }
  }

  // GPA
  if (entry.gpa) {
    const gpaInput = entryGroup.querySelector('[data-automation-id="formField-gradeAverage"] input');
    await fillInput(gpaInput, entry.gpa);
  }

  // From year (YYYY only)
  if (entry.from) {
    const fromField = entryGroup.querySelector('[data-automation-id="formField-firstYearAttended"]');
    if (fromField) {
      const yearInput = fromField.querySelector('[data-automation-id="dateSectionYear-input"]');
      await fillSpinbutton(yearInput, parseInt(entry.from, 10));
    }
  }

  // To year (YYYY only)
  if (entry.to) {
    const toField = entryGroup.querySelector('[data-automation-id="formField-lastYearAttended"]');
    if (toField) {
      const yearInput = toField.querySelector('[data-automation-id="dateSectionYear-input"]');
      await fillSpinbutton(yearInput, parseInt(entry.to, 10));
    }
  }

  console.log(`[Workday Autofill] ✅ Education: ${entry.school}`);
}

async function fillAllEducation(entries) {
  const status = { filled: 0, failed: 0 };

  const eduSection = findSectionByHeading('Education');
  if (!eduSection) {
    console.error('[Workday Autofill] Could not find Education section');
    return { filled: 0, failed: entries.length };
  }

  for (let i = 0; i < entries.length; i++) {
    console.log(`[Workday Autofill] Adding Education ${i + 1}/${entries.length}…`);

    // Reuse pre-existing empty slot before clicking Add Another
    const existingGroups = getEntryGroups(eduSection);
    let entryGroup = null;

    if (i < existingGroups.length) {
      entryGroup = existingGroups[i];
      console.log(`[Workday Autofill] Reusing existing education slot ${i + 1}`);
    } else {
      const clicked = clickAddInSection(eduSection);
      if (!clicked) { status.failed++; continue; }
      await sleep(900);
      const groups = getEntryGroups(eduSection);
      entryGroup = groups[groups.length - 1];
    }

    if (!entryGroup) { status.failed++; continue; }

    try {
      await fillOneEducation(entryGroup, entries[i]);
      status.filled++;
    } catch (e) {
      console.error('[Workday Autofill] Error:', e);
      status.failed++;
    }
    await sleep(400);
  }
  return status;
}

// ─── Message Listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'ping') {
    sendResponse({ status: 'ready' });
    return;
  }

  // For all fill actions, respond immediately with "started" so the popup's
  // message channel doesn't time out during long fills (7+ entries × ~1.5s each).
  // The actual result is pushed back via chrome.runtime.sendMessage once done.
  if (msg.action === 'fillWorkExperience') {
    sendResponse({ started: true });
    fillAllWorkExperience(msg.data).then(result => {
      chrome.runtime.sendMessage({ type: 'fillResult', action: 'fillWorkExperience', result });
    });
    return; // channel already closed by sendResponse above
  }

  if (msg.action === 'fillEducation') {
    sendResponse({ started: true });
    fillAllEducation(msg.data).then(result => {
      chrome.runtime.sendMessage({ type: 'fillResult', action: 'fillEducation', result });
    });
    return;
  }

  if (msg.action === 'fillAll') {
    sendResponse({ started: true });
    (async () => {
      const weStatus  = await fillAllWorkExperience(msg.data.workExperience);
      await sleep(800);
      const eduStatus = await fillAllEducation(msg.data.education);
      chrome.runtime.sendMessage({
        type: 'fillResult',
        action: 'fillAll',
        result: { workExperience: weStatus, education: eduStatus }
      });
    })();
    return;
  }
});

console.log('[Workday Autofill] ✅ Content script ready');
