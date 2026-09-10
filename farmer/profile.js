/* KrushiDarpan - Profile Logic */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = JSON.parse(localStorage.getItem('krushi_user') || '{}');
    document.getElementById('profileName').textContent = user.name || 'Farmer';
    document.getElementById('profileMobile').textContent = user.mobile || 'Mobile number not available';
    document.getElementById('profileId').textContent = user.farmerId || 'Not available';
    document.getElementById('profileVillage').textContent = user.village || 'Not available';
    document.getElementById('profileLoginStatus').textContent = user.farmerId ? 'Active' : 'Not signed in';
    document.getElementById('profileLastLogin').textContent = formatSessionTime(user.lastLoginAt);
    await loadPaymentProfile(user);
  } catch (error) {}

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      window.KrushiAPI.logout();
    });
  }

  const form = document.getElementById('paymentProfileForm');
  if (form) form.addEventListener('submit', savePaymentProfile);
});

async function loadPaymentProfile(user) {
  const profile = await window.KrushiAPI.getPaymentProfile();
  document.getElementById('paymentAccountHolder').value = profile.accountHolder || user.name || '';
  document.getElementById('paymentBankName').value = profile.bankName || '';
  document.getElementById('paymentAccountNumber').value = profile.accountNumber || '';
  document.getElementById('paymentIfsc').value = profile.ifscCode || '';
  document.getElementById('paymentUpi').value = profile.upiId || '';
}

async function savePaymentProfile(event) {
  event.preventDefault();

  const payload = {
    accountHolder: document.getElementById('paymentAccountHolder').value.trim(),
    bankName: document.getElementById('paymentBankName').value.trim(),
    accountNumber: document.getElementById('paymentAccountNumber').value.trim(),
    ifscCode: document.getElementById('paymentIfsc').value.trim().toUpperCase(),
    upiId: document.getElementById('paymentUpi').value.trim(),
  };

  if (!payload.accountHolder || !payload.bankName || !payload.accountNumber || !payload.ifscCode) {
    setPaymentStatus('Please fill account holder, bank, account number, and IFSC.');
    return;
  }

  const button = document.getElementById('savePaymentProfileBtn');
  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    const saved = await window.KrushiAPI.savePaymentProfile(payload);
    setPaymentStatus(saved.source === 'supabase' ? 'Payment details saved to Supabase.' : 'Payment details saved on this device.');
  } catch (error) {
    setPaymentStatus(error.message || 'Unable to save payment details.');
  } finally {
    button.disabled = false;
    button.textContent = 'Save Payment Details';
  }
}

function setPaymentStatus(message) {
  const status = document.getElementById('paymentProfileStatus');
  if (status) status.textContent = message;
}

function formatSessionTime(value) {
  if (!value) return 'Not available';
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return 'Not available';
  }
}
