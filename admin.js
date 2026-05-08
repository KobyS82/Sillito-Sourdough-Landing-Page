// ── State ─────────────────────────────────────────────────────────────────────
let password  = '';
let orders    = [];
let customers = [];
let products  = [];
let locations = [];
let slots     = [];
let templates = [];
let modalAction = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loginSection = document.getElementById('login-section');
const dashboard    = document.getElementById('dashboard');
const logoutBtn    = document.getElementById('logout-btn');

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const res  = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
const get   = (path)        => api(path);
const post  = (path, body)  => api(path, { method: 'POST',  body: JSON.stringify(body) });
const patch = (path, body)  => api(path, { method: 'PATCH', body: JSON.stringify(body) });

// ── Login ─────────────────────────────────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', async () => {
  const pw  = document.getElementById('pw-input').value.trim();
  if (!pw) return;
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-err');
  btn.disabled = true; btn.textContent = 'Checking…'; err.style.display = 'none';
  try {
    await post('/api/availability', { password: pw, weeks: [] });
    password = pw;
    loginSection.style.display = 'none';
    dashboard.style.display    = 'block';
    logoutBtn.style.display    = 'inline';
    loadAll();
  } catch {
    err.textContent = 'Wrong password.'; err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Log In';
  }
});
document.getElementById('pw-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('login-btn').click();
});
logoutBtn.addEventListener('click', () => {
  password = ''; orders = []; customers = []; products = []; locations = []; slots = []; templates = [];
  dashboard.style.display    = 'none';
  loginSection.style.display = 'flex';
  document.getElementById('pw-input').value = '';
  logoutBtn.style.display = 'none';
});

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Load all ──────────────────────────────────────────────────────────────────
async function loadAll() {
  await Promise.all([loadProducts(), loadLocations(), loadScheduleData(), loadOrders(), loadCustomers()]);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtSlotDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm   = h >= 12 ? 'PM' : 'AM';
  const h12    = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
}

function getOrderPickupLabel(order) {
  const slot = order.pickup_slots;
  if (slot) {
    const loc  = slot.locations?.name || slot.location_id || '';
    return `${loc} &mdash; ${fmtSlotDate(slot.slot_date)}, ${fmtTime(slot.window_start)}&ndash;${fmtTime(slot.window_end)}`;
  }
  return order.weeks?.label || order.week_id || '&mdash;';
}

function getOrderItemsLabel(order) {
  if (order.order_items?.length) {
    return order.order_items.map(i => `${i.quantity}&times; ${i.products?.name || i.product_id}`).join(', ');
  }
  if (order.loaves) return `${order.loaves} loaf${order.loaves !== 1 ? 'ves' : ''}`;
  return '&mdash;';
}

function statusEl(s) { return `<span class="badge badge-${s}">${s}</span>`; }

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
document.getElementById('refresh-products-btn').addEventListener('click', loadProducts);

async function loadProducts() {
  try {
    products = await get(`/api/products?password=${encodeURIComponent(password)}`);
    renderProducts();
    renderCapacityInputs('new-slot-caps');
    renderCapacityInputs('gen-caps');
  } catch (e) {
    document.getElementById('product-admin-list').innerHTML = `<p class="empty-state">${e.message}</p>`;
  }
}

function renderProducts() {
  const container = document.getElementById('product-admin-list');
  if (!products.length) {
    container.innerHTML = '<p class="empty-state">No products found. Run supabase-schema-v2.sql first.</p>';
    return;
  }
  container.innerHTML = products.map(p => {
    const dealStr = (p.deal_qty && p.deal_price_cents)
      ? `$${(p.deal_price_cents / 100).toFixed(2)} for ${p.deal_qty}`
      : '—';
    const eachStr = p.price_each_cents
      ? `$${(p.price_each_cents / 100).toFixed(2)}`
      : 'TBD';
    return `
    <div class="product-row" id="product-row-${p.id}">
      <div class="product-row-info">
        <div class="product-row-name">${p.name}</div>
        <div class="product-row-meta">${p.description || ''}</div>
      </div>
      <div class="product-row-prices">
        <span class="order-pill"><strong>Each:</strong> ${eachStr}</span>
        <span class="order-pill"><strong>Deal:</strong> ${dealStr}</span>
        <span class="order-pill"><strong>Category:</strong> ${p.category}</span>
      </div>
      <div class="product-row-actions">
        <span class="badge ${p.active ? 'badge-confirmed' : 'badge-cancelled'}">${p.active ? 'Active' : 'Inactive'}</span>
        <button class="btn btn-sm btn-outline" onclick="editProduct('${p.id}')">Edit</button>
        <button class="btn btn-sm ${p.active ? 'btn-danger' : 'btn-green'}" onclick="toggleProduct('${p.id}', ${!p.active})">
          ${p.active ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    </div>`;
  }).join('');
}

function editProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const modal = `
  <div class="modal">
    <h3>Edit: ${p.name}</h3>
    <div class="form-group"><label>Name</label><input type="text" id="ep-name" value="${p.name}" /></div>
    <div class="form-group"><label>Description</label><textarea id="ep-desc" rows="2">${p.description || ''}</textarea></div>
    <div class="form-group"><label>Price each (cents, blank = TBD)</label><input type="number" id="ep-price" value="${p.price_each_cents || ''}" min="0" /></div>
    <div class="form-group"><label>Deal quantity (e.g. 3)</label><input type="number" id="ep-deal-qty" value="${p.deal_qty || ''}" min="0" /></div>
    <div class="form-group"><label>Deal price (cents, e.g. 1000 = $10)</label><input type="number" id="ep-deal-price" value="${p.deal_price_cents || ''}" min="0" /></div>
    <div class="btn-row" style="margin-top:1rem;">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveProduct('${p.id}')">Save</button>
    </div>
    <div id="ep-status" class="status" style="display:none;"></div>
  </div>`;
  showModal(modal);
}

async function saveProduct(id) {
  const updates = {
    name:              document.getElementById('ep-name').value.trim(),
    description:       document.getElementById('ep-desc').value.trim(),
    price_each_cents:  parseInt(document.getElementById('ep-price').value) || null,
    deal_qty:          parseInt(document.getElementById('ep-deal-qty').value) || null,
    deal_price_cents:  parseInt(document.getElementById('ep-deal-price').value) || null,
  };
  try {
    await patch('/api/products', { password, id, ...updates });
    closeModal();
    await loadProducts();
  } catch (e) {
    const s = document.getElementById('ep-status');
    s.textContent = e.message; s.className = 'status err'; s.style.display = 'block';
  }
}

async function toggleProduct(id, active) {
  try {
    await patch('/api/products', { password, id, active });
    await loadProducts();
  } catch (e) { alert(e.message); }
}

// ── LOCATIONS ─────────────────────────────────────────────────────────────────
async function loadLocations() {
  try {
    locations = await get('/api/locations');
    populateLocationSelects();
    renderLocationFilters();
  } catch (e) { console.error('[admin] loadLocations:', e.message); }
}

function populateLocationSelects() {
  ['new-slot-loc', 'tmpl-loc'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">Select location</option>';
    locations.forEach(l => sel.appendChild(new Option(l.name, l.id)));
  });
}

function renderLocationFilters() {
  const sel = document.getElementById('filter-location');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All locations</option>';
  locations.forEach(l => sel.appendChild(new Option(l.name, l.id)));
  if (cur) sel.value = cur;
}

// Render +/- capacity inputs for all products
function renderCapacityInputs(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = products.map(p => `
    <div class="cap-row">
      <span class="cap-product-name">${p.name}</span>
      <input type="number" class="cap-input" data-product="${p.id}" id="${containerId}-${p.id}"
             min="0" placeholder="∞" style="width:70px;" />
    </div>`).join('');
}

function getCapacities(containerId) {
  const caps = [];
  products.forEach(p => {
    const input = document.getElementById(`${containerId}-${p.id}`);
    const val   = input ? parseInt(input.value) : NaN;
    caps.push({ product_id: p.id, total_capacity: isNaN(val) ? null : val });
  });
  return caps;
}

// ── SCHEDULE (slots + templates) ──────────────────────────────────────────────
document.getElementById('refresh-schedule-btn').addEventListener('click', loadScheduleData);

async function loadScheduleData() {
  await Promise.all([loadSlots(), loadTemplates()]);
}

async function loadSlots() {
  try {
    slots = await get(`/api/slots?password=${encodeURIComponent(password)}`);
    renderAdminSlots();
  } catch (e) {
    document.getElementById('slot-admin-list').innerHTML = `<p class="empty-state">${e.message}</p>`;
  }
}

function renderAdminSlots() {
  const list = document.getElementById('slot-admin-list');
  const upcoming = slots.filter(s => s.slot_date >= new Date().toISOString().slice(0, 10));
  if (!upcoming.length) {
    list.innerHTML = '<p class="empty-state">No upcoming slots. Add one below or generate from templates.</p>';
    return;
  }
  list.innerHTML = upcoming.map(slot => {
    const loc  = slot.locations?.name || slot.location_id;
    const caps = (slot.slot_products || []).map(sp => {
      const name = sp.products?.name || sp.product_id;
      const booked = sp.booked;
      const cap    = sp.total_capacity != null ? sp.total_capacity : '∞';
      return `<span class="cap-chip">${name}: ${booked}/${cap}
        <button class="cap-edit-btn" onclick="editSlotCapacity('${slot.id}','${sp.product_id}',${sp.total_capacity != null ? sp.total_capacity : 'null'})" title="Edit capacity">✏</button>
      </span>`;
    }).join('');
    return `
    <div class="slot-admin-row">
      <div class="slot-admin-info">
        <div class="week-label">${loc}<small>${fmtSlotDate(slot.slot_date)}, ${fmtTime(slot.window_start)}–${fmtTime(slot.window_end)}</small></div>
        <div class="cap-chips">${caps || '<span class="cap-chip" style="color:var(--muted)">No products set</span>'}</div>
      </div>
      <button class="remove-btn" onclick="cancelSlot('${slot.id}')" title="Cancel slot">✕</button>
    </div>`;
  }).join('');
}

async function cancelSlot(slotId) {
  if (!confirm('Cancel this slot? Existing orders will not be affected.')) return;
  try {
    await post('/api/slots', { password, action: 'cancelSlot', slot_id: slotId });
    slots = slots.filter(s => s.id !== slotId);
    renderAdminSlots();
  } catch (e) { alert(e.message); }
}

function editSlotCapacity(slotId, productId, currentCap) {
  const p = products.find(x => x.id === productId);
  const modal = `
  <div class="modal">
    <h3>Edit capacity: ${p?.name || productId}</h3>
    <div class="form-group">
      <label>Total capacity (leave blank = unlimited / made to order)</label>
      <input type="number" id="cap-input" value="${currentCap != null ? currentCap : ''}" min="0" />
    </div>
    <div class="btn-row" style="margin-top:1rem;">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveSlotCapacity('${slotId}','${productId}')">Save</button>
    </div>
    <div id="cap-status" class="status" style="display:none;"></div>
  </div>`;
  showModal(modal);
}

async function saveSlotCapacity(slotId, productId) {
  const val = document.getElementById('cap-input').value;
  const cap = val === '' ? null : parseInt(val);
  try {
    await post('/api/slots', { password, action: 'updateCapacity', slot_id: slotId, product_id: productId, total_capacity: cap });
    closeModal();
    await loadSlots();
  } catch (e) {
    const s = document.getElementById('cap-status');
    s.textContent = e.message; s.className = 'status err'; s.style.display = 'block';
  }
}

// Add manual slot
document.getElementById('add-slot-btn').addEventListener('click', async () => {
  const location_id  = document.getElementById('new-slot-loc').value;
  const slot_date    = document.getElementById('new-slot-date').value;
  const window_start = document.getElementById('new-slot-start').value;
  const window_end   = document.getElementById('new-slot-end').value;
  if (!location_id || !slot_date || !window_start || !window_end) {
    alert('Fill in location, date, start time, and end time.'); return;
  }
  const caps   = getCapacities('new-slot-caps');
  const status = document.getElementById('add-slot-status');
  try {
    await post('/api/slots', { password, action: 'createSlot', location_id, slot_date, window_start, window_end, products: caps });
    status.className = 'status ok'; status.textContent = 'Slot added!'; status.style.display = 'block';
    document.getElementById('new-slot-date').value  = '';
    document.getElementById('new-slot-start').value = '';
    document.getElementById('new-slot-end').value   = '';
    await loadSlots();
    setTimeout(() => { status.style.display = 'none'; }, 3000);
  } catch (e) {
    status.className = 'status err'; status.textContent = e.message; status.style.display = 'block';
  }
});

// Templates
async function loadTemplates() {
  try {
    templates = await get(`/api/schedule?password=${encodeURIComponent(password)}`);
    renderTemplates();
  } catch (e) {
    document.getElementById('template-list').innerHTML = `<p class="empty-state">${e.message}</p>`;
  }
}

function renderTemplates() {
  const list = document.getElementById('template-list');
  if (!templates.length) {
    list.innerHTML = '<p class="empty-state">No templates yet. Add one below.</p>';
    return;
  }
  list.innerHTML = templates.map(t => {
    const loc   = t.locations?.name || t.location_id;
    const day   = DAYS[t.day_of_week];
    const valid = [
      t.valid_from  ? `from ${t.valid_from}`  : '',
      t.valid_until ? `until ${t.valid_until}` : '',
    ].filter(Boolean).join(' ') || 'Indefinite';
    return `
    <div class="week-row">
      <div class="week-label">${loc} &mdash; ${day}s<small>${fmtTime(t.window_start)}–${fmtTime(t.window_end)} &bull; ${valid}</small></div>
      <span class="badge ${t.active ? 'badge-confirmed' : 'badge-cancelled'}">${t.active ? 'Active' : 'Paused'}</span>
      <button class="btn btn-sm btn-outline" onclick="toggleTemplate('${t.id}', ${!t.active})">${t.active ? 'Pause' : 'Resume'}</button>
      <button class="remove-btn" onclick="deleteTemplate('${t.id}')" title="Delete">✕</button>
    </div>`;
  }).join('');
}

async function toggleTemplate(id, active) {
  try {
    await post('/api/schedule', { password, action: 'toggleTemplate', template_id: id });
    await loadTemplates();
  } catch (e) { alert(e.message); }
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template? Existing slots are not affected.')) return;
  try {
    await post('/api/schedule', { password, action: 'deleteTemplate', template_id: id });
    templates = templates.filter(t => t.id !== id);
    renderTemplates();
  } catch (e) { alert(e.message); }
}

document.getElementById('add-tmpl-btn').addEventListener('click', async () => {
  const location_id  = document.getElementById('tmpl-loc').value;
  const day_of_week  = document.getElementById('tmpl-dow').value;
  const window_start = document.getElementById('tmpl-start').value;
  const window_end   = document.getElementById('tmpl-end').value;
  const valid_from   = document.getElementById('tmpl-from').value  || null;
  const valid_until  = document.getElementById('tmpl-until').value || null;
  if (!location_id || !window_start || !window_end) {
    alert('Fill in location, start time, and end time.'); return;
  }
  const status = document.getElementById('add-tmpl-status');
  try {
    await post('/api/schedule', { password, action: 'createTemplate', location_id, day_of_week, window_start, window_end, valid_from, valid_until });
    status.className = 'status ok'; status.textContent = 'Template added!'; status.style.display = 'block';
    await loadTemplates();
    setTimeout(() => { status.style.display = 'none'; }, 3000);
  } catch (e) {
    status.className = 'status err'; status.textContent = e.message; status.style.display = 'block';
  }
});

// Generate slots
document.getElementById('generate-btn').addEventListener('click', async () => {
  const from_date = document.getElementById('gen-from').value;
  const to_date   = document.getElementById('gen-to').value;
  if (!from_date || !to_date) { alert('Select a from and to date.'); return; }
  const caps   = getCapacities('gen-caps');
  const btn    = document.getElementById('generate-btn');
  const status = document.getElementById('gen-status');
  btn.disabled = true; btn.textContent = 'Generating…';
  status.style.display = 'none';
  try {
    const result = await post('/api/schedule', { password, action: 'generateSlots', from_date, to_date, default_capacities: caps });
    status.className   = 'status ok';
    status.textContent = `Created ${result.created} slot${result.created !== 1 ? 's' : ''}, skipped ${result.skipped} existing.`;
    status.style.display = 'block';
    await loadSlots();
  } catch (e) {
    status.className = 'status err'; status.textContent = e.message; status.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Generate Slots';
});

// ── ORDERS ────────────────────────────────────────────────────────────────────
document.getElementById('refresh-orders-btn').addEventListener('click', loadOrders);
document.getElementById('filter-location').addEventListener('change', renderOrders);
document.getElementById('filter-status').addEventListener('change', renderOrders);

async function loadOrders() {
  try {
    orders = await get(`/api/orders?password=${encodeURIComponent(password)}`);
    renderOrders();
    renderOrderStats();
  } catch (e) {
    document.getElementById('order-list').innerHTML = `<p class="empty-state">${e.message}</p>`;
  }
}

function filteredOrders() {
  const loc    = document.getElementById('filter-location').value;
  const status = document.getElementById('filter-status').value;
  return orders.filter(o => {
    const matchLoc = !loc || o.pickup_slots?.location_id === loc || (!o.pickup_slots && !loc);
    const matchSt  = !status || o.status === status;
    return matchLoc && matchSt;
  });
}

function renderOrderStats() {
  const stats = [
    { num: orders.filter(o => o.status === 'pending').length,   label: 'Pending' },
    { num: orders.filter(o => o.status === 'confirmed').length, label: 'Confirmed' },
    { num: orders.filter(o => o.status === 'completed').length, label: 'Completed' },
    { num: orders.filter(o => !['cancelled'].includes(o.status)).length, label: 'Active' },
  ];
  document.getElementById('order-stats').innerHTML = stats.map(s =>
    `<div class="stat-card"><div class="stat-num">${s.num}</div><div class="stat-label">${s.label}</div></div>`
  ).join('');
}

function renderOrders() {
  const list = document.getElementById('order-list');
  const fo   = filteredOrders();
  if (!fo.length) {
    list.innerHTML = '<div class="empty-state">No orders match the current filter.</div>'; return;
  }
  list.innerHTML = fo.map(order => {
    const c     = order.customers || {};
    const badge = `badge-${order.status}`;
    const pBadge = `badge-${order.payment_status}`;
    return `
    <div class="order-card" id="order-${order.id}">
      <div class="order-card-top">
        <div>
          <div class="order-name">${c.first_name || ''} ${c.last_name || ''}</div>
          <div class="order-meta">${c.email || ''}${c.phone ? ' &bull; ' + c.phone : ''}</div>
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
          ${statusEl(order.status)}
          ${statusEl(order.payment_status)}
        </div>
      </div>
      <div class="order-detail-row">
        <span class="order-pill"><strong>Items:</strong> ${getOrderItemsLabel(order)}</span>
        <span class="order-pill"><strong>Pickup:</strong> ${getOrderPickupLabel(order)}</span>
        <span class="order-pill"><strong>Ordered:</strong> ${fmtDate(order.created_at)}</span>
        ${c.sms_opt_in ? '<span class="order-pill" style="color:#047857">SMS ✓</span>' : ''}
        ${order.order_items?.some ? '' : ''}
      </div>
      ${order.notes ? `<div class="order-notes">Notes: ${order.notes}</div>` : ''}
      ${order.pickup_details ? `<div class="pickup-info">Pickup: ${order.pickup_details}</div>` : ''}
      <div class="order-actions">
        ${order.status === 'pending' ? `
          <button class="btn btn-sm btn-green" onclick="openModal('${order.id}','confirm')">Confirm + Send Pickup</button>
          <button class="btn btn-sm btn-outline" onclick="openModal('${order.id}','sendPickup')">Send Pickup Info</button>
          <button class="btn btn-sm btn-danger" onclick="doAction('${order.id}','cancel')">Cancel</button>
        ` : ''}
        ${order.status === 'confirmed' ? `
          <button class="btn btn-sm btn-outline" onclick="openModal('${order.id}','sendPickup')">Update Pickup</button>
          <button class="btn btn-sm btn-green" onclick="doAction('${order.id}','complete')">Mark Complete</button>
          <button class="btn btn-sm btn-danger" onclick="doAction('${order.id}','cancel')">Cancel</button>
        ` : ''}
        ${order.payment_status === 'unpaid' && order.status !== 'cancelled' ? `
          <button class="btn btn-sm btn-outline" onclick="markPaid('${order.id}','cash')">Mark Paid (Cash)</button>
          <button class="btn btn-sm btn-outline" onclick="markPaid('${order.id}','venmo')">Mark Paid (Venmo)</button>
        ` : ''}
      </div>
    </div>`;
  }).join('');
}

async function doAction(orderId, action) {
  if (action === 'cancel' && !confirm('Cancel this order? The customer will be notified.')) return;
  try {
    const updated = await post('/api/orders', { adminAction: true, password, action, orderId });
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) Object.assign(orders[idx], updated);
    renderOrders(); renderOrderStats();
  } catch (e) { alert(e.message); }
}

async function markPaid(orderId, method) {
  try {
    const updated = await post('/api/orders', { adminAction: true, password, action: 'markPaid', orderId, payload: { method } });
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) Object.assign(orders[idx], updated);
    renderOrders();
  } catch (e) { alert(e.message); }
}

// ── Modal (dynamic content) ───────────────────────────────────────────────────
const backdrop = document.getElementById('modal-backdrop');

function showModal(innerHtml) {
  backdrop.innerHTML = innerHtml;
  backdrop.style.display = 'flex';
}

function closeModal() {
  backdrop.style.display = 'none';
  modalAction = null;
}

backdrop.addEventListener('click', e => {
  if (e.target === backdrop) closeModal();
});

function openModal(orderId, action) {
  modalAction = { orderId, action };
  const order = orders.find(o => o.id === orderId);
  const title = action === 'confirm' ? 'Confirm Order + Send Pickup Details' : 'Send / Update Pickup Details';
  backdrop.innerHTML = `
  <div class="modal">
    <h3>${title}</h3>
    <div class="form-group">
      <label>Pickup location &amp; time</label>
      <textarea id="modal-pickup" rows="3" placeholder="E.g. Wednesday May 14, 5–7 PM at Rabadi's BJJ. Text if running late!">${order?.pickup_details || ''}</textarea>
    </div>
    <div class="btn-row">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="confirmModal()">Send &amp; Confirm Order</button>
    </div>
  </div>`;
  backdrop.style.display = 'flex';
  document.getElementById('modal-pickup').focus();
}

async function confirmModal() {
  const pickup = document.getElementById('modal-pickup').value.trim();
  if (!pickup) { alert('Please enter pickup details.'); return; }
  const { orderId, action } = modalAction;
  closeModal();
  try {
    const updated = await post('/api/orders', {
      adminAction: true, password, action, orderId, payload: { pickupDetails: pickup },
    });
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) Object.assign(orders[idx], updated);
    renderOrders(); renderOrderStats();
  } catch (e) { alert(e.message); }
}

// ── Export CSV ────────────────────────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', () => {
  const fo   = filteredOrders();
  const rows = [
    ['Name', 'Email', 'Phone', 'Items', 'Pickup', 'Status', 'Payment', 'Notes', 'Ordered'],
    ...fo.map(o => [
      `${o.customers?.first_name || ''} ${o.customers?.last_name || ''}`.trim(),
      o.customers?.email || '',
      o.customers?.phone || '',
      getOrderItemsLabel(o).replace(/&times;/g, 'x').replace(/&mdash;/g, '-'),
      getOrderPickupLabel(o).replace(/&mdash;/g, '-').replace(/&ndash;/g, '-'),
      o.status,
      o.payment_status,
      (o.notes || '').replace(/,/g, ';'),
      fmtDate(o.created_at),
    ]),
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a   = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `sillito-orders-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
});

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
document.getElementById('refresh-customers-btn').addEventListener('click', loadCustomers);

async function loadCustomers() {
  try {
    customers = await get(`/api/customers?password=${encodeURIComponent(password)}`);
    renderCustomers(); renderCustomerStats();
  } catch (e) {
    document.getElementById('customer-tbody').innerHTML =
      `<tr><td colspan="8" class="empty-state">${e.message}</td></tr>`;
  }
}

function renderCustomerStats() {
  const stats = [
    { num: customers.length,                                         label: 'Total customers' },
    { num: customers.filter(c => c.email_opt_in).length,            label: 'Email subscribers' },
    { num: customers.filter(c => c.sms_opt_in && c.phone).length,   label: 'SMS subscribers' },
    { num: customers.filter(c => c.recurring_preferences?.some(r => r.active)).length, label: 'Recurring' },
  ];
  document.getElementById('customer-stats').innerHTML = stats.map(s =>
    `<div class="stat-card"><div class="stat-num">${s.num}</div><div class="stat-label">${s.label}</div></div>`
  ).join('');
}

function renderCustomers() {
  const tbody = document.getElementById('customer-tbody');
  if (!customers.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No customers yet.</td></tr>'; return;
  }
  tbody.innerHTML = customers.map(c => {
    const orderCount = c.orders?.filter(o => o.status !== 'cancelled').length || 0;
    const rec        = c.recurring_preferences?.find(r => r.active);
    return `<tr>
      <td><strong>${c.first_name} ${c.last_name}</strong></td>
      <td class="email-cell">${c.email}</td>
      <td class="email-cell">${c.phone || '—'}</td>
      <td>${orderCount} order${orderCount !== 1 ? 's' : ''}</td>
      <td>${rec ? 'Yes' : '—'}</td>
      <td>${c.email_opt_in ? '✓' : '—'}</td>
      <td>${c.sms_opt_in ? '✓' : '—'}</td>
      <td class="email-cell">${fmtDate(c.created_at)}</td>
    </tr>`;
  }).join('');
}

// ── ANNOUNCE ──────────────────────────────────────────────────────────────────
document.querySelectorAll('input[name="blast-type"]').forEach(r => {
  r.addEventListener('change', () => {
    document.getElementById('subject-group').style.display =
      r.value === 'sms' ? 'none' : 'block';
    document.getElementById('sms-count').style.display =
      (r.value === 'sms' || r.value === 'both') ? 'block' : 'none';
    updateSmsCount();
  });
});
document.getElementById('blast-message').addEventListener('input', updateSmsCount);

function updateSmsCount() {
  const msg  = document.getElementById('blast-message').value;
  const el   = document.getElementById('sms-count');
  const segs = Math.ceil(msg.length / 160) || 1;
  el.textContent = `${msg.length} chars / ~${segs} SMS segment${segs !== 1 ? 's' : ''}`;
}

document.getElementById('preview-btn').addEventListener('click', () => {
  const box = document.getElementById('announce-preview');
  const msg = document.getElementById('blast-message').value.trim();
  const sub = document.getElementById('blast-subject').value.trim();
  box.style.display = 'block';
  box.textContent   = sub ? `Subject: ${sub}\n\n${msg}` : msg;
});

document.getElementById('send-blast-btn').addEventListener('click', async () => {
  const type    = document.querySelector('input[name="blast-type"]:checked').value;
  const subject = document.getElementById('blast-subject').value.trim();
  const message = document.getElementById('blast-message').value.trim();
  const ctaUrl  = document.getElementById('blast-cta').value.trim();
  if (!message) { alert('Message is required.'); return; }
  if ((type === 'email' || type === 'both') && !subject) { alert('Subject is required for email.'); return; }

  const emailCount = customers.filter(c => c.email_opt_in).length;
  const smsCount   = customers.filter(c => c.sms_opt_in && c.phone).length;
  const confirmMsg = type === 'both'
    ? `Send to ${emailCount} email + ${smsCount} SMS subscribers?`
    : type === 'email' ? `Send to ${emailCount} email subscribers?` : `Send SMS to ${smsCount} subscribers?`;
  if (!confirm(confirmMsg)) return;

  const btn    = document.getElementById('send-blast-btn');
  const status = document.getElementById('blast-status');
  btn.disabled = true; btn.textContent = 'Sending…'; status.style.display = 'none';

  try {
    const result = await post('/api/notify', { password, type, subject, message, ctaUrl });
    status.className   = 'status ok';
    status.textContent = `Done! Emails sent: ${result.emailsSent}, SMS sent: ${result.smsSent}`;
    status.style.display = 'block';
  } catch (e) {
    status.className = 'status err'; status.textContent = e.message; status.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Send to all subscribers';
});
