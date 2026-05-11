// investeringscaseDetalje.js
// Håndterer alle 5 formularer på case-detaljesiden.
// CASE_ID er sat i EJS-siden og bruges i alle API-kald.

// Lille hjælpefunktion til pæne tal i dansk format.
const formatKr = (v) => Number(v || 0).toLocaleString('da-DK');

// Beløbsfelterne vises med danske tusindtalsprikker (fx 1.000.000).
// Før værdierne sendes til API'et, fjernes prikkerne igen, så backend får et tal.
function parseFormattedNumber(value) {
    return Number(String(value || '').replace(/\./g, '')) || 0;
}

// Number-inputs kan ikke vise tusindtalsprikker stabilt i browseren, så beløbsfelter
// er text-inputs med inputmode="numeric". Denne funktion holder kun cifre og
// formatterer dem løbende til dansk visning.
function formatNumberInput(input) {
    const digits = input.value.replace(/\D/g, '');
    input.value = digits ? Number(digits).toLocaleString('da-DK') : '';
}

// Alle felter med data-format-number får samme formattering, så vi undgår
// gentaget input-logik i hver enkelt formular.
document.querySelectorAll('[data-format-number]').forEach(input => {
    input.addEventListener('input', () => formatNumberInput(input));
});

// ─── Trin 1: Køb og omkostninger ───

async function hentKoebsomkostninger() {
    const liste = document.getElementById('koeb-liste');
    const total = document.getElementById('koeb-total');
    try {
        const response = await fetch(`/api/koebsomkostning?caseId=${CASE_ID}`);
        const data = await response.json();
        liste.innerHTML = '';
        if (data.length === 0) {
            liste.innerHTML = '<li>Ingen omkostninger endnu.</li>';
            total.textContent = 'Total: 0 kr';
            return;
        }
        let sum = 0;
        data.forEach(k => {
            sum += Number(k.beloeb);
            const li = document.createElement('li');
            li.textContent = `${k.beskrivelse}: ${formatKr(k.beloeb)} kr `;
            const slet = document.createElement('button');
            slet.type = 'button';
            slet.className = 'danger';
            slet.textContent = 'Slet';
            slet.addEventListener('click', () => sletKoebsomkostning(k.koebsomkostningId));
            li.appendChild(slet);
            liste.appendChild(li);
        });
        total.textContent = `Total: ${formatKr(sum)} kr`;
    } catch (error) {
        liste.innerHTML = '<li>Kunne ikke hente omkostninger.</li>';
    }
}

async function sletKoebsomkostning(id) {
    if (!confirm('Slet denne omkostning?')) return;
    try {
        const response = await fetch(`/api/koebsomkostning/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            alert(result.error || 'Kunne ikke slette omkostning.');
            return;
        }
        hentKoebsomkostninger();
    } catch (error) {
        alert('Noget gik galt under sletning.');
    }
}

document.getElementById('koeb-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    const status = document.getElementById('koeb-status');
    const beskrivelse = document.getElementById('koeb-beskrivelse').value.trim();
    const beloeb = parseFormattedNumber(document.getElementById('koeb-beloeb').value);

    try {
        const response = await fetch('/api/koebsomkostning', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId: CASE_ID, beskrivelse, beloeb })
        });
        const result = await response.json();
        if (!response.ok) { status.textContent = result.error; return; }
        status.textContent = 'Omkostning tilføjet!';
        document.getElementById('koeb-beskrivelse').value = '';
        document.getElementById('koeb-beloeb').value = '';
        hentKoebsomkostninger();
    } catch (error) {
        status.textContent = 'Noget gik galt.';
    }
});

// ─── Trin 2: Finansiering ───

async function hentFinansiering() {
    try {
        const response = await fetch(`/api/finansiering?caseId=${CASE_ID}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!data) return;
        // Pre-fyld formularen, så brugeren kan se og redigere eksisterende værdier.
        document.getElementById('laanebeloeb').value = formatKr(data.laanebeloeb);
        document.getElementById('rente').value      = data.rentePct;
        document.getElementById('loebetid').value   = data.loebetidAar;
        document.getElementById('afdragsfri').value = data.afdragsfriAar;
        document.getElementById('laanetype').value  = data.laanetype || '';
    } catch (error) {
        // Fail silent — formularen forbliver tom
    }
}

document.getElementById('finansiering-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    const status = document.getElementById('finansiering-status');

    const payload = {
        caseId:        CASE_ID,
        laanebeloeb:   parseFormattedNumber(document.getElementById('laanebeloeb').value),
        rentePct:      Number(document.getElementById('rente').value),
        loebetidAar:   Number(document.getElementById('loebetid').value),
        afdragsfriAar: Number(document.getElementById('afdragsfri').value) || 0,
        laanetype:     document.getElementById('laanetype').value.trim()
    };

    try {
        const response = await fetch('/api/finansiering', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) { status.textContent = result.error; return; }
        status.textContent = `${result.message} Månedlig ydelse: ${formatKr(result.maanedligYdelse)} kr`;
    } catch (error) {
        status.textContent = 'Noget gik galt.';
    }
});

// ─── Trin 3: Renovering ───

async function hentRenoveringer() {
    const liste = document.getElementById('renovering-liste');
    try {
        const response = await fetch(`/api/renovering?caseId=${CASE_ID}`);
        const data = await response.json();
        liste.innerHTML = '';
        if (data.length === 0) {
            liste.innerHTML = '<li>Ingen renoveringer endnu.</li>';
            return;
        }
        data.forEach(r => {
            const li = document.createElement('li');
            li.textContent = `År ${r.aar} — ${r.beskrivelse}: ${formatKr(r.beloeb)} kr `;
            const slet = document.createElement('button');
            slet.type = 'button';
            slet.className = 'danger';
            slet.textContent = 'Slet';
            slet.addEventListener('click', () => sletRenovering(r.renoveringId));
            li.appendChild(slet);
            liste.appendChild(li);
        });
    } catch (error) {
        liste.innerHTML = '<li>Kunne ikke hente renoveringer.</li>';
    }
}

async function sletRenovering(id) {
    if (!confirm('Slet denne renovering?')) return;
    try {
        const response = await fetch(`/api/renovering/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            alert(result.error || 'Kunne ikke slette renovering.');
            return;
        }
        hentRenoveringer();
    } catch (error) {
        alert('Noget gik galt under sletning.');
    }
}

document.getElementById('renovering-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    const status = document.getElementById('renovering-status');

    const payload = {
        caseId:      CASE_ID,
        beskrivelse: document.getElementById('ren-beskrivelse').value.trim(),
        beloeb:      parseFormattedNumber(document.getElementById('ren-beloeb').value),
        aar:         Number(document.getElementById('ren-aar').value)
    };

    try {
        const response = await fetch('/api/renovering', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) { status.textContent = result.error; return; }
        status.textContent = 'Renovering tilføjet!';
        document.getElementById('ren-beskrivelse').value = '';
        document.getElementById('ren-beloeb').value = '';
        document.getElementById('ren-aar').value = '';
        hentRenoveringer();
    } catch (error) {
        status.textContent = 'Noget gik galt.';
    }
});

// ─── Trin 4: Driftsbudget ───

async function hentDriftsudgifter() {
    const liste = document.getElementById('drift-liste');
    const total = document.getElementById('drift-total');
    try {
        const response = await fetch(`/api/driftsudgift?caseId=${CASE_ID}`);
        const data = await response.json();
        liste.innerHTML = '';
        if (data.length === 0) {
            liste.innerHTML = '<li>Ingen driftsudgifter endnu.</li>';
            total.textContent = 'Total: 0 kr/md (0 kr/år)';
            return;
        }
        let sumMaaned = 0;
        data.forEach(d => {
            sumMaaned += Number(d.beloebMaaned);
            const li = document.createElement('li');
            li.textContent = `${d.navn}: ${formatKr(d.beloebMaaned)} kr/md `;
            const slet = document.createElement('button');
            slet.type = 'button';
            slet.className = 'danger';
            slet.textContent = 'Slet';
            slet.addEventListener('click', () => sletDriftsudgift(d.driftsudgiftId));
            li.appendChild(slet);
            liste.appendChild(li);
        });
        total.textContent = `Total: ${formatKr(sumMaaned)} kr/md (${formatKr(sumMaaned * 12)} kr/år)`;
    } catch (error) {
        liste.innerHTML = '<li>Kunne ikke hente driftsudgifter.</li>';
    }
}

async function sletDriftsudgift(id) {
    if (!confirm('Slet denne driftsudgift?')) return;
    try {
        const response = await fetch(`/api/driftsudgift/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            alert(result.error || 'Kunne ikke slette driftsudgift.');
            return;
        }
        hentDriftsudgifter();
    } catch (error) {
        alert('Noget gik galt under sletning.');
    }
}

document.getElementById('drift-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    const status = document.getElementById('drift-status');

    const payload = {
        caseId:       CASE_ID,
        navn:         document.getElementById('drift-navn').value.trim(),
        beloebMaaned: parseFormattedNumber(document.getElementById('drift-beloeb').value)
    };

    try {
        const response = await fetch('/api/driftsudgift', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) { status.textContent = result.error; return; }
        status.textContent = 'Driftsudgift tilføjet!';
        document.getElementById('drift-navn').value = '';
        document.getElementById('drift-beloeb').value = '';
        hentDriftsudgifter();
    } catch (error) {
        status.textContent = 'Noget gik galt.';
    }
});

// ─── Trin 5: Udlejning ───

function opdaterUdlejningsTotal() {
    const leje   = parseFormattedNumber(document.getElementById('maanedlig-leje').value);
    const udgift = parseFormattedNumber(document.getElementById('maanedlig-udgift').value);
    const netto  = leje - udgift;
    document.getElementById('udlejning-total').textContent =
        `Netto-leje: ${formatKr(netto)} kr/md (${formatKr(netto * 12)} kr/år)`;
}

async function hentUdlejning() {
    try {
        const response = await fetch(`/api/udlejning?caseId=${CASE_ID}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!data) return;
        document.getElementById('maanedlig-leje').value   = formatKr(data.maanedligLeje);
        document.getElementById('maanedlig-udgift').value = formatKr(data.maanedligUdgift);
        opdaterUdlejningsTotal();
    } catch (error) {
        // Fail silent
    }
}

document.getElementById('maanedlig-leje').addEventListener('input', opdaterUdlejningsTotal);
document.getElementById('maanedlig-udgift').addEventListener('input', opdaterUdlejningsTotal);

document.getElementById('udlejning-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    const status = document.getElementById('udlejning-status');

    const payload = {
        caseId:          CASE_ID,
        maanedligLeje:   parseFormattedNumber(document.getElementById('maanedlig-leje').value),
        maanedligUdgift: parseFormattedNumber(document.getElementById('maanedlig-udgift').value)
    };

    try {
        const response = await fetch('/api/udlejning', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) { status.textContent = result.error; return; }
        status.textContent = result.message;
        opdaterUdlejningsTotal();
    } catch (error) {
        status.textContent = 'Noget gik galt.';
    }
});

// ─── Simulering for denne case ───
// Bruger samme antagelser som sammenligningssiden, så graferne er
// sammenlignelige på tværs:
//   - Lineært årligt afdrag = lånebeløb / løbetid
//   - Startegenkapital      = sum(købsomkostninger) - lånebeløb
//   - Driftsomkostninger    = sum(driftsudgifter) + udlejnings-udgift (md)
//   - Lejeindtægt           = udlejning.maanedligLeje (md)

const SIMULATION_AAR = 30;
let simChart = null;

function byggSimParametre(fuldCase) {
    const koebSum = (fuldCase.koebsomkostninger || [])
        .reduce((acc, k) => acc + Number(k.beloeb), 0);

    const fin = fuldCase.finansiering;
    const laanebeloeb     = fin ? Number(fin.laanebeloeb) : 0;
    const rentePct        = fin ? Number(fin.rentePct)    : 0;
    const loebetidAar     = fin ? Number(fin.loebetidAar) : SIMULATION_AAR;
    const annualRepayment = loebetidAar > 0 ? laanebeloeb / loebetidAar : 0;

    const driftMaaned = (fuldCase.driftsudgifter || [])
        .reduce((acc, d) => acc + Number(d.beloebMaaned), 0);
    const udlejning   = fuldCase.udlejning;
    const lejeMaaned  = udlejning ? Number(udlejning.maanedligLeje)   : 0;
    const udlUdgift   = udlejning ? Number(udlejning.maanedligUdgift) : 0;

    // Renoveringer sendes med år+beløb. Backend trækker dem fra cashflow og
    // egenkapital i det matchende år (krav 3.3: skal indgå i samlet analyse).
    const renovations = (fuldCase.renoveringer || []).map(r => ({
        aar:    Number(r.aar),
        beloeb: Number(r.beloeb)
    }));

    return {
        loanAmount:      laanebeloeb,
        initialEquity:   Math.max(0, koebSum - laanebeloeb),
        interestRate:    rentePct / 100,
        annualRepayment: annualRepayment,
        rent:            lejeMaaned,
        expenses:        driftMaaned + udlUdgift,
        years:           SIMULATION_AAR,
        renovations
    };
}

function tegnSimGraf(simulation) {
    const canvas = document.getElementById('sim-chart');
    const labels = simulation.map(p => `År ${p.year}`);

    if (simChart) simChart.destroy();

    simChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Egenkapital',
                    data: simulation.map(p => p.equity),
                    borderColor: '#0f766e',
                    backgroundColor: 'rgba(15, 118, 110, 0.12)',
                    tension: 0.25
                },
                {
                    label: 'Cashflow',
                    data: simulation.map(p => p.cashflow),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.12)',
                    tension: 0.25
                },
                {
                    label: 'Gæld',
                    data: simulation.map(p => p.debt),
                    borderColor: '#b45309',
                    backgroundColor: 'rgba(180, 83, 9, 0.12)',
                    tension: 0.25
                }
            ]
        },
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

document.getElementById('sim-button').addEventListener('click', async function () {
    const status = document.getElementById('sim-status');
    status.textContent = 'Henter data og kører simulation...';

    try {
        const fuldRes = await fetch(`/api/investment-cases/${CASE_ID}/full`);
        if (!fuldRes.ok) {
            const err = await fuldRes.json().catch(() => ({}));
            throw new Error(err.error || 'Kunne ikke hente case-data.');
        }
        const fuldCase = await fuldRes.json();
        const params = byggSimParametre(fuldCase);

        const simRes = await fetch('/api/simulation/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        if (!simRes.ok) {
            const err = await simRes.json().catch(() => ({}));
            throw new Error(err.error || 'Kunne ikke køre simulation.');
        }
        const simulation = await simRes.json();

        tegnSimGraf(simulation);

        const sidste = simulation[simulation.length - 1];
        status.textContent =
            `Efter ${SIMULATION_AAR} år: egenkapital ${formatKr(sidste.equity)} kr, ` +
            `cashflow ${formatKr(sidste.cashflow)} kr/år, ` +
            `restgæld ${formatKr(sidste.debt)} kr.`;
    } catch (error) {
        status.textContent = error.message;
    }
});

// ─── Hent eksisterende data ved sideload ───
hentKoebsomkostninger();
hentFinansiering();
hentRenoveringer();
hentDriftsudgifter();
hentUdlejning();

// ─── 5-trins flow ───
// Viser ét trin ad gangen via klik på trinbar eller Næste/Tilbage-knapper.
// Progressive enhancement: vi tilføjer 'js-enhanced' til body, og CSS
// skjuler så de inaktive trin. Hvis JS af en eller anden grund ikke
// kører (fx CSP-blok), forbliver alle trin synlige som fallback —
// så brugeren kan stadig udfylde formularen.
function showStep(target) {
    const n = String(target);
    document.querySelectorAll('[data-step]').forEach(section => {
        section.classList.toggle('active', section.dataset.step === n);
    });
    document.querySelectorAll('.step-bar-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === n);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.body.classList.add('js-enhanced');

document.querySelectorAll('.step-bar-item').forEach(btn => {
    btn.addEventListener('click', () => showStep(btn.dataset.target));
});

document.querySelectorAll('.step-next, .step-back').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!btn.disabled) showStep(btn.dataset.target);
    });
});

showStep(1);
