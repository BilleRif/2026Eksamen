(function initializeAddressAutocomplete() {
    const input = document.getElementById('address-input');
    const form = document.getElementById('property-form');
    const saveButton = document.getElementById('save-property-button');
    let currentBbrData = null;

    if (!input || !form || !window.dawaAutocomplete) {
        return;
    }

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

    // Leaflet-kortet initialiseres lazy ved første adressevalg og genbruges derefter.
    let map = null;
    let marker = null;
    let matrikelLayer = null;

    const setValue = (element, value) => {
        if (element) {
            element.value = value || '';
        }
    };

    const renderAddressSummary = (result) => {
        if (!fields.metadataSummary) {
            return;
        }

        fields.metadataSummary.innerHTML = `
            <p><strong>Region:</strong> ${result.region || 'Ukendt'}</p>
        `;
    };

    // Luftfoto kommer fra Dataforsyningens GeoDanmark Ortofoto WMS via det
    // offentlige token-baserede gateway api.dataforsyningen.dk. Det er den
    // kilde opgavebeskrivelsens "Kort Data"-sektion peger på. Token er en
    // gratis registrering på dataforsyningen.dk — adskilt fra Datafordeler-
    // service-kontoen vi bruger til BBR. Layer 'orto_foraar_10' giver natur-
    // lig farve i 10 cm/pixel, og EPSG:3857 er understøttet så Leaflets
    // default-CRS fungerer uden proj4.
    const DATAFORSYNINGEN_TOKEN = '1ed09b52ec33567e762a62a31f8b5411';

    const initMap = (lat, lon) => {
        map = L.map(fields.mapContainer).setView([lat, lon], 17);

        // TRANSPARENT skal være streng-værdien 'TRUE' eller 'FALSE' — service-
        // valideringen er case-sensitiv og afviser JS-boolean'ens 'false'-form.
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

    // Vis luftfoto for valgt adresse. Initialiserer kortet ved første kald,
    // og genbruger samme instans ved efterfølgende valg (zoom + marker flyttes).
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

    // Tegn matrikelpolygonet som overlay på luftfotoet. Funktionen er
    // idempotent — eksisterende layer fjernes før et nyt tegnes, så over-
    // layet altid matcher den valgte adresse. Når geometri er null (adresse
    // uden jordstykke eller fejlet backend-opslag) ryddes blot eventuelt
    // eksisterende layer uden at tegne nyt. try/catch sikrer at en mal-
    // formet GeoJSON ikke crasher resten af visningen.
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
            // Kommune kommer ikke med i DAWA's autocomplete-svar — kun via det
            // efterfølgende /adgangsadresser-opslag, så vi sætter feltet her.
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
            const data = selected && selected.data ? selected.data : {};
            const adgangsadresseid = data.adgangsadresseid || data.id || '';

            setValue(fields.street, data.vejnavn);
            setValue(fields.houseNumber, data.husnr);
            setValue(fields.floor, data.etage);
            setValue(fields.door, data.dør);
            setValue(fields.postalCode, data.postnr);
            setValue(fields.city, data.postnrnavn);
            // Kommune findes ikke i autocomplete-svaret. Felt ryddes her og
            // fyldes af loadAddressMetadata når /api/dawa/validate svarer.
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
            // Genindlæs ejendomslisten øverst på siden, så den nye ejendom
            // dukker op uden at brugeren skal refreshe.
            if (typeof window.refreshEjendomList === 'function') {
                window.refreshEjendomList();
            }
        } catch (error) {
            if (fields.saveStatus) {
                fields.saveStatus.textContent = error.message;
            }
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
            }
        }
    });
})();
