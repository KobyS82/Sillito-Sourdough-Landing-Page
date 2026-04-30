const form        = document.getElementById('order-form');
const submitBtn   = document.getElementById('submit-btn');
const successMsg  = document.getElementById('success-msg');
const availBar    = document.getElementById('avail-bar-content');
const weekSelect  = document.getElementById('week');
const loavesSelect= document.getElementById('loaves');
const waitlistSec = document.getElementById('waitlist-section');
const orderSec    = document.getElementById('order-form');

const LOAF_LABELS = ['', '1 loaf', '2 loaves', '3 loaves', '4 loaves (whole batch)'];
let weeks = [];

// ── Availability ─────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('/api/availability');
    weeks = await res.json();
  } catch {
    weeks = [];
  }
  renderBar();
  renderWeekSelect();
}

function renderBar() {
  const upcoming = weeks.filter(w => w.available > 0);
  availBar.innerHTML = '';
  const dot = Object.assign(document.createElement('span'), { className: 'avail-dot' });
  availBar.appendChild(dot);
  availBar.append(' ');

  if (upcoming.length === 0) {
    dot.style.background = '#e05252';
    dot.style.animation  = 'none';
    const s = document.createElement('strong');
    s.textContent = 'Sold out right now';
    availBar.appendChild(s);
    availBar.append(' — join the waitlist below to be notified when a spot opens.');
  } else {
    const next = upcoming[0];
    const s = document.createElement('strong');
    s.textContent = next.label + ':';
    availBar.appendChild(s);
    availBar.append(
      `  ${next.available} loaf${next.available === 1 ? '' : 'ves'} available` +
      (upcoming.length > 1 ? ` — ${upcoming.length} weeks open` : '') +
      `  —  Pickup locations announced by email`
    );
  }
}

function renderWeekSelect() {
  weekSelect.innerHTML = '';
  const upcoming = weeks.filter(w => w.available > 0);

  if (upcoming.length === 0) {
    form.style.display = 'none';
    waitlistSec.style.display = 'block';
    return;
  }

  const ph = new Option('Select a week', '', true, true);
  ph.disabled = true;
  weekSelect.appendChild(ph);

  upcoming.forEach(w => {
    weekSelect.appendChild(
      new Option(`${w.label}  (${w.available} loaf${w.available === 1 ? '' : 'ves'} left)`, w.id)
    );
  });

  if (upcoming.length === 1) {
    weekSelect.value = upcoming[0].id;
    syncLoaves(upcoming[0].available);
  }
}

function syncLoaves(max) {
  const prev = loavesSelect.value;
  loavesSelect.innerHTML = '';
  const ph = new Option('Select quantity', '', true, true);
  ph.disabled = true;
  loavesSelect.appendChild(ph);
  for (let i = 1; i <= Math.min(max, 4); i++) {
    loavesSelect.appendChild(new Option(LOAF_LABELS[i], String(i)));
  }
  if (prev && parseInt(prev) <= max) loavesSelect.value = prev;
}

weekSelect.addEventListener('change', () => {
  const w = weeks.find(w => w.id === weekSelect.value);
  if (w) syncLoaves(w.available);
});

// ── SMS opt-in requires phone ────────────────────────────────────────────────
document.getElementById('sms-opt-in').addEventListener('change', function () {
  const phoneField = document.getElementById('phone');
  phoneField.required = this.checked;
  if (this.checked && !phoneField.value) phoneField.focus();
});

// ── Honeypot ─────────────────────────────────────────────────────────────────
const hp = Object.assign(document.createElement('input'), {
  type: 'text', name: '_hp', tabIndex: -1, autocomplete: 'off',
});
hp.style.cssText = 'position:absolute;left:-9999px;opacity:0;height:0;';
form.appendChild(hp);

// ── Order submit ─────────────────────────────────────────────────────────────
form.addEventListener('submit', async e => {
  e.preventDefault();
  if (hp.value) return; // bot

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Sending...';

  const body = {
    first_name:  document.getElementById('first-name').value.trim(),
    last_name:   document.getElementById('last-name').value.trim(),
    email:       document.getElementById('email').value.trim(),
    phone:       document.getElementById('phone').value.trim(),
    week:        weekSelect.value,
    loaves:      loavesSelect.value,
    notes:       document.getElementById('notes').value.trim(),
    sms_opt_in:  document.getElementById('sms-opt-in').checked,
    email_opt_in:document.getElementById('email-opt-in').checked,
    recurring:   document.getElementById('recurring').checked,
  };

  try {
    const res  = await fetch('/api/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();

    if (res.ok) {
      form.style.display       = 'none';
      successMsg.style.display = 'block';
      successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      alert(data.error || 'Something went wrong. Please try again.');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Reserve My Spot';
    }
  } catch {
    alert('Network error — please try again.');
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Reserve My Spot';
  }
});

// ── Waitlist submit ───────────────────────────────────────────────────────────
document.getElementById('waitlist-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email  = document.getElementById('wl-email').value.trim();
  const loaves = document.getElementById('wl-loaves').value;

  try {
    await fetch('/api/portal', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, joinWaitlist: true, loaves: parseInt(loaves) }),
    });
  } catch { /* silent fail — still show success */ }

  document.getElementById('waitlist-form').style.display      = 'none';
  document.getElementById('waitlist-success').style.display   = 'block';
});

init();
