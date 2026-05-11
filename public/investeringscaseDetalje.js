// Håndterer de 5 formularer på case-detaljesiden.
// Bruger den aktuelle case i alle kald til serveren.

// Lille hjælpefunktion til pæne tal i dansk format.
const formatKr = (v) => Number(v || 0).toLocaleString('da-DK');

// Viser beloeb med danske tusindtalsprikker og sender dem som tal.
function parseFormattedNumber(value) {
    return Number(String(value || '').replace(/\./g, '')) || 0;
}

// Beløbsfelter er tekstfelter, så vi selv kan formatere dem pænt.
function formatNumberInput(input) {
    const digits = input.value.replace(/\D/g, '');
    input.value = digits ? Number(digits).toLocaleString('da-DK') : '';
}

// Giver alle beløbsfelter samme formatering.
document.querySelectorAll('[data-format-number]').forEach(input => {
    input.addEventListener('input', () => formatNumberInput(input));
});

// Trin 1: Køb og omkostninger

async function hentKoebsomkostninger() {
    // Købsomkostninger bruges både i listen og senere som startværdi i simulationen.
    const liste = document.getElementById('koeb-liste');
    const total = document.getElementById('koeb-total');
    try {
        const response = await fetch(`/api/koebsomkostning?caseId=${CASE_ID}`);
        const data = await response.json();
        liste.innerHTML = '';
        if (data.length === 0) {
            // En tom liste er gyldig, så brugeren kan starte med de andre trin.
            liste.innerHTML = '<li>Ingen omkostninger endnu.</li>';
            total.textContent = 'Total: 0 kr';
            return;
        }
        let sum = 0;
        data.forEach(k => {
            // Totalen beregnes i browseren, så brugeren får hurtig feedback.
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
    // Sletning bekræftes, fordi beløbet påvirker simulationen.
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
    // Formularen gemmer én omkostningslinje ad gangen.
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

// Trin 2: Finansiering

async function hentFinansiering() {
    try {
        // Hvis finansiering allerede er gemt, udfyldes formularen automatisk.
        const response = await fetch(`/api/finansiering?caseId=${CASE_ID}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!data) return;
        // Udfyld formularen med eksisterende data.
        document.getElementById('laanebeloeb').value = formatKr(data.laanebeloeb);
        document.getElementById('rente').value      = data.rentePct;
        document.getElementById('løbetid').value   = data.loebetidAar;
        document.getElementById('afdragsfri').value = data.afdragsfriAar;
        document.getElementById('laanetype').value  = data.laanetype || '';
    } catch (error) {
        // Hvis der ikke findes data endnu, forbliver formularen tom.
    }
}

document.getElementById('finansiering-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    const status = document.getElementById('finansiering-status');

    // Payload matcher finansierings-routen og bruger tal uden tusindtalsprikker.
    const payload = {
        caseId:        CASE_ID,
        laanebeloeb:   parseFormattedNumber(document.getElementById('laanebeloeb').value),
        rentePct:      Number(document.getElementById('rente').value),
        loebetidAar:   Number(document.getElementById('løbetid').value),
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

// Trin 3: Renovering

async function hentRenoveringer() {
    // Renoveringer kan påvirke bestemte år i simulationen.
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
    // Brugeren skal bekræfte, før en renoveringslinje fjernes.
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

    // Backend forventer feltet aar uden dansk å i API-navnet.
    const payload = {
        caseId:      CASE_ID,
        beskrivelse: document.getElementById('ren-beskrivelse').value.trim(),
        beloeb:      parseFormattedNumber(document.getElementById('ren-beloeb').value),
        aar:         Number(document.getElementById('ren-år').value)
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
        document.getElementById('ren-år').value = '';
        hentRenoveringer();
    } catch (error) {
        status.textContent = 'Noget gik galt.';
    }
});

// Trin 4: Driftsbudget

async function hentDriftsudgifter() {
    // Driftsudgifter gemmes månedligt, men vises også som årlig total.
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
        let sumMåned = 0;
        data.forEach(d => {
            sumMåned += Number(d.beloebMaaned);
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
        total.textContent = `Total: ${formatKr(sumMåned)} kr/md (${formatKr(sumMåned * 12)} kr/år)`;
    } catch (error) {
        liste.innerHTML = '<li>Kunne ikke hente driftsudgifter.</li>';
    }
}

async function sletDriftsudgift(id) {
    // Driftsbudgettet opdateres efter sletning, så totalen passer.
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

    // Én linje kan fx være forsikring, ejendomsskat eller fællesudgift.
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

// Trin 5: Udlejning

function opdaterUdlejningsTotal() {
    // Netto-leje vises live, mens brugeren skriver.
    const leje   = parseFormattedNumber(document.getElementById('månedlig-leje').value);
    const udgift = parseFormattedNumber(document.getElementById('månedlig-udgift').value);
    const netto  = leje - udgift;
    document.getElementById('udlejning-total').textContent =
        `Netto-leje: ${formatKr(netto)} kr/md (${formatKr(netto * 12)} kr/år)`;
}

async function hentUdlejning() {
    try {
        // Hvis der allerede er gemt udlejningstal, udfyldes trin 5.
        const response = await fetch(`/api/udlejning?caseId=${CASE_ID}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!data) return;
        document.getElementById('månedlig-leje').value   = formatKr(data.maanedligLeje);
        document.getElementById('månedlig-udgift').value = formatKr(data.maanedligUdgift);
        opdaterUdlejningsTotal();
    } catch (error) {
        // Hvis der ikke findes data endnu, forbliver formularen tom.
    }
}

document.getElementById('månedlig-leje').addEventListener('input', opdaterUdlejningsTotal);
document.getElementById('månedlig-udgift').addEventListener('input', opdaterUdlejningsTotal);

document.getElementById('udlejning-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    const status = document.getElementById('udlejning-status');

    // Udlejning har kun én række pr. case, så backend opretter eller opdaterer.
    const payload = {
        caseId:          CASE_ID,
        maanedligLeje:   parseFormattedNumber(document.getElementById('månedlig-leje').value),
        maanedligUdgift: parseFormattedNumber(document.getElementById('månedlig-udgift').value)
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

// Simulering for denne case
// Bruger samme beregning som sammenligningssiden:
//   - Lineært årligt afdrag = laanebeloeb / løbetid
//   - Startegenkapital      = sum(koebsomkostninger) - laanebeloeb
//   - Driftsomkostninger    = sum(driftsudgifter) + udlejnings-udgift (md)
//   - Lejeindtægt           = udlejning.maanedligLeje (md)

const SIMULATION_AAR = 30;
let simChart = null;

function byggSimParametre(fuldCase) {
    // Samler de gemte delbudgetter til det format simulationen forventer.
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

    // Renoveringer sendes med år og beloeb, så de kan trækkes fra i det rigtige år.
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
        expenses:        driftMaaned + udlUdgift,
        years:           SIMULATION_AAR,
        renovations
    };
}

function tegnSimGraf(simulation) {
    // Grafen tegnes om hver gang brugeren kører simulationen.
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
    // Simulationen køres først, når brugeren selv trykker på knappen.
    const status = document.getElementById('sim-status');
    status.textContent = 'Henter data og kører simulation...';

    try {
        // Hent hele casen, så simulationen faar alle delbudgetter med.
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

// Hent eksisterende data, naar siden åbnes
hentKoebsomkostninger();
hentFinansiering();
hentRenoveringer();
hentDriftsudgifter();
hentUdlejning();

// 5-trins flow
// Viser ét trin ad gangen. Hvis JavaScript fejler, vises alle trin stadig.
function showStep(target) {
    // Trinvisningen er kun visuel; data gemmes løbende i hvert trin.
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
