// ── UPDATE THIS EACH WEEK ──────────────────────────────────────────────────
const LOAVES_AVAILABLE = 4;
// ──────────────────────────────────────────────────────────────────────────

const form = document.getElementById('order-form');
const submitBtn = document.getElementById('submit-btn');
const successMsg = document.getElementById('success-msg');
const availBar = document.querySelector('.availability-bar .container');
const loavesSelect = document.getElementById('loaves');

function initAvailability() {
  const n = LOAVES_AVAILABLE;

  // Update the availability bar text
  const dot = availBar.querySelector('.avail-dot');
  const strong = availBar.querySelector('strong');

  if (n <= 0) {
    dot.style.background = '#e05252';
    dot.style.animation = 'none';
    strong.textContent = 'Sold out this week!';
    availBar.innerHTML = '';
    availBar.appendChild(dot);
    availBar.append(' ');
    availBar.appendChild(strong);
    availBar.append(' —  Join the waitlist below for next week.');

    // Disable the select and button, update button label
    loavesSelect.disabled = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sold Out This Week';
    submitBtn.style.background = '#999';

    // Remove options that exceed availability
  } else {
    strong.textContent = 'This week:';
    availBar.querySelector('strong').after(
      Object.assign(document.createTextNode('  ' + n + ' loaf' + (n === 1 ? '' : 'ves') + ' available  —  Pickup locations announced by email'))
    );
    // Hide the old text node (replace the whole bar content)
    availBar.innerHTML = '';
    const newDot = document.createElement('span');
    newDot.className = 'avail-dot';
    const newStrong = document.createElement('strong');
    newStrong.textContent = 'This week:';
    availBar.appendChild(newDot);
    availBar.append(' ');
    availBar.appendChild(newStrong);
    availBar.append('  ' + n + ' loaf' + (n === 1 ? '' : 'ves') + ' available  —  Pickup locations announced by email');

    // Remove select options that exceed availability
    Array.from(loavesSelect.options).forEach((opt) => {
      const val = parseInt(opt.value, 10);
      if (val > n) opt.remove();
    });
  }
}

initAvailability();

// Honeypot: bots fill hidden fields, humans don't
const honeypot = document.createElement('input');
honeypot.type = 'text';
honeypot.name = '_gotcha';
honeypot.style.cssText = 'position:absolute;left:-9999px;opacity:0;height:0;';
honeypot.tabIndex = -1;
honeypot.autocomplete = 'off';
form.appendChild(honeypot);

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Reject if honeypot was filled (bot)
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
    alert('Network error — please try again or email me directly.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Reserve My Spot';
  }
});
