// --- INITIALISATION SÉCURISÉE DES DONNÉES ---
let bets = [];
let leagues = [
    "FC24 Angleterre", "FC25 Angleterre", "FC25 Italie", "FC25 Allemagne", "FC26 Champions League", "FC26 Championnat du Monde"
];
let settings = {
    currency: "FCFA",
    initialBalance: 20000,
    thresholdMinBets: 5,
    thresholdWinrateHigh: 65,
    thresholdWinrateMid: 50
};

try {
    if (localStorage.getItem('fc_bets')) bets = JSON.parse(localStorage.getItem('fc_bets'));
    if (localStorage.getItem('fc_leagues')) leagues = JSON.parse(localStorage.getItem('fc_leagues'));
    if (localStorage.getItem('fc_settings')) settings = JSON.parse(localStorage.getItem('fc_settings'));
} catch (e) {
    console.warn("Stockage inaccessible, exécution en mode session temporaire.", e);
}

let chartInstance = null;

// --- DÉMARRAGE ---
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    populateLeagueSelects();
    renderLeaguesSettings();
    renderDashboard();
    renderHistory();
    loadSettingsInputs();

    document.getElementById('bet-form').addEventListener('submit', handleBetSubmit);
    document.getElementById('btn-cancel-edit').addEventListener('click', resetBetForm);
    document.getElementById('btn-add-league').addEventListener('click', handleAddLeague);
    document.getElementById('save-general-settings').addEventListener('click', saveGeneralSettings);
    document.getElementById('save-thresholds').addEventListener('click', saveThresholdSettings);

    document.getElementById('filter-search').addEventListener('input', renderHistory);
    document.getElementById('filter-league').addEventListener('change', renderHistory);
    document.getElementById('filter-option').addEventListener('change', renderHistory);
    document.getElementById('filter-date').addEventListener('change', renderHistory);
});

// --- NAVIGATION RESPONSIVE ---
function initNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('data-target');
            if (!targetId) return;

            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(targetId);
            if (targetSection) targetSection.classList.add('active');

            if (targetId === 'dashboard') renderDashboard();
            if (targetId === 'history') renderHistory();
        });
    });
}

function populateLeagueSelects() {
    const bSelect = document.getElementById('bet-league');
    const fSelect = document.getElementById('filter-league');
    let html = leagues.map(l => `<option value="${l}">${l}</option>`).join('');
    bSelect.innerHTML = html;
    fSelect.innerHTML = '<option value="">Tous les championnats</option>' + html;
}

function saveData(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
}

// --- LOGIQUE CALCULS ET DASHBOARD ---
function calculateStats(betsArray) {
    let totalBets = betsArray.length;
    let wonBets = betsArray.filter(b => b.result === 'won').length;
    let lostBets = betsArray.filter(b => b.result === 'lost').length;
    let totalStakes = 0, totalPayout = 0;

    betsArray.forEach(b => {
        let stake = parseFloat(b.stake) || 0;
        totalStakes += stake;
        if (b.result === 'won') totalPayout += (stake * (parseFloat(b.odds) || 0));
    });

    let profit = totalPayout - totalStakes;
    return {
        totalBets, wonBets, lostBets, profit,
        winRate: totalBets > 0 ? (wonBets / totalBets) * 100 : 0,
        roi: totalStakes > 0 ? (profit / totalStakes) * 100 : 0
    };
}

function renderDashboard() {
    const stats = calculateStats(bets);
    const initialBalance = parseFloat(settings.initialBalance) || 0;
    const currentBalance = initialBalance + stats.profit;

    document.getElementById('stat-total-bets').innerText = stats.totalBets;
    document.getElementById('stat-win-loss').innerHTML = `<span class="text-success">${stats.wonBets}</span> / <span class="text-danger">${stats.lostBets}</span>`;
    document.getElementById('stat-win-rate').innerText = `${stats.winRate.toFixed(1)}%`;
    
    const pEl = document.getElementById('stat-profit');
    pEl.innerText = `${stats.profit > 0 ? '+' : ''}${stats.profit.toFixed(0)} ${settings.currency}`;
    pEl.className = stats.profit > 0 ? 'text-success' : (stats.profit < 0 ? 'text-danger' : 'neutral');
    
    const cbEl = document.getElementById('stat-current-balance');
    if (cbEl) {
        cbEl.innerText = `${currentBalance.toFixed(0)} ${settings.currency}`;
    }

    const roiEl = document.getElementById('stat-roi');
    roiEl.innerText = `${stats.roi.toFixed(1)}%`;
    roiEl.className = stats.roi > 0 ? 'text-success' : (stats.roi < 0 ? 'text-danger' : '');

    document.querySelectorAll('.currency-label').forEach(el => el.innerText = settings.currency);
    renderAnalysisTable();
    renderEvolutionChart();
}

function renderEvolutionChart() {
    const canvas = document.getElementById('evolutionChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const initialBalance = parseFloat(settings.initialBalance) || 0;
    let balance = initialBalance; 
    let labels = ['Départ'], data = [initialBalance];

    let sorted = [...bets].sort((a, b) => new Date(a.date) - new Date(b.date));

    sorted.forEach((b, i) => {
        balance += b.result === 'won' ? (b.stake * b.odds) - b.stake : -b.stake;
        labels.push(`Pari ${i+1}`);
        data.push(balance);
    });

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{ 
                label: 'Solde Capital',
                data: data, 
                borderColor: '#3b82f6', 
                backgroundColor: 'rgba(59, 130, 246, 0.05)', 
                fill: true, 
                tension: 0.1 
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderAnalysisTable() {
    const tbody = document.getElementById('analysis-tbody');
    tbody.innerHTML = '';
    let groups = {};

    bets.forEach(b => {
        let k = `${b.league} || ${b.option}`;
        if (!groups[k]) groups[k] = [];
        groups[k].push(b);
    });

    for (let k in groups) {
        const [lg, op] = k.split(' || ');
        const stats = calculateStats(groups[k]);
        let badge = '';

        if (stats.totalBets < settings.thresholdMinBets) {
            badge = `<span class="badge" style="color: var(--text-muted)">Analyse...</span>`;
        } else if (stats.winRate >= settings.thresholdWinrateHigh) {
            badge = `<span class="badge badge-success">🟢 Faille détectée</span>`;
        } else if (stats.winRate >= settings.thresholdWinrateMid) {
            badge = `<span class="badge badge-warning">🟡 À surveiller</span>`;
        } else {
            badge = `<span class="badge badge-danger">🔴 À éviter</span>`;
        }

        tbody.innerHTML += `
            <tr>
                <td data-label="Championnat">${lg}</td><td data-label="Option">${op}</td>
                <td data-label="Paris">${stats.totalBets}</td>
                <td data-label="Réussite" class="${stats.winRate >= settings.thresholdWinrateMid ? 'text-success' : 'text-danger'}">${stats.winRate.toFixed(1)}%</td>
                <td data-label="ROI" class="${stats.roi >= 0 ? 'text-success' : 'text-danger'}">${stats.roi.toFixed(1)}%</td><td>${badge}</td>
            </tr>`;
    }
}

// --- OPERATIONS CRUD ---
function handleBetSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('bet-id').value;
    const data = {
        id: id ? parseInt(id) : Date.now(),
        league: document.getElementById('bet-league').value,
        option: document.getElementById('bet-option').value,
        stake: parseFloat(document.getElementById('bet-stake').value),
        odds: parseFloat(document.getElementById('bet-odds').value),
        result: document.querySelector('input[name="bet-result"]:checked').value,
        date: id ? bets.find(b => b.id === parseInt(id)).date : new Date().toISOString().split('T')[0]
    };

    if (id) bets = bets.map(b => b.id === parseInt(id) ? data : b);
    else bets.push(data);

    saveData('fc_bets', bets);
    resetBetForm();
    document.querySelector('[data-target="dashboard"]').click();
}

window.editBet = function(id) {
    const b = bets.find(x => x.id === id);
    if (!b) return;
    document.getElementById('bet-id').value = b.id;
    document.getElementById('bet-league').value = b.league;
    document.getElementById('bet-option').value = b.option;
    document.getElementById('bet-stake').value = b.stake;
    document.getElementById('bet-odds').value = b.odds;
    document.querySelector(`input[name="bet-result"][value="${b.result}"]`).checked = true;

    document.getElementById('form-title').innerText = "Modifier le pari";
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    document.querySelector('[data-target="add-bet"]').click();
};

window.deleteBet = function(id) {
    if (confirm("Supprimer ce pari ?")) {
        bets = bets.filter(b => b.id !== id);
        saveData('fc_bets', bets);
        renderHistory();
        renderDashboard();
    }
};

function resetBetForm() {
    document.getElementById('bet-form').reset();
    document.getElementById('bet-id').value = '';
    document.getElementById('form-title').innerText = "Enregistrer un Pari";
    document.getElementById('btn-cancel-edit').classList.add('hidden');
}

function renderHistory() {
    const tbody = document.getElementById('history-tbody');
    tbody.innerHTML = '';

    const sch = document.getElementById('filter-search').value.toLowerCase();
    const lg = document.getElementById('filter-league').value;
    const op = document.getElementById('filter-option').value;
    const dt = document.getElementById('filter-date').value;

    let filtered = bets.filter(b => {
        return (b.league.toLowerCase().includes(sch) || b.option.toLowerCase().includes(sch)) &&
               (lg === "" || b.league === lg) && (op === "" || b.option === op) && (dt === "" || b.date === dt);
    }).sort((a,b) => new Date(b.date) - new Date(a.date));

    filtered.forEach(b => {
        let net = b.result === 'won' ? (b.stake * b.odds) - b.stake : -b.stake;
        tbody.innerHTML += `
            <tr>
                <td data-label="Date">${b.date}</td><td data-label="Championnat">${b.league}</td><td data-label="Option">${b.option}</td>
                <td data-label="Mise">${b.stake} ${settings.currency}</td><td data-label="Cote">${b.odds.toFixed(2)}</td>
                <td data-label="Résultat">${b.result === 'won' ? '✅ Gagné' : '❌ Perdu'}</td>
                <td data-label="Net" class="${net >= 0 ? 'text-success' : 'text-danger'}">${net > 0 ? '+' : ''}${net.toFixed(0)}</td>
                <td data-label="Actions">
                    <button class="btn-edit-icon" onclick="editBet(${b.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-danger-icon" onclick="deleteBet(${b.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
    });
}

// --- PARAMÈTRES ET CONFIGURATIONS ---
function loadSettingsInputs() {
    document.getElementById('settings-currency').value = settings.currency;
    document.getElementById('settings-initial-balance').value = settings.initialBalance || 0;
    document.getElementById('threshold-min-bets').value = settings.thresholdMinBets;
    document.getElementById('threshold-winrate-high').value = settings.thresholdWinrateHigh;
    document.getElementById('threshold-winrate-mid').value = settings.thresholdWinrateMid;
}

function saveGeneralSettings() {
    settings.currency = document.getElementById('settings-currency').value || "FCFA";
    settings.initialBalance = parseFloat(document.getElementById('settings-initial-balance').value) || 0;
    saveData('fc_settings', settings);
    renderDashboard();
    alert("Paramètres généraux mis à jour !");
}

function saveThresholdSettings() {
    settings.thresholdMinBets = parseInt(document.getElementById('threshold-min-bets').value) || 5;
    settings.thresholdWinrateHigh = parseInt(document.getElementById('threshold-winrate-high').value) || 65;
    settings.thresholdWinrateMid = parseInt(document.getElementById('threshold-winrate-mid').value) || 50;
    saveData('fc_settings', settings);
    renderDashboard();
    alert("Seuils enregistrés !");
}

function renderLeaguesSettings() {
    const list = document.getElementById('leagues-list');
    list.innerHTML = leagues.map((l, i) => `<li><span>${l}</span><button class="btn-danger-icon" onclick="deleteLeague(${i})"><i class="fa-solid fa-xmark"></i></button></li>`).join('');
}

function handleAddLeague() {
    const input = document.getElementById('new-league-name');
    const val = input.value.trim();
    if (val && !leagues.includes(val)) {
        leagues.push(val);
        saveData('fc_leagues', leagues);
        input.value = '';
        renderLeaguesSettings();
        populateLeagueSelects();
    }
}

window.deleteLeague = function(index) {
    if (confirm(`Supprimer le championnat "${leagues[index]}" ?`)) {
        leagues.splice(index, 1);
        saveData('fc_leagues', leagues);
        renderLeaguesSettings();
        populateLeagueSelects();
    }
};