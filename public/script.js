const API_URL = '/api/logins';
const tableBody = document.querySelector('#turfTable tbody');
const rowTemplate = document.getElementById('rowTemplate');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

const saveTasks = new Map();

const statusConfig = [
  { max: 30, text: '✅ OK', className: 'green' },
  { max: 35, text: '⚠️ Ajustar', className: 'yellow' },
  { max: Infinity, text: '🔴 Acima', className: 'red' },
];

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

  return {
    total,
    percOff,
    faltamOn,
    statusText: text,
    statusClass: className,
  };
}

function updateTotals() {
  let totalOn = 0;
  let totalOff = 0;

  tableBody.querySelectorAll('tr').forEach((row) => {
    const on = Number(row.querySelector('.on-input').value) || 0;
    const off = Number(row.querySelector('.off-input').value) || 0;
    totalOn += on;
    totalOff += off;
  });

  const totalAll = totalOn + totalOff;
  const percOffTotal = totalAll ? (totalOff / totalAll) * 100 : 0;
  const neededTotal = totalOff / 0.3;
  const neededOn = neededTotal - totalOff;
  const faltamTotal = Math.max(0, Math.ceil(neededOn - totalOn));
  const { text, className } = statusConfig.find((cfg) => percOffTotal <= cfg.max);

  document.getElementById('totalOn').textContent = totalOn;
  document.getElementById('totalOff').textContent = totalOff;
  document.getElementById('totalAll').textContent = totalAll;
  document.getElementById('percentOff').textContent = `${percOffTotal.toFixed(1)}%`;
  document.getElementById('faltamTotal').textContent = faltamTotal;

  const statusTotal = document.getElementById('statusTotal');
  statusTotal.textContent = text;
  statusTotal.className = className;
}

function renderRow(data) {
  const { id, login, onTurf, offTurf, updatedAt } = data;
  const clone = rowTemplate.content.firstElementChild.cloneNode(true);
  const onInput = clone.querySelector('.on-input');
  const offInput = clone.querySelector('.off-input');
  const totalCell = clone.querySelector('.total-cell');
  const percCell = clone.querySelector('.perc-cell');
  const faltamCell = clone.querySelector('.faltam-cell');
  const statusCell = clone.querySelector('.status-cell');
  const loginCell = clone.querySelector('.login-name');

  clone.dataset.id = id;
  loginCell.innerHTML = `<a class="login-link" href="login.html?id=${id}">${login}</a>`;
  if (updatedAt) {
    loginCell.title = `Atualizado em ${new Date(updatedAt).toLocaleString('pt-BR')}`;
  }
  onInput.value = onTurf;
  offInput.value = offTurf;

  const applyStats = () => {
    const on = Number(onInput.value) || 0;
    const off = Number(offInput.value) || 0;
    const { total, percOff, faltamOn, statusText, statusClass } = calculateStats(on, off);
    totalCell.textContent = total;
    percCell.textContent = `${percOff.toFixed(1)}%`;
    faltamCell.textContent = faltamOn;
    statusCell.textContent = statusText;
    clone.className = statusClass;
    updateTotals();
  };

  applyStats();

  const queueSave = () => {
    const on = Number(onInput.value) || 0;
    const off = Number(offInput.value) || 0;
    const payload = { onTurf: on, offTurf: off };

    if (saveTasks.has(id)) {
      clearTimeout(saveTasks.get(id));
    }

    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`${API_URL}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error('Erro ao salvar.');
        }

        const updated = await response.json();
        if (updated.updatedAt) {
          loginCell.title = `Atualizado em ${new Date(updated.updatedAt).toLocaleString('pt-BR')}`;
        }
      } catch (error) {
        console.error('Erro ao salvar dados', error);
        showToast('Erro ao salvar. Tente novamente.');
      } finally {
        saveTasks.delete(id);
      }
    }, 600);

    saveTasks.set(id, timeout);
  };

  onInput.addEventListener('input', () => {
    applyStats();
    queueSave();
  });

  offInput.addEventListener('input', () => {
    applyStats();
    queueSave();
  });

  tableBody.appendChild(clone);
}

async function loadData() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error('Não foi possível carregar os dados.');
    }
    const data = await response.json();
    data.forEach(renderRow);
    updateTotals();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Erro inesperado.');
  }
}

loadData();

