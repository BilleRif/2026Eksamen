// Viser alle investeringscases og giver mulighed for at oprette, kopiere og slette dem.

const valgteIds = new Set();

async function hentEjendomme() {
    // Dropdown'en viser kun ejendomme, der kan bruges til nye cases.
    const dropdown = document.getElementById('property');
    try {
        // Hent kun aktive ejendomme til dropdown'en.
        const response = await fetch('/api/ejendom?includeArkiveret=false');
        const ejendomme = await response.json();
        ejendomme.forEach(e => {
            const option = document.createElement('option');
            option.value = e.ejendomId;
            option.textContent = `${e.vejnavn} ${e.husnummer}, ${e.bynavn}`;
            dropdown.appendChild(option);
        });
    } catch (error) {
        console.error('Kunne ikke hente ejendomme:', error);
    }
}

// Formaterer ISO-dato til kort dansk format (fx "13. feb. 2026").
function formatDato(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('da-DK', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

async function hentCases() {
    // Henter case-oversigten og bygger listen fra bunden.
    const liste = document.getElementById('cases-list');
    try {
        const response = await fetch('/api/investment-cases');
        const cases = await response.json();
        liste.innerHTML = '';

        if (cases.length === 0) {
            // Giver brugeren en tydelig tom tilstand.
            liste.innerHTML = '<li>Ingen cases endnu.</li>';
            return;
        }

        cases.forEach(c => {
            const li = document.createElement('li');
            li.className = 'case-row';

            // Checkbox til sammenligning
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = c.caseId;
            checkbox.addEventListener('change', () => toggleSammenligning(c.caseId, checkbox.checked));

            const info = document.createElement('div');
            info.className = 'case-info';
            const titel = document.createElement('a');
            titel.href = `/investment-cases/${c.caseId}`;
            titel.className = 'case-title';
            titel.textContent = c.navn;
            const meta = document.createElement('span');
            meta.className = 'case-meta';
            meta.textContent = `Oprettet ${formatDato(c.createdAt)}`;
            info.appendChild(titel);
            info.appendChild(meta);
            if (c.beskrivelse) {
                const desc = document.createElement('p');
                desc.className = 'case-desc';
                desc.textContent = c.beskrivelse;
                info.appendChild(desc);
            }

            const handlinger = document.createElement('div');
            handlinger.className = 'case-actions';

            const dupBtn = document.createElement('button');
            dupBtn.type = 'button';
            dupBtn.textContent = 'Duplikér';
            dupBtn.addEventListener('click', () => duplikerCase(c.caseId));

            const slet = document.createElement('button');
            slet.type = 'button';
            slet.className = 'danger';
            slet.textContent = 'Slet';
            slet.addEventListener('click', () => sletCase(c.caseId, c.navn));

            handlinger.appendChild(dupBtn);
            handlinger.appendChild(slet);

            li.appendChild(checkbox);
            li.appendChild(info);
            li.appendChild(handlinger);
            liste.appendChild(li);
        });
    } catch (error) {
        liste.innerHTML = '<li>Kunne ikke hente cases.</li>';
    }
}

function toggleSammenligning(caseId, valgt) {
    // Holder styr på de cases, brugeren vil sammenligne.
    if (valgt) {
        if (valgteIds.size >= 3) {
            // Maksimum 3 cases ad gangen — ellers bliver chart'et ulæseligt.
            alert('Du kan højst sammenligne 3 cases ad gangen.');
            // Fjern checken igen
            const cb = document.querySelector(`#cases-list input[value="${caseId}"]`);
            if (cb) cb.checked = false;
            return;
        }
        valgteIds.add(caseId);
    } else {
        valgteIds.delete(caseId);
    }
    opdaterCompareBar();
}

function opdaterCompareBar() {
    // Sammenlign-knappen aktiveres først, når mindst to cases er valgt.
    const count = document.getElementById('compare-count');
    const button = document.getElementById('compare-button');
    count.textContent = `${valgteIds.size} valgt`;
    button.disabled = valgteIds.size < 2;
}

async function duplikerCase(caseId) {
    try {
        // Backend kopierer både casen og dens tilhørende budgetlinjer.
        const response = await fetch(`/api/investment-cases/${caseId}/duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const result = await response.json();
        if (!response.ok) {
            alert(result.error || 'Kunne ikke duplikere.');
            return;
        }
        await hentCases();
    } catch (error) {
        alert('Noget gik galt under duplikering.');
    }
}

async function sletCase(caseId, navn) {
    // Sletning fjerner også tilhørende linjer, så brugeren skal bekræfte.
    if (!confirm(`Slet "${navn}"? Dette fjerner også alle tilknyttede linjer.`)) return;
    try {
        const response = await fetch(`/api/investment-cases/${caseId}`, { method: 'DELETE' });
        if (!response.ok) {
            const result = await response.json();
            alert(result.error || 'Kunne ikke slette.');
            return;
        }
        valgteIds.delete(caseId);
        opdaterCompareBar();
        await hentCases();
    } catch (error) {
        alert('Noget gik galt under sletning.');
    }
}

document.getElementById('compare-button').addEventListener('click', () => {
    // De valgte id'er sendes med i URL'en til sammenligningssiden.
    const ids = Array.from(valgteIds).join(',');
    window.location.href = `/investment-cases/compare?ids=${ids}`;
});

document.getElementById('case-form').addEventListener('submit', async function(event) {
    event.preventDefault();

    // En case kræver kun ejendom, navn og valgfri beskrivelse.
    const navn = document.getElementById('navn').value.trim();
    const beskrivelse = document.getElementById('beskrivelse').value.trim();
    const ejendomId = Number.parseInt(document.getElementById('property').value, 10);
    const status = document.getElementById('status');

    if (!ejendomId) {
        status.textContent = 'Vælg en ejendom først.';
        return;
    }

    try {
        const response = await fetch('/api/investment-cases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ejendomId, navn, beskrivelse })
        });
        const result = await response.json();
        if (!response.ok) {
            status.textContent = result.error;
            return;
        }
        status.textContent = 'Case oprettet!';
        document.getElementById('navn').value = '';
        document.getElementById('beskrivelse').value = '';
        hentCases();
    } catch (error) {
        status.textContent = 'Noget gik galt.';
    }
});

hentCases();
// Ejendomme hentes til oprettelsesformularens dropdown.
hentEjendomme();
