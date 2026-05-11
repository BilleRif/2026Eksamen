(function initializeAddressAutocomplete() {
    // Samler hele adresseflowet på ejendomssiden.
    const input = document.getElementById('address-input');
    const form = document.getElementById('property-form');
    const saveButton = document.getElementById('save-property-button');
    let currentBbrData = null;

    // Hvis siden ikke har adresseformularen, skal scriptet ikke gøre mere.
    if (!input || !form || !window.dawaAutocomplete) {
        return;
    }

    // Alle DOM-felter samles ét sted, så resten af filen er lettere at læse.
    const fields = {
        street: document.getElementById('street'),
        houseNumber: document.getElementById('house-number'),
        floor: document.getElementById('floor'),
        door: document.getElementById('door'),
        postalCode: document.getElementById('postal-code'),
        city: document.getElementById('city'),
        municipality: document.getElementById('municipality'),
        addressId: document.getElementById('address-id'),
        selectedText: document.getElementById('selected-address-text'),
        saveStatus: document.getElementById('save-status'),
        metadataStatus: document.getElementById('metadata-status'),
        metadataSummary: document.getElementById('metadata-summary'),
        aerialStatus: document.getElementById('aerial-status'),
        mapContainer: document.getElementById('address-map'),
        bbrStatus: document.getElementById('bbr-status'),
        bbrSummary: document.getElementById('bbr-summary')
    };

    // Kortet oprettes først, naar brugeren vælger en adresse.
    let map = null;
    let marker = null;
    let matrikelLayer = null;

    const setValue = (element, value) => {
        // Hjælper med at undgå gentagne null-tjek ved udfyldning af formularen.
        if (element) {
            element.value = value || '';
        }
    };

    const renderAddressSummary = (result) => {
        // Lige nu viser vi kun region, men funktionen gør det nemt at udvide senere.
        if (!fields.metadataSummary) {
            return;
        }

        fields.metadataSummary.innerHTML = `
            <p><strong>Region:</strong> ${result.region || 'Ukendt'}</p>
        `;
    };

    // Luftfoto hentes fra Dataforsyningen med vores kort-token.
    // Det er adskilt fra BBR-login og passer direkte til Leaflet.
    const DATAFORSYNINGEN_TOKEN = '1ed09b52ec33567e762a62a31f8b5411';

    const initMap = (lat, lon) => {
        // Leaflet-kortet oprettes kun én gang og genbruges ved næste adresse.
        map = L.map(fields.mapContainer).setView([lat, lon], 17);

        // Tjenesten kræver teksten 'TRUE' eller 'FALSE' her.
        L.tileLayer.wms(
            `https://api.dataforsyningen.dk/orto_foraar_DAF?token=${DATAFORSYNINGEN_TOKEN}`,
            {
                layers: 'orto_foraar_10',
                format: 'image/jpeg',
                transparent: 'FALSE',
                version: '1.3.0',
                maxZoom: 19,
                attribution: '&copy; Dataforsyningen / GeoDanmark Ortofoto'
            }
        ).addTo(map);

        marker = L.marker([lat, lon]).addTo(map);
    };

    // Viser luftfoto for den valgte adresse.
    const updateMap = (koordinater, adressebetegnelse) => {
        if (!fields.mapContainer || !fields.aerialStatus) {
            return;
        }

        const [lon, lat] = Array.isArray(koordinater) ? koordinater : [];

        if (!lon || !lat) {
            fields.aerialStatus.textContent = 'Kortet kunne ikke vises, fordi adressen mangler koordinater.';
            return;
        }

        if (!map) {
            initMap(lat, lon);
        } else {
            map.setView([lat, lon], 17);
            marker.setLatLng([lat, lon]);
        }

        fields.aerialStatus.textContent = adressebetegnelse
            ? `Kortet viser: ${adressebetegnelse}`
            : 'Kortet er opdateret.';
    };

    // Tegner matriklen oven på kortet. Hvis der ikke er geometri,
    // fjernes den gamle markering bare.
    const updateMatrikel = (geometri) => {
        if (!map) {
            return;
        }
        if (matrikelLayer) {
            map.removeLayer(matrikelLayer);
            matrikelLayer = null;
        }
        if (!geometri) {
            return;
        }
        try {
            matrikelLayer = L.geoJSON(geometri, {
                style: {
                    color: '#1e3a8a',
                    weight: 2.5,
                    opacity: 0.9,
                    fillColor: '#1e3a8a',
                    fillOpacity: 0.12
                }
            }).addTo(map);
        } catch (error) {
            console.error('Kunne ikke tegne matrikelpolygon:', error.message);
            matrikelLayer = null;
        }
    };

    const loadAddressMetadata = async (adgangsadresseid) => {
        // Henter ekstra adresseinfo og geometri fra vores DAWA-route.
        if (!fields.metadataStatus || !fields.metadataSummary) {
            return;
        }

        if (!adgangsadresseid) {
            fields.metadataStatus.textContent = 'Ingen adgangsadresse valgt.';
            fields.metadataSummary.innerHTML = '';
            return;
        }

        fields.metadataStatus.textContent = 'Henter adresseoplysninger fra Dataforsyningen...';
        fields.metadataSummary.innerHTML = '';

        try {
            const response = await fetch(`/api/dawa/validate?adgangsadresseid=${encodeURIComponent(adgangsadresseid)}`);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Kunne ikke hente adresseoplysninger.');
            }

            renderAddressSummary(result);
            // Kommune kommer først med i det ekstra adresseopslag.
            setValue(fields.municipality, result.kommune);
            updateMap(result.koordinater, result.adressebetegnelse);
            updateMatrikel(result.geometri);
            fields.metadataStatus.textContent = 'Adresseoplysninger hentet.';
        } catch (error) {
            fields.metadataStatus.textContent = error.message;
            fields.metadataSummary.innerHTML = '';
            updateMap([], '');
            updateMatrikel(null);
        }
    };

    const renderBbrSummary = (result) => {
        // Viser de BBR-tal brugeren får gemt sammen med ejendommen.
        if (!fields.bbrSummary) {
            return;
        }

        fields.bbrSummary.innerHTML = `
            <p><strong>Ejendomstype:</strong> ${result.ejendomstype || 'Ukendt'}</p>
            <p><strong>Byggeår:</strong> ${result.byggeaar || 'Ukendt'}</p>
            <p><strong>Boligareal:</strong> ${result.boligareal ? result.boligareal + ' m²' : 'Ukendt'}</p>
            <p><strong>Antal værelser:</strong> ${result.antalVaerelser || 'Ukendt'}</p>
            <p><strong>Grundareal:</strong> ${result.grundareal ? result.grundareal + ' m²' : 'Ukendt'}</p>
        `;
    };

    const loadBbrData = async (adgangsadresseid) => {
        // BBR-data gemmes i currentBbrData, så submit kan sende dem med.
        if (!fields.bbrStatus || !fields.bbrSummary) {
            return;
        }

        if (!adgangsadresseid) {
            fields.bbrStatus.textContent = 'Ingen adgangsadresse valgt.';
            fields.bbrSummary.innerHTML = '';
            return;
        }

        fields.bbrStatus.textContent = 'Henter BBR-data fra Datafordeler...';
        fields.bbrSummary.innerHTML = '';

        try {
            const response = await fetch(`/api/bbr?adgangsadresseid=${encodeURIComponent(adgangsadresseid)}`);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Kunne ikke hente BBR-data.');
            }

            renderBbrSummary(result);
            currentBbrData = result;
            fields.bbrStatus.textContent = 'BBR-data hentet.';
        } catch (error) {
            fields.bbrStatus.textContent = error.message;
            fields.bbrSummary.innerHTML = '';
        }
    };

    window.dawaAutocomplete.dawaAutocomplete(input, {
        minLength: 2,
        select(selected) {
            // Når brugeren vælger en adresse, udfyldes formularen automatisk.
            const data = selected && selected.data ? selected.data : {};
            const adgangsadresseid = data.adgangsadresseid || data.id || '';

            setValue(fields.street, data.vejnavn);
            setValue(fields.houseNumber, data.husnr);
            setValue(fields.floor, data.etage);
            setValue(fields.door, data.dør);
            setValue(fields.postalCode, data.postnr);
            setValue(fields.city, data.postnrnavn);
            // Kommune udfyldes senere af adresseopslaget.
            setValue(fields.municipality, '');
            setValue(fields.addressId, adgangsadresseid);

            if (fields.selectedText) {
                fields.selectedText.textContent = selected.tekst || 'Ingen adresse valgt endnu.';
            }

            if (fields.saveStatus) {
                fields.saveStatus.textContent = 'Adressen er klar til at blive gemt.';
            }

            loadAddressMetadata(adgangsadresseid);
            loadBbrData(adgangsadresseid);
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Payload matcher de felter, som /api/ejendom forventer.
        const payload = {
            vejnavn:        fields.street.value,
            husnummer:      fields.houseNumber.value,
            postnummer:     fields.postalCode.value,
            bynavn:         fields.city.value,
            bbrId:          fields.addressId.value,
            ejendomstype:   currentBbrData?.ejendomstype   || null,
            byggeaar:       currentBbrData?.byggeaar        || null,
            boligareal:     currentBbrData?.boligareal      || null,
            antalVaerelser: currentBbrData?.antalVaerelser  || null,
            grundareal:     currentBbrData?.grundareal      || null,
        };

        if (fields.saveStatus) {
            fields.saveStatus.textContent = 'Gemmer ejendom...';
        }

        if (saveButton) {
            saveButton.disabled = true;
        }

        try {
            // Sender den valgte adresse og BBR-data til backend.
            const response = await fetch('/api/ejendom', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Kunne ikke gemme ejendommen.');
            }

            if (fields.saveStatus) {
                fields.saveStatus.textContent = `Ejendommen blev gemt med id ${result.ejendomId}.`;
            }
            // Opdater listen uden at brugeren skal genindlæse siden.
            if (typeof window.refreshEjendomList === 'function') {
                window.refreshEjendomList();
            }
        } catch (error) {
            if (fields.saveStatus) {
                fields.saveStatus.textContent = error.message;
            }
        } finally {
            // Knappen åbnes igen uanset om gem lykkes eller fejler.
            if (saveButton) {
                saveButton.disabled = false;
            }
        }
    });
})();
