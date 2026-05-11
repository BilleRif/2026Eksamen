// ejendomsliste.js — viser oversigten over eksisterende ejendomsprofiler
// på /properties under DAWA-formularen. Henter også metadata (oprettelse,
// sidst opdateret, antal cases) og giver brugeren mulighed for at arkivere
// eller gendanne profiler.

(function initializeEjendomList() {
    const liste = document.getElementById('ejendom-list');
    if (!liste) return;

    const formatDato = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('da-DK', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    };

    async function hentEjendomme() {
        try {
            const response = await fetch('/api/ejendom');
            const ejendomme = await response.json();
            liste.innerHTML = '';

            if (!Array.isArray(ejendomme) || ejendomme.length === 0) {
                liste.innerHTML = '<li>Ingen ejendomme gemt endnu.</li>';
                return;
            }

            ejendomme.forEach(e => {
                const li = document.createElement('li');
                li.className = 'ejendom-row' + (e.arkiveret ? ' arkiveret' : '');

                const info = document.createElement('div');
                info.className = 'case-info';

                const titel = document.createElement('span');
                titel.className = 'case-title';
                titel.textContent = `${e.vejnavn} ${e.husnummer}, ${e.postnummer} ${e.bynavn}`;

                const meta = document.createElement('span');
                meta.className = 'case-meta';
                meta.textContent =
                    `Oprettet ${formatDato(e.createdAt)} · ` +
                    `Sidst opdateret ${formatDato(e.sidstOpdateret)} · ` +
                    `${e.antalCases} case${e.antalCases === 1 ? '' : 's'}` +
                    (e.arkiveret ? ' · ARKIVERET' : '');

                info.appendChild(titel);
                info.appendChild(meta);

                if (e.ejendomstype || e.byggeaar || e.boligareal) {
                    const detaljer = document.createElement('p');
                    detaljer.className = 'case-desc';
                    const dele = [];
                    if (e.ejendomstype) dele.push(e.ejendomstype);
                    if (e.byggeaar)     dele.push(`Bygget ${e.byggeaar}`);
                    if (e.boligareal)   dele.push(`${e.boligareal} m²`);
                    detaljer.textContent = dele.join(' · ');
                    info.appendChild(detaljer);
                }

                const handlinger = document.createElement('div');
                handlinger.className = 'ejendom-actions';

                // Genindhent-knappen henter friske BBR-data via det gemte bbr_id
                // og opdaterer ejendommen — opfylder kravet om at "ændre" en
                // eksisterende profil. Disabled hvis bbr_id mangler (fx fordi
                // ejendommen blev oprettet uden BBR-opslag).
                const opdaterBtn = document.createElement('button');
                opdaterBtn.type = 'button';
                opdaterBtn.textContent = 'Opdatér BBR';
                if (!e.bbrId) {
                    opdaterBtn.disabled = true;
                    opdaterBtn.title = 'Kræver et adgangsadresse-id. Slet og opret igen via adresse-søgningen.';
                }
                opdaterBtn.addEventListener('click', () => opdaterBbr(e));

                const arkivBtn = document.createElement('button');
                arkivBtn.type = 'button';
                arkivBtn.textContent = e.arkiveret ? 'Gendan' : 'Arkivér';
                arkivBtn.addEventListener('click', () => arkiver(e.ejendomId, !e.arkiveret));

                const sletBtn = document.createElement('button');
                sletBtn.type = 'button';
                sletBtn.className = 'danger';
                sletBtn.textContent = 'Slet';
                // Slet er disabled hvis der er tilknyttede cases — FK ON DELETE
                // CASCADE ville fjerne dem, men det er ikke det brugeren ønsker
                // når de bare vil rydde op i en visning.
                if (e.antalCases > 0) {
                    sletBtn.disabled = true;
                    sletBtn.title = 'Kan ikke slettes, da der findes tilknyttede cases. Arkivér i stedet.';
                }
                sletBtn.addEventListener('click', () => slet(e.ejendomId, `${e.vejnavn} ${e.husnummer}`));

                handlinger.appendChild(opdaterBtn);
                handlinger.appendChild(arkivBtn);
                handlinger.appendChild(sletBtn);

                li.appendChild(info);
                li.appendChild(handlinger);
                liste.appendChild(li);
            });
        } catch (error) {
            liste.innerHTML = '<li>Kunne ikke hente ejendomme.</li>';
        }
    }

    // Henter friske BBR-data og PUT'er ejendomsprofilen, så sidst_opdateret
    // sættes til nu og BBR-felterne (byggeår, areal m.v.) opdateres hvis
    // Datafordeleren har modtaget nyere data. Adressefelterne lades urørt.
    async function opdaterBbr(ejendom) {
        try {
            const bbrRes = await fetch(`/api/bbr?adgangsadresseid=${encodeURIComponent(ejendom.bbrId)}`);
            const bbr = await bbrRes.json();
            if (!bbrRes.ok) {
                alert(bbr.error || 'Kunne ikke hente friske BBR-data.');
                return;
            }

            const payload = {
                vejnavn:        ejendom.vejnavn,
                husnummer:      ejendom.husnummer,
                postnummer:     ejendom.postnummer,
                bynavn:         ejendom.bynavn,
                bbrId:          ejendom.bbrId,
                ejendomstype:   bbr.ejendomstype,
                byggeaar:       bbr.byggeaar,
                boligareal:     bbr.boligareal,
                antalVaerelser: bbr.antalVaerelser,
                grundareal:     bbr.grundareal
            };

            const putRes = await fetch(`/api/ejendom/${ejendom.ejendomId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const putResult = await putRes.json();
            if (!putRes.ok) {
                alert(putResult.error || 'Kunne ikke opdatere ejendommen.');
                return;
            }
            hentEjendomme();
        } catch (error) {
            alert('Noget gik galt under opdateringen.');
        }
    }

    async function arkiver(id, skalArkiveres) {
        try {
            const response = await fetch(`/api/ejendom/${id}/arkiver`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ arkiveret: skalArkiveres })
            });
            if (!response.ok) {
                const result = await response.json();
                alert(result.error || 'Kunne ikke ændre status.');
                return;
            }
            hentEjendomme();
        } catch (error) {
            alert('Noget gik galt.');
        }
    }

    async function slet(id, label) {
        if (!confirm(`Slet ${label}? Dette kan ikke fortrydes.`)) return;
        try {
            const response = await fetch(`/api/ejendom/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const result = await response.json();
                alert(result.error || 'Kunne ikke slette.');
                return;
            }
            hentEjendomme();
        } catch (error) {
            alert('Noget gik galt.');
        }
    }

    // Eksponér hentEjendomme globalt, så adresseopslag.js kan kalde den
    // efter en succesfuld POST og opdatere listen automatisk.
    window.refreshEjendomList = hentEjendomme;
    hentEjendomme();
})();
