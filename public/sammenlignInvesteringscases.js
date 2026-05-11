// Sammenligner 2-3 investeringscases og viser dem i samme graf.

const FARVER = ['#0f766e', '#2563eb', '#b45309'];
const SIMULATION_AAR = 30;

let aktuelChart = null;
let simResultater = [];   // [{ case, simulation }]

function hentIdsFraUrl() {
    // Cases til sammenligning sendes med i URL'en som ids=1,2,3.
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('ids') || '';
    return raw.split(',')
        .map(id => Number.parseInt(id, 10))
        .filter(id => Number.isInteger(id) && id > 0);
}

// Bygger simulationsdata ud fra en case.
// Antagelser:
//   - Lineær afdragsplan: årligt afdrag = laanebeloeb / løbetid.
//   - Startegenkapital = sum(koebsomkostninger) - laanebeloeb.
//   - Driftsomkostninger = sum(driftsudgifter) + udlejnings-udgift, alt månedligt.
//   - Renoveringer trækkes fra cashflow + equity i det matchende år.
//   - Hvis casen ikke har finansiering eller udlejning, behandles tallene som 0.
function byggSimParametre(fuldCase) {
    const koebSum = (fuldCase.koebsomkostninger || [])
        .reduce((acc, k) => acc + Number(k.beloeb), 0);

    const fin = fuldCase.finansiering;
    const laanebeloeb  = fin ? Number(fin.laanebeloeb) : 0;
    const rentePct     = fin ? Number(fin.rentePct)    : 0;
    const loebetidAar  = fin ? Number(fin.loebetidAar) : SIMULATION_AAR;
    const annualRepayment = loebetidAar > 0 ? laanebeloeb / loebetidAar : 0;

    const driftMaaned = (fuldCase.driftsudgifter || [])
        .reduce((acc, d) => acc + Number(d.beloebMaaned), 0);
    const udlejning = fuldCase.udlejning;
    const udgiftMaaned = driftMaaned + (udlejning ? Number(udlejning.maanedligUdgift) : 0);
    const lejeMaaned   = udlejning ? Number(udlejning.maanedligLeje) : 0;

    const renovations = (fuldCase.renoveringer || []).map(r => ({
        år:    Number(r.aar),
        beloeb: Number(r.beloeb)
    }));

    return {
        loanAmount:      laanebeloeb,
        initialEquity:   Math.max(0, koebSum - laanebeloeb),
        interestRate:    rentePct / 100,
        annualRepayment: annualRepayment,
        rent:            lejeMaaned,
        expenses:        udgiftMaaned,
        years:           SIMULATION_AAR,
        renovations
    };
}

async function hentFuldCase(caseId) {
    const response = await fetch(`/api/investment-cases/${caseId}/full`);
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Kunne ikke hente case ${caseId}.`);
    }
    return response.json();
}

async function koerSimulation(params) {
    const response = await fetch('/api/simulation/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Kunne ikke køre simulation.');
    }
    return response.json();
}

function formatKr(value) {
    return Number(value).toLocaleString('da-DK') + ' kr';
}

function byggNøgletalRækker(resultater) {
    // Bygger rækker til nøgletalstabellen.
    const koebSum = (c) => (c.koebsomkostninger || []).reduce((a, k) => a + Number(k.beloeb), 0);
    const driftMd = (c) => (c.driftsudgifter || []).reduce((a, d) => a + Number(d.beloebMaaned), 0);
    const fin = (c) => c.finansiering;
    const udl = (c) => c.udlejning;

    const sidsteAar = (sim) => sim[sim.length - 1] || { equity: 0, cashflow: 0, debt: 0 };

    return [
        { label: 'Adresse',            values: resultater.map(r => `${r.case.vejnavn} ${r.case.husnummer}, ${r.case.bynavn}`) },
        { label: 'Købsomk. i alt',     values: resultater.map(r => formatKr(koebSum(r.case))) },
        { label: 'Lånebeløb',          values: resultater.map(r => fin(r.case) ? formatKr(fin(r.case).laanebeloeb) : '—') },
        { label: 'Rente',              values: resultater.map(r => fin(r.case) ? `${fin(r.case).rentePct}%` : '—') },
        { label: 'Løbetid',            values: resultater.map(r => fin(r.case) ? `${fin(r.case).loebetidAar} år` : '—') },
        { label: 'Drift pr. md.',      values: resultater.map(r => formatKr(driftMd(r.case))) },
        { label: 'Leje pr. md.',       values: resultater.map(r => udl(r.case) ? formatKr(udl(r.case).maanedligLeje) : '—') },
        { label: 'Egenkapital år 30',  values: resultater.map(r => formatKr(sidsteAar(r.simulation).equity)) },
        { label: 'Cashflow år 30',     values: resultater.map(r => formatKr(sidsteAar(r.simulation).cashflow)) },
        { label: 'Restgæld år 30',     values: resultater.map(r => formatKr(sidsteAar(r.simulation).debt)) }
    ];
}

function tegnTabel(resultater) {
    const table = document.getElementById('compare-table');
    const thead = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');

    // Ryd tidligere indhold (alt undtagen første th med 'Nøgletal')
    while (thead.children.length > 1) thead.removeChild(thead.lastChild);
    tbody.innerHTML = '';

    resultater.forEach(r => {
        const th = document.createElement('th');
        th.textContent = r.case.navn;
        thead.appendChild(th);
    });

    byggNøgletalRækker(resultater).forEach(rk => {
        const tr = document.createElement('tr');
        const tdLabel = document.createElement('td');
        tdLabel.textContent = rk.label;
        tdLabel.className = 'row-label';
        tr.appendChild(tdLabel);
        rk.values.forEach(v => {
            const td = document.createElement('td');
            td.textContent = v;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.hidden = false;
}

function tegnGraf(resultater, metric) {
    const canvas = document.getElementById('compare-chart');
    // Fjern den gamle graf, før en ny tegnes.
    if (aktuelChart) aktuelChart.destroy();

    const labels = Array.from({ length: SIMULATION_AAR }, (_, i) => `År ${i + 1}`);
    const datasets = resultater.map((r, i) => ({
        label: r.case.navn,
        data: r.simulation.map(p => p[metric]),
        borderColor: FARVER[i % FARVER.length],
        backgroundColor: FARVER[i % FARVER.length] + '22',
        tension: 0.25
    }));

    aktuelChart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom' } },
            scales: {
                y: { ticks: { callback: v => Number(v).toLocaleString('da-DK') } }
            }
        }
    });
}

async function init() {
    const status = document.getElementById('compare-status');
    const ids = hentIdsFraUrl();

    if (ids.length < 2) {
        status.textContent = 'Vælg mindst 2 cases på cases-oversigten for at sammenligne.';
        return;
    }

    try {
        const fuldCases = await Promise.all(ids.map(hentFuldCase));
        const simulationer = await Promise.all(
            fuldCases.map(c => koerSimulation(byggSimParametre(c)))
        );
        simResultater = fuldCases.map((c, i) => ({ case: c, simulation: simulationer[i] }));

        status.textContent = `Sammenligner ${simResultater.length} cases.`;
        tegnTabel(simResultater);
        tegnGraf(simResultater, document.getElementById('metric-select').value);
    } catch (error) {
        status.textContent = `Fejl: ${error.message}`;
    }
}

document.getElementById('metric-select').addEventListener('change', (event) => {
    if (simResultater.length > 0) {
        tegnGraf(simResultater, event.target.value);
    }
});

init();
