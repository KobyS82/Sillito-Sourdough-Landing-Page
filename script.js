const form = document.getElementById('order-form');
const submitBtn = document.getElementById('submit-btn');
const successMsg = document.getElementById('success-msg');
const availBar = document.getElementById('avail-bar-content');
const weekSelect = document.getElementById('week');
const loavesSelect = document.getElementById('loaves');

let weeks = [];

const LOAF_LABELS = ['', '1 loaf', '2 loaves', '3 loaves', '4 loaves (whole batch)'];

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
  const upcoming = weeks.filter((w) => w.available > 0);
  availBar.innerHTML = '';

  const dot = document.createElement('span');
  dot.className = 'avail-dot';
  availBar.appendChild(dot);
  availBar.append(' ');

  if (upcoming.length === 0) {
    dot.style.background = '#e05252';
    dot.style.animation = 'none';
    const s = document.createElement('strong');
    s.textContent = 'Sold out this week';
    availBar.appendChild(s);
    availBar.append(' — reserve your spot below for the next available batch.');
  } else {
    const next = upcoming[0];
    const s = document.createElement('strong');
    s.textContent = next.label + ':';
    availBar.appendChild(s);
    availBar.append(
      `  ${next.available} loaf${next.available === 1 ? '' : 'ves'} available  —  Pickup locations announced by email`
    );
  }
}

function renderWeekSelect() {
  weekSelect.innerHTML = '';
  const upcoming = weeks.filter((w) => w.available > 0);

  if (upcoming.length === 0) {
    weekSelect.appendChild(new Option('No availability right now', '', true, true));
    weekSelect.options[0].disabled = true;
    weekSelect.disabled = true;
    loavesSelect.disabled = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sold Out';
    submitBtn.style.background = '#999';
    return;
  }

  const placeholder = new Option('Select a week', '', true, true);
  placeholder.disabled = true;
  weekSelect.appendChild(placeholder);

  upcoming.forEach((w) => {
    weekSelect.appendChild(
      new Option(`${w.label}  (${w.available} loaf${w.available === 1 ? '' : 'ves'} left)`, w.id)
    );
  });

  if (upcoming.length === 1) {
    weekSelect.value = upcoming[0].id;
    syncLoavesSelect(upcoming[0].available);
  }
}

function syncLoavesSelect(max) {
  const prev = loavesSelect.value;
  loavesSelect.innerHTML = '';
  loavesSelect.appendChild(new Option('Select quantity', '', true, true));
  loavesSelect.options[0].disabled = true;

  for (let i = 1; i <= Math.min(max, 4); i++) {
    loavesSelect.appendChild(new Option(LOAF_LABELS[i], String(i)));
  }

  if (prev && parseInt(prev) <= max) loavesSelect.value = prev;
}

weekSelect.addEventListener('change', () => {
  const week = weeks.find((w) => w.id === weekSelect.value);
  if (week) syncLoavesSelect(week.available);
});

// Honeypot — bots fill this, humans don't
const honeypot = document.createElement('input');
honeypot.type = 'text';
honeypot.name = '_gotcha';
honeypot.style.cssText = 'position:absolute;left:-9999px;opacity:0;height:0;';
honeypot.tabIndex = -1;
honeypot.autocomplete = 'off';
form.appendChild(honeypot);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (honeypot.value) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      form.style.display = 'none';
      successMsg.style.display = 'block';
      successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const data = await response.json();
      const msg = data?.errors?.map((err) => err.message).join(', ') || 'Something went wrong.';
      alert('Error: ' + msg);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reserve My Spot';
    }
  } catch {
    alert('Network error — please try again.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Reserve My Spot';
  }
});

init();
