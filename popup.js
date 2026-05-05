// popup.js

// Function to render data from RESUME_DATA into the popup UI
function renderResumeData() {
  const workList = document.getElementById('work-list');
  const eduList = document.getElementById('edu-list');
  const workTitle = document.getElementById('work-title');
  const eduTitle = document.getElementById('edu-title');

  // 1. Populate Work Experience
  workTitle.textContent = `💼 Work Experience (${RESUME_DATA.workExperience.length} entries)`;
  workList.innerHTML = RESUME_DATA.workExperience.map(exp => `
    <div class="item">
      <div class="item-dot"></div>
      <div class="item-text">
        <strong>${exp.jobTitle}</strong>
        <span>${exp.company} · ${exp.from} – ${exp.to || 'Present'}</span>
      </div>
    </div>
  `).join('');

  // 2. Populate Education
  eduTitle.textContent = `🎓 Education (${RESUME_DATA.education.length} entries)`;
  eduList.innerHTML = RESUME_DATA.education.map(edu => `
    <div class="item">
      <div class="item-dot"></div>
      <div class="item-text">
        <strong>${edu.degree} in ${edu.fieldOfStudy}</strong>
        <span>${edu.school} · ${edu.from} – ${edu.to}</span>
      </div>
    </div>
  `).join('');
}

function showStatus(msg, type = 'info') {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status show ${type}`;
}

function hideProgress() {
  document.getElementById('progress').className = 'progress-row';
}

function setButtonsDisabled(disabled) {
  ['btnAll', 'btnWork', 'btnEdu'].forEach(id => {
    document.getElementById(id).disabled = disabled;
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Inject content scripts manually — more reliable than relying on auto-injection
async function injectScripts(tabId) {
  try {
    // Test if already injected
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
  } catch {
    // Not injected yet — inject both files in order
    await chrome.scripting.executeScript({ target: { tabId }, files: ['data.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    // Give scripts a moment to initialize
    await new Promise(r => setTimeout(r, 400));
  }
}

async function sendFill(action, data) {
  const tab = await getActiveTab();

  if (!tab?.url?.match(/workday|myworkdayjobs/i)) {
    showStatus('⚠️ Please navigate to a Workday application page first.', 'error');
    return;
  }

  showStatus('⏳ Filling in progress — please don\'t click anything…', 'info');
  setButtonsDisabled(true);

  try {
    await injectScripts(tab.id);
  } catch (e) {
    showStatus('❌ Could not inject script. Check host_permissions and reload the extension.', 'error');
    setButtonsDisabled(false);
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action, data }, response => {
    setButtonsDisabled(false);
    hideProgress();

    if (chrome.runtime.lastError) {
      showStatus('❌ ' + chrome.runtime.lastError.message, 'error');
      return;
    }
    if (!response) {
      showStatus('⚠️ No response — form may have partially filled. Check the page.', 'error');
      return;
    }

    if (action === 'fillAll') {
      const we = response.workExperience;
      const edu = response.education;
      showStatus(
        `✅ Done! Work: ${we.filled} filled${we.failed ? ', ' + we.failed + ' failed' : ''} · ` +
        `Edu: ${edu.filled} filled${edu.failed ? ', ' + edu.failed + ' failed' : ''}`,
        'success'
      );
    } else {
      showStatus(`✅ Done! ${response.filled} filled${response.failed ? ', ' + response.failed + ' failed' : ''}.`, 'success');
    }
  });
}

document.getElementById('btnAll').addEventListener('click',  () => sendFill('fillAll',            RESUME_DATA));
document.getElementById('btnWork').addEventListener('click', () => sendFill('fillWorkExperience', RESUME_DATA.workExperience));
document.getElementById('btnEdu').addEventListener('click',  () => sendFill('fillEducation',      RESUME_DATA.education));
document.addEventListener('DOMContentLoaded', renderResumeData);