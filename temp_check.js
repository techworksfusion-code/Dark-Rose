
let allBookings = [];
let deleteTargetId = null;
let designs = [];

async function checkBillingSummary() {
  try {
    const res = await fetch('/api/billing-summary', { credentials: 'include' });
    if (res.ok) {
      const billing = await res.json();
      showBillingBanner(billing);
    }
  } catch (err) {
    console.error('Failed to check billing summary:', err);
  }
}

function showBillingBanner(billing) {
  const bannerEl = document.getElementById('billingBanner');
  const fusionWA = billing.fusionWA || 'wa.me/91XXXXXXXXXX';
  let html = '';
  
  if (billing.totalDue >= 50) {
    html = `<div class="billing-banner critical">
      <div class="billing-banner-text">
        💰 <strong>Extra charges this month: ₹${billing.totalDue}</strong>. Upgrade to Business plan at ₹999/month and save money!
      </div>
      <a href="${fusionWA}" target="_blank" class="upgrade-btn">Upgrade Now →</a>
    </div>`;
  } else if (billing.freeRemaining === 0) {
    html = `<div class="billing-banner danger">
      <div class="billing-banner-text">
        🔥 <strong>Daily limit reached.</strong> Extra messages are being charged at ₹5 each. Total due: ₹${billing.totalDue}
      </div>
      <a href="${fusionWA}" target="_blank" class="upgrade-btn">Upgrade Now →</a>
    </div>`;
  } else if (billing.freeRemaining <= 3) {
    html = `<div class="billing-banner warning">
      <div class="billing-banner-text">
        ⚠️ <span id="notifRemaining">${billing.freeRemaining}</span> free notifications remaining today. Upgrade to avoid extra charges.
      </div>
      <a href="${fusionWA}" target="_blank" class="upgrade-btn">Upgrade Now →</a>
    </div>`;
  }
  
  bannerEl.innerHTML = html;
}

// Update notification remaining count without page reload
function updateNotificationCount(count) {
  const el = document.getElementById('notifRemaining');
  if (el) {
    el.textContent = count;
    el.classList.add('notif-remaining');
  }
}

async function loadData() {
const bookingsBody = document.getElementById('bookingsBody');
const contactsBody = document.getElementById('contactsBody');
const errorMsg = document.getElementById('errorMsg');

try {
const [bookingsRes, contactsRes, designsRes] = await Promise.all([
fetch('/api/bookings', { credentials: 'include' }),
fetch('/api/contacts', { credentials: 'include' }),
fetch('/api/designs')
]);

if(!bookingsRes.ok) throw new Error('Failed to load bookings');
if(!contactsRes.ok) throw new Error('Failed to load contacts');

allBookings = await bookingsRes.json();
const contacts = await contactsRes.json();
designs = await designsRes.json();

// Update stats
document.getElementById('totalBookings').textContent = allBookings.length;

// Get billing summary for total contacted count
try {
  const billingRes = await fetch('/api/billing-summary', { credentials: 'include' });
  if (billingRes.ok) {
    const billing = await billingRes.json();
    document.getElementById('totalContacts').textContent = billing.totalContacted || 0;
  }
} catch (err) {
  document.getElementById('totalContacts').textContent = 0;
}

// Render bookings table
renderBookings(allBookings);

// Render contacts table
if(contacts.length === 0) {
contactsBody.innerHTML = '<tr><td colspan="6" class="empty">No contacts yet</td></tr>';
} else {
contactsBody.innerHTML = contacts.map((c, i) => `
<tr>
<td>${i + 1}</td>
<td>${escapeHtml(c.name)}</td>
<td>${escapeHtml(c.email)}</td>
<td>${escapeHtml(c.subject)}</td>
<td>${escapeHtml(c.message.substring(0, 80))}${c.message.length>80?'...':''}</td>
<td><span class="timestamp">${new Date(c.timestamp).toLocaleString()}</span></td>
</tr>
`).join('');
}

errorMsg.style.display = 'none';
} catch(error) {
console.error('Error loading data:', error);
errorMsg.textContent = 'Error loading data: ' + error.message;
errorMsg.style.display = 'block';
bookingsBody.innerHTML = '<tr><td colspan="10" class="empty">Failed to load</td></tr>';
contactsBody.innerHTML = '<tr><td colspan="6" class="empty">Failed to load</td></tr>';
}
}

function renderBookings(bookings) {
const bookingsBody = document.getElementById('bookingsBody');

if(bookings.length === 0) {
bookingsBody.innerHTML = '<tr><td colspan="10" class="empty">No bookings yet</td></tr>';
} else {
bookingsBody.innerHTML = bookings.map((b, i) => `
<tr>
<td>${i + 1}</td>
<td>${escapeHtml(b.name)}</td>
<td>${escapeHtml(b.phone)}</td>
<td>${escapeHtml(b.design)}</td>
<td>${escapeHtml(b.budget || '-')}</td>
<td>${escapeHtml(b.placement || '-')}</td>
<td><span class="status-badge status-${b.status || 'pending'}">${b.status || 'pending'}</span></td>
<td>${b.visitDate ? escapeHtml(b.visitDate) + ' ' + escapeHtml(b.visitTime || '') : '-'}</td>
<td>
<button class="btn btn-view" onclick="viewBooking('${b.id}')">View</button>
${(b.status === 'pending') ? '<button class="btn btn-edit" onclick="openConfirmModal(\'' + b.id + '\')">Confirm</button>' : ''}
<button class="btn btn-edit" onclick="openEditModal('${b.id}')">Edit</button>
<button class="btn btn-delete" onclick="openDeleteModal('${b.id}')">Delete</button>
</td>
<td><span class="timestamp">${new Date(b.timestamp).toLocaleString()}</span></td>
</tr>
`).join('');
}

function filterBookings() {
const filter = document.getElementById('statusFilter').value;
if(filter === 'all') {
renderBookings(allBookings);
} else {
const filtered = allBookings.filter(b => b.status === filter);
renderBookings(filtered);
}
}

function escapeHtml(text) {
if(!text) return '-';
const div = document.createElement('div');
div.textContent = text;
return div.innerHTML;
}

// CRUD Operations
let currentBooking = null;

async function openEditModal(id) {
currentBooking = allBookings.find(b => b.id === id);
if(!currentBooking) {
showError('Booking not found in local data');
return;
}

// Ensure designs are loaded
if(designs.length === 0) {
try {
const res = await fetch('/api/designs', { credentials: 'include' });
if(!res.ok) throw new Error('Failed to fetch designs');
designs = await res.json();
} catch(err) {
showError('Failed to load designs: ' + err.message);
return;
}
}

populateEditModal(currentBooking);
document.getElementById('editModal').classList.add('active');
}

function populateEditModal(booking) {
document.getElementById('editId').value = booking.id;
document.getElementById('editName').value = booking.name || '';
document.getElementById('editPhone').value = booking.phone || '';

// Populate design dropdown
const designSelect = document.getElementById('editDesign');
designSelect.innerHTML = '';
const defaultOption = document.createElement('option');
defaultOption.value = '';
defaultOption.textContent = 'Select Design';
designSelect.appendChild(defaultOption);

designs.forEach(d => {
const opt = document.createElement('option');
opt.value = d.name;
opt.textContent = d.name;
if (d.name === booking.design) opt.selected = true;
designSelect.appendChild(opt);
});

document.getElementById('editBudget').value = booking.budget || '';
document.getElementById('editPlacement').value = booking.placement || '';
document.getElementById('editStatus').value = booking.status || 'pending';
document.getElementById('editNotes').value = booking.notes || '';
}

function closeEditModal() {
document.getElementById('editModal').classList.remove('active');
currentBooking = null;
}

function openDeleteModalFromEdit() {
const id = document.getElementById('editId').value;
if(id) {
openDeleteModal(id);
closeEditModal();
}
}

async function saveBooking(e) {
e.preventDefault();

const id = document.getElementById('editId').value;
const updatedData = {
name: document.getElementById('editName').value,
phone: document.getElementById('editPhone').value,
design: document.getElementById('editDesign').value,
budget: document.getElementById('editBudget').value,
placement: document.getElementById('editPlacement').value,
status: document.getElementById('editStatus').value,
notes: document.getElementById('editNotes').value
};

try {
console.log('[FRONTEND] Sending update for booking ID:', id, updatedData);
  const res = await fetch(`/api/bookings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedData),
    credentials: 'include'
  });

const result = await res.json();
console.log('[FRONTEND] Update response:', res.status, result);

if(!res.ok) {
  if (result.error === 'LIMIT_REACHED') {
    showError('⚠️ Daily notification limit reached! Upgrade to Premium to continue. Contact: wa.me/91XXXXXXXXXX');
    return;
  }
  throw new Error(result.error || result.details || 'Failed to update');
}

showSuccess('Booking updated successfully!');
closeEditModal();
if (result.reloadPage) {
  showError('⚠️ Daily limit reached! Reloading...');
  setTimeout(() => location.reload(), 1500);
} else {
  loadData();
  // Update notification count in real-time
  if (result.freeRemaining !== undefined) {
    updateNotificationCount(result.freeRemaining);
  }
}
} catch(error) {
console.error('[FRONTEND] Update error:', error);
showError('Failed to update booking: ' + error.message);
}

function openDeleteModal(id) {
deleteTargetId = id;
const booking = allBookings.find(b => b.id === id);
document.getElementById('deleteTargetName').textContent = booking ? `${booking.name} - ${booking.design}` : '';
document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
document.getElementById('deleteModal').classList.remove('active');
deleteTargetId = null;
}

let confirmTargetId = null;

function openConfirmModal(id) {
confirmTargetId = id;
const booking = allBookings.find(b => b.id === id);
if (!booking) {
showError('Booking not found');
return;
}
document.getElementById('confirmId').value = id;
document.getElementById('confirmCustomerName').textContent = booking.name || '-';
document.getElementById('confirmDesign').textContent = booking.design || '-';
document.getElementById('confirmPhone').textContent = booking.phone || '-';

const now = new Date();
const today = now.toISOString().split('T')[0];
const currentTime = now.toTimeString().slice(0, 5);
document.getElementById('confirmDate').value = today;
document.getElementById('confirmTime').value = currentTime;

document.getElementById('confirmModal').classList.add('active');
}

function closeConfirmModal() {
document.getElementById('confirmModal').classList.remove('active');
confirmTargetId = null;
}

async function sendConfirmation(e) {
e.preventDefault();

const id = document.getElementById('confirmId').value;
const visitDate = document.getElementById('confirmDate').value;
const visitTime = document.getElementById('confirmTime').value;

if (!id || !visitDate || !visitTime) {
showError('Please select both date and time');
return;
}

const updatedData = {
status: 'confirmed',
visitDate: visitDate,
visitTime: visitTime
};

try {
console.log('[FRONTEND] Sending confirmation for booking ID:', id, updatedData);
const res = await fetch(`/api/bookings/${id}`, {
method: 'PUT',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(updatedData),
credentials: 'include'
});

const result = await res.json();
console.log('[FRONTEND] Confirmation response:', res.status, result);

if (!res.ok) {
if (result.error === 'LIMIT_REACHED') {
showError('⚠️ Daily notification limit reached! Upgrade to Premium to continue. Contact: wa.me/91XXXXXXXXXX');
return;
}
throw new Error(result.error || result.details || 'Failed to confirm');
}

showSuccess('Booking confirmed and notification sent!');
closeConfirmModal();
if (result.reloadPage) {
showError('⚠️ Daily limit reached! Reloading...');
setTimeout(() => location.reload(), 1500);
} else {
loadData();
if (result.freeRemaining !== undefined) {
updateNotificationCount(result.freeRemaining);
}
}
} catch(error) {
console.error('[FRONTEND] Confirmation error:', error);
showError('Failed to confirm booking: ' + error.message);
}
}

async function deleteBooking() {
if(!deleteTargetId) return;

try {
console.log('[FRONTEND] Deleting booking ID:', deleteTargetId);
const res = await fetch(`/api/bookings/${deleteTargetId}`, {
  method: 'DELETE',
  credentials: 'include'
});

const result = await res.json();
console.log('[FRONTEND] Delete response:', res.status, result);

if(!res.ok) {
  if (result.error === 'LIMIT_REACHED') {
    showError('⚠️ Daily notification limit reached! Upgrade to Premium to continue. Contact: wa.me/91XXXXXXXXXX');
    return;
  }
  throw new Error(result.error || result.details || 'Failed to delete');
}

showSuccess('Booking deleted successfully!');
closeDeleteModal();
loadData();
} catch(error) {
console.error('[FRONTEND] Delete error:', error);
showError('Failed to delete booking: ' + error.message);
}
}

function showSuccess(msg) {
const el = document.getElementById('successMsg');
el.textContent = msg;
el.style.display = 'block';
setTimeout(() => el.style.display = 'none', 3000);
}

function showError(msg) {
const el = document.getElementById('errorMsg');
el.textContent = msg;
el.style.display = 'block';
setTimeout(() => el.style.display = 'none', 5000);
}

function viewBooking(id) {
const booking = allBookings.find(b => b.id === id);
if(booking) {
alert(`Booking Details:\n\nName: ${booking.name}\nPhone: ${booking.phone}\nDesign: ${booking.design}\nBudget: ${booking.budget || 'Not set'}\nPlacement: ${booking.placement || 'Not set'}\nStatus: ${booking.status || 'pending'}\nNotes: ${booking.notes || 'None'}\n\nSubmitted: ${new Date(booking.timestamp).toLocaleString()}`);
}
}

// Event listeners
document.getElementById('editForm').addEventListener('submit', saveBooking);
document.getElementById('confirmForm').addEventListener('submit', sendConfirmation);

// Close modals on backdrop click
document.getElementById('editModal').addEventListener('click', (e) => {
if(e.target === document.getElementById('editModal')) closeEditModal();
});
document.getElementById('deleteModal').addEventListener('click', (e) => {
if(e.target === document.getElementById('deleteModal')) closeDeleteModal();
});
document.getElementById('confirmModal').addEventListener('click', (e) => {
if(e.target === document.getElementById('confirmModal')) closeConfirmModal();
});

// Login handling
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('loginError');
  
  console.log('[LOGIN] Attempting login with username:', username);
  
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include'
    });
    
    console.log('[LOGIN] Response status:', res.status, 'ok:', res.ok);
    
    if (res.ok) {
      // Wait a moment for cookie to be set
      await new Promise(r => setTimeout(r, 100));
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainContent').style.display = 'block';
      loadData();
      checkBillingSummary();
    } else {
      const data = await res.json();
      console.log('[LOGIN] Error response:', data);
      errorEl.textContent = data.error || 'Invalid username or password';
    }
  } catch (err) {
    console.error('[LOGIN] Exception:', err);
    errorEl.textContent = 'Connection error. Try again.';
  }
});

// Check if already logged in
async function checkAuth() {
  try {
    const res = await fetch('/api/bookings', { credentials: 'include' });
    if (res.ok) {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainContent').style.display = 'block';
      loadData();
      checkBillingSummary();
    } else if (res.status === 401) {
      // Not logged in - show login screen (default state is already shown)
    }
  } catch (err) {
    // Network error - show login screen
  }
}

checkAuth();

// Auto-refresh every 30 seconds
setInterval(() => {
  loadData();
  checkBillingSummary();
}, 30000);

// Logout function
async function logout() {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  location.reload();
}

// Debug: Test API connection
async function testAPI() {
try {
const res = await fetch('/api/bookings');
console.log('API Test - Status:', res.status);
const data = await res.json();
console.log('API Test - Bookings count:', data.length);
console.log('API Test - First booking:', data[0]);
} catch(err) {
console.error('API Test - Failed:', err);
}
}
// Uncomment to test: testAPI();
