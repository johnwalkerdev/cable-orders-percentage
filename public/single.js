const statusConfig = [
  { max: 30, text: '✅ OK', className: 'green' },
  { max: 35, text: '⚠️ Ajustar', className: 'yellow' },
  { max: Infinity, text: '🔴 Acima', className: 'red' },
];

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const loginTitle = document.getElementById('loginTitle');
const onInput = document.getElementById('onInput');
const offInput = document.getElementById('offInput');
const totalValue = document.getElementById('totalValue');
const percentValue = document.getElementById('percentValue');
const faltamValue = document.getElementById('faltamValue');
const statusValue = document.getElementById('statusValue');
const updatedAtValue = document.getElementById('updatedAtValue');

const params = new URLSearchParams(window.location.search);
const loginId = params.get('id');

if (!loginId) {
  showToast('Login não informado.');
  throw new Error('Login ID ausente na URL.');
}

function showToast(message, duration = 2500) {
  toastMessage.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function calculateStats(on, off) {
  const total = on + off;
  const percOff = total ? (off / total) * 100 : 0;
  const neededTotal = off / 0.3;
  const neededOn = neededTotal - off;
  const faltamOn = Math.max(0, Math.ceil(neededOn - on));
  const { text, className } = statusConfig.find((cfg) => percOff <= cfg.max);
  return { total, percOff, faltamOn, text, className };
}

function applyStats(on, off) {
  const { total, percOff, faltamOn, text, className } = calculateStats(on, off);
  totalValue.textContent = total;
  percentValue.textContent = `${percOff.toFixed(1)}%`;
  faltamValue.textContent = faltamOn;
  statusValue.textContent = text;
  statusValue.className = `metric-value status ${className}`;
}

async function loadLogin() {
  try {
    const response = await fetch(`/api/logins/${loginId}`);
    if (!response.ok) {
      throw new Error('Não foi possível carregar o login.');
    }
    const data = await response.json();
    loginTitle.textContent = `Painel Individual — ${data.login}`;
    onInput.value = data.onTurf;
    offInput.value = data.offTurf;
    applyStats(data.onTurf, data.offTurf);
    if (data.updatedAt) {
      updatedAtValue.textContent = new Date(data.updatedAt).toLocaleString('pt-BR');
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Erro inesperado.');
  }
}

let saveTimeout;

function queueSave() {
  const onValue = Number(onInput.value) || 0;
  const offValue = Number(offInput.value) || 0;
  applyStats(onValue, offValue);

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    try {
      const response = await fetch(`/api/logins/${loginId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onTurf: onValue, offTurf: offValue }),
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar dados.');
      }
      const updated = await response.json();
      if (updated.updatedAt) {
        updatedAtValue.textContent = new Date(updated.updatedAt).toLocaleString('pt-BR');
      } else {
        updatedAtValue.textContent = new Date().toLocaleString('pt-BR');
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Erro inesperado.');
    } finally {
      saveTimeout = undefined;
    }
  }, 600);
}

onInput.addEventListener('input', queueSave);
offInput.addEventListener('input', queueSave);

loadLogin();

