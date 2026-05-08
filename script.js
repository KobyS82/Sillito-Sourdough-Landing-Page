// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  products:   [],   // from /api/products
  locations:  [],   // from /api/locations
  slots:      [],   // from /api/slots?location_id=X
  items:      {},   // { productId: quantity }
  locationId: null,
  slotId:     null,
};

// ── Pricing helpers ───────────────────────────────────────────────────────────
function calcItemTotal(product, qty) {
  if (!qty || !product.price_each_cents) return 0;
  if (!product.deal_qty || !product.deal_price_cents) return qty * product.price_each_cents;
  return Math.floor(qty / product.deal_qty) * product.deal_price_cents +
         (qty % product.deal_qty) * product.price_each_cents;
}

function fmtCents(cents) {
  return '$' + (cents / 100).toFixed(2).replace(/\.00$/, '');
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm   = h >= 12 ? 'PM' : 'AM';
  const h12    = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
}

function fmtDate(iso) {
  // Parse with noon to avoid any timezone offset flipping the day
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// ── Availability bar ──────────────────────────────────────────────────────────
async function loadAvailBar() {
  const bar = document.getElementById('avail-bar');
  try {
    const slots = await fetch('/api/slots').then(r => r.json());
    bar.innerHTML = '';
    const dot = Object.assign(document.createElement('span'), { className: 'avail-dot' });
    bar.appendChild(dot);

    if (!slots.length) {
      dot.style.background  = '#e05252';
      dot.style.animation   = 'none';
      bar.insertAdjacentHTML('beforeend', ' <strong>No pickups scheduled yet</strong> &mdash; check back soon');
      return;
    }
    const next = slots[0];
    const loc  = next.locations?.name || '';
    bar.insertAdjacentHTML('beforeend',
      ` <strong>Next pickup:</strong> ${loc} &bull; ${fmtDate(next.slot_date)},` +
      ` ${fmtTime(next.window_start)}&ndash;${fmtTime(next.window_end)}`);
  } catch {
    bar.innerHTML = '<span class="avail-dot" style="background:#e05252;animation:none;"></span>' +
                    ' <strong>Accepting orders</strong> &mdash; reserve your spot below';
  }
}

// ── Step navigation ───────────────────────────────────────────────────────────
function setStep(n) {
  state.step = n;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.step-dot').forEach(dot => {
    const s = parseInt(dot.dataset.step);
    dot.classList.remove('active', 'done');
    if (s === n)      dot.classList.add('active');
    else if (s < n)   dot.classList.add('done');
  });
  const panelId = n === 5 ? 'step-success' : `step-${n}`;
  document.getElementById(panelId).classList.add('active');
  document.getElementById('steps-indicator').style.display = n === 5 ? 'none' : '';
  window.scrollTo({ top: document.getElementById('order').offsetTop - 16, behavior: 'smooth' });
}

// ── Step 1: Products ──────────────────────────────────────────────────────────
async function loadProducts() {
  try {
    state.products = await fetch('/api/products').then(r => r.json());
    renderProductCards();
  } catch {
    document.getElementById('product-cards').innerHTML =
      '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Unable to load products. Please refresh.</p>';
  }
}

function renderProductCards() {
  const container = document.getElementById('product-cards');
  if (!state.products.length) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center;">No products available right now.</p>';
    return;
  }
  container.innerHTML = state.products.map(p => {
    const qty     = state.items[p.id] || 0;
    const hasQty  = qty > 0;
    const total   = calcItemTotal(p, qty);

    let pricingHtml = '';
    if (p.deal_qty && p.deal_price_cents && p.price_each_cents) {
      pricingHtml = `
        <div class="product-pricing">
          <span class="deal-badge">${fmtCents(p.deal_price_cents)} for ${p.deal_qty}</span>
          <span class="price-each">${fmtCents(p.price_each_cents)} each</span>
        </div>`;
    } else if (p.price_each_cents) {
      pricingHtml = `<div class="product-pricing"><span class="price-each">${fmtCents(p.price_each_cents)} each</span></div>`;
    } else {
      pricingHtml = `<div class="product-pricing"><span class="price-each">Price shared at confirmation</span></div>`;
    }

    return `
    <div class="product-card${hasQty ? ' has-qty' : ''}" data-product="${p.id}">
      <div class="product-icon">${p.category === 'bread' ? '🍞' : '🍪'}</div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.description || ''}</div>
        ${pricingHtml}
      </div>
      <div class="product-qty-wrap">
        <div class="product-qty-control">
          <button class="qty-btn" data-product="${p.id}" data-d="-1" aria-label="Decrease">−</button>
          <div class="qty-center">
            <div class="qty-display">${qty}</div>
            <div class="qty-price">${total > 0 ? fmtCents(total) : '&nbsp;'}</div>
          </div>
          <button class="qty-btn" data-product="${p.id}" data-d="1" aria-label="Increase">+</button>
        </div>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.product;
      state.items[id] = Math.max(0, (state.items[id] || 0) + parseInt(btn.dataset.d));
      renderProductCards();
    });
  });

  document.getElementById('next-1').disabled = !Object.values(state.items).some(q => q > 0);
}

document.getElementById('next-1').addEventListener('click', () => {
  if (!Object.values(state.items).some(q => q > 0)) return;
  setStep(2);
});

// ── Step 2: Locations ─────────────────────────────────────────────────────────
async function loadLocations() {
  try {
    state.locations = await fetch('/api/locations').then(r => r.json());
    renderLocationCards();
  } catch {
    document.getElementById('location-cards').innerHTML =
      '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Unable to load locations. Please refresh.</p>';
  }
}

function renderLocationCards() {
  const container = document.getElementById('location-cards');
  container.innerHTML = state.locations.map(loc => `
    <div class="location-card${state.locationId === loc.id ? ' selected' : ''}"
         data-location="${loc.id}" tabindex="0" role="radio"
         aria-checked="${state.locationId === loc.id}">
      <div class="location-name">${loc.name}</div>
      <div class="location-notes">${loc.notes || loc.address || ''}</div>
    </div>`).join('');

  container.querySelectorAll('.location-card').forEach(card => {
    const pick = () => {
      state.locationId = card.dataset.location;
      state.slotId     = null; // reset slot when location changes
      renderLocationCards();
      document.getElementById('next-2').disabled = false;
    };
    card.addEventListener('click', pick);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  document.getElementById('next-2').disabled = !state.locationId;
}

document.getElementById('back-2').addEventListener('click', () => setStep(1));
document.getElementById('next-2').addEventListener('click', async () => {
  if (!state.locationId) return;
  setStep(3);
  await loadSlots();
});

// ── Step 3: Slots ─────────────────────────────────────────────────────────────
async function loadSlots() {
  const loc = state.locations.find(l => l.id === state.locationId);
  document.getElementById('step3-location-name').textContent =
    loc ? `Showing pickups at ${loc.name}` : '';
  document.getElementById('slot-list').innerHTML =
    '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Loading available dates&hellip;</p>';
  document.getElementById('next-3').disabled = true;

  try {
    const slots = await fetch(`/api/slots?location_id=${encodeURIComponent(state.locationId)}`).then(r => r.json());
    state.slots = slots;
    renderSlots();
  } catch {
    document.getElementById('slot-list').innerHTML =
      '<p style="color:var(--text-muted);padding:1rem;text-align:center;">Unable to load dates. Please try again.</p>';
  }
}

function renderSlots() {
  const container = document.getElementById('slot-list');
  if (!state.slots.length) {
    container.innerHTML =
      '<p style="color:var(--text-muted);padding:1.25rem;text-align:center;">No pickup dates available at this location right now. Try another location or check back soon.</p>';
    return;
  }

  container.innerHTML = state.slots.map(slot => {
    const selected = state.slotId === slot.id;
    const spMap    = Object.fromEntries((slot.slot_products || []).map(sp => [sp.product_id, sp]));

    // Build a capacity warning for selected items
    let capNote = '';
    for (const [pid, qty] of Object.entries(state.items)) {
      if (!qty) continue;
      const sp = spMap[pid];
      if (!sp) { capNote = 'Item not offered at this slot'; break; }
      if (sp.total_capacity !== null) {
        const remaining = sp.total_capacity - sp.booked;
        if (remaining < qty)  { capNote = 'Not enough availability — adjust quantity or pick another date'; break; }
        if (remaining <= 3)   { capNote = `Only ${remaining} left`; break; }
      }
    }

    return `
    <button class="slot-btn${selected ? ' selected' : ''}" data-slot="${slot.id}">
      <div class="slot-date">${fmtDate(slot.slot_date)}</div>
      <div class="slot-time">${fmtTime(slot.window_start)} &ndash; ${fmtTime(slot.window_end)}</div>
      ${capNote ? `<div class="slot-capacity">${capNote}</div>` : ''}
    </button>`;
  }).join('');

  container.querySelectorAll('.slot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.slotId = btn.dataset.slot;
      renderSlots();
      document.getElementById('next-3').disabled = false;
    });
  });
  document.getElementById('next-3').disabled = !state.slotId;
}

document.getElementById('back-3').addEventListener('click', () => setStep(2));
document.getElementById('next-3').addEventListener('click', () => {
  if (!state.slotId) return;
  renderOrderSummary();
  setStep(4);
});

// ── Step 4: Contact ───────────────────────────────────────────────────────────
function renderOrderSummary() {
  const slot  = state.slots.find(s => s.id === state.slotId);
  const loc   = state.locations.find(l => l.id === state.locationId);
  const lines = state.products
    .filter(p => (state.items[p.id] || 0) > 0)
    .map(p => {
      const qty   = state.items[p.id];
      const total = calcItemTotal(p, qty);
      return total > 0 ? `${qty}× ${p.name} — ${fmtCents(total)}` : `${qty}× ${p.name}`;
    });

  const dateStr = slot
    ? `${fmtDate(slot.slot_date)}, ${fmtTime(slot.window_start)}–${fmtTime(slot.window_end)}`
    : '—';

  document.getElementById('order-summary').innerHTML = `
    <div class="summary-row"><strong>Items:</strong> ${lines.join(' &bull; ')}</div>
    <div class="summary-row"><strong>Pickup:</strong> ${loc?.name || '—'}</div>
    <div class="summary-row"><strong>Date:</strong> ${dateStr}</div>`;
}

document.getElementById('back-4').addEventListener('click', () => setStep(3));

// SMS opt-in requires phone
document.getElementById('sms-opt-in').addEventListener('change', function () {
  const phone = document.getElementById('phone');
  phone.required = this.checked;
  if (this.checked && !phone.value) phone.focus();
});

// Honeypot
const hp = Object.assign(document.createElement('input'), {
  type: 'text', name: '_hp', tabIndex: -1, autocomplete: 'off',
});
hp.style.cssText = 'position:absolute;left:-9999px;opacity:0;height:0;';
document.getElementById('order-form').appendChild(hp);

// Submit
document.getElementById('order-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (hp.value) return; // bot

  const btn = document.getElementById('submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Sending…';

  const items = state.products
    .filter(p => (state.items[p.id] || 0) > 0)
    .map(p => ({ product_id: p.id, quantity: state.items[p.id] }));

  const body = {
    slot_id:      state.slotId,
    items,
    first_name:   document.getElementById('first-name').value.trim(),
    last_name:    document.getElementById('last-name').value.trim(),
    email:        document.getElementById('email').value.trim(),
    phone:        document.getElementById('phone').value.trim(),
    notes:        document.getElementById('notes').value.trim(),
    sms_opt_in:   document.getElementById('sms-opt-in').checked,
    email_opt_in: document.getElementById('email-opt-in').checked,
    recurring:    document.getElementById('recurring').checked,
  };

  try {
    const res  = await fetch('/api/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setStep(5);
    } else {
      alert(data.error || 'Something went wrong. Please try again.');
      btn.disabled    = false;
      btn.textContent = 'Place My Order';
    }
  } catch {
    alert('Network error — please try again.');
    btn.disabled    = false;
    btn.textContent = 'Place My Order';
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadAvailBar();
loadProducts();
loadLocations();
