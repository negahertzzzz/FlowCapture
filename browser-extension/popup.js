const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const recordingBadge = document.getElementById('recording-badge');
const refreshBtn = document.getElementById('refresh-btn');

async function checkStatus() {
  statusText.textContent = 'Connessione in corso...';
  try {
    const res = await fetch('http://127.0.0.1:41789/health', { method: 'GET' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    statusDot.className = 'dot connected';
    statusText.textContent = 'Connesso a FlowCapture';

    if (data.recording) {
      recordingBadge.classList.remove('hidden');
    } else {
      recordingBadge.classList.add('hidden');
    }
  } catch (err) {
    statusDot.className = 'dot disconnected';
    statusText.textContent = 'Non connesso';
    recordingBadge.classList.add('hidden');
  }
}

refreshBtn.addEventListener('click', checkStatus);
checkStatus();
