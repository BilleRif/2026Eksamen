const express = require('express');
const api = express.Router();

// BBR-credentials er hardcoded, så BBR virker uden .env.
const BBR_USERNAME = 'IUNDBKHLFY';
const BBR_PASSWORD = 'Prog-eksamen2026';

const anvendelseskoder = {
    '110': 'Stuehus til landbrugsejendom',
    '120': 'Fritliggende enfamiliehus',
    '121': 'Sammenbygget enfamiliehus',
    '130': 'Række-, kæde- eller dobbelthus',
    '140': 'Etageboligbebyggelse (flerfamiliehus)',
    '150': 'Kollegium',
    '160': 'Døgninstitution',
    '190': 'Anden bygning til helårsbeboelse',
    '510': 'Sommerhus',
    '910': 'Udhus',
    '920': 'Carport',
    '930': 'Garage',
    '940': 'Udestue',
    '950': 'Anneks',
};

const beboelseskoder = ['110', '120', '121', '130', '140', '150', '160', '190'];

// Hjælper: Bygger URL til Datafordeler med credentials.
function bbrUrl(endpoint, queryParam, value) {
    const params = new URLSearchParams({
        [queryParam]: value,
        username: BBR_USERNAME,
        password: BBR_PASSWORD,
        Format: 'JSON'
    });
    return `https://services.datafordeler.dk/BBR/BBRPublic/1/REST/${endpoint}?${params}`;
}

// Genbrugelig helper til eksterne API-kald.
// Timeout gør at siden ikke hænger for evigt, hvis Dataforsyningen/Datafordeler ikke svarer.
async function fetchJson(url) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
        throw new Error(`API svarede med status ${response.status}.`);
    }

    return response.json();
}

// Grundareal hentes via DAWA's jordstykke-endpoint, IKKE via BBR.
// Datafordelers BBR-grund returnerer ikke et arealfelt på vores opslag
// (kun vandforsyning + afløbsforhold). DAWA peger på det matrikulære
// jordstykke, hvor "registreretareal" er det officielle DK-grundareal i m².
async function fetchGrundarealFraDawa(adgangsadresseid) {
    try {
        const adgangsadresse = await fetchJson(
            `https://api.dataforsyningen.dk/adgangsadresser/${encodeURIComponent(adgangsadresseid)}`
        );

        const jordstykkeHref = adgangsadresse?.jordstykke?.href;
        if (!jordstykkeHref) {
            return null;
        }

        const jordstykke = await fetchJson(jordstykkeHref);
        return jordstykke?.registreretareal || null;
    } catch (error) {
        console.error('Kunne ikke hente grundareal fra DAWA:', error.message);
        return null;
    }
}

async function fetchBbrData(adgangsadresseid) {
    const dawaId = adgangsadresseid;

    // Trin 1: Hent alle bygninger via husnummer
    const bygningRes = await fetch(bbrUrl('bygning', 'husnummer', dawaId));
    const bygningData = await bygningRes.json();
    const alleBygninger = Array.isArray(bygningData) ? bygningData : [bygningData];

    // Find hovedbygningen
    const beboelsesBygninger = alleBygninger.filter(b =>
        beboelseskoder.includes(String(b.byg021BygningensAnvendelse || ''))
    );
    const bygning = beboelsesBygninger.length > 0
        ? beboelsesBygninger[0]
        : alleBygninger[0];

    const bygningId = bygning?.id_lokalId || '';

    // Trin 2: Hent enhed (BBR) og grundareal (DAWA-jordstykke) parallelt.
    let enhed = {};
    const [enhedRes, grundareal] = await Promise.all([
        bygningId
            ? fetch(bbrUrl('enhed', 'Bygning', bygningId))
            : Promise.resolve(null),
        fetchGrundarealFraDawa(dawaId)
    ]);

    if (enhedRes && enhedRes.ok) {
        const enhedData = await enhedRes.json();
        enhed = Array.isArray(enhedData) ? enhedData[0] : enhedData;
    }

    const anvendelseskode = String(bygning?.byg021BygningensAnvendelse || '');

    return {
        ejendomstype:   anvendelseskoder[anvendelseskode] || `Kode ${anvendelseskode}` || null,
        byggeaar:       bygning?.['byg026Opførelsesår'] || bygning?.byg026Opfoerelsesaar || null,
        boligareal:     enhed?.enh026EnhedensSamledeAreal || bygning?.byg039BygningensSamledeBoligAreal || null,
        antalVaerelser: enhed?.['enh031AntalVærelser'] || null,
        grundareal:     grundareal || null,
    };
}

// GET /api/bbr?adgangsadresseid=...
api.get('/', async (req, res, next) => {
    const adgangsadresseid = String(req.query.adgangsadresseid || '').trim();

    if (!adgangsadresseid) {
        return res.status(400).json({ error: 'adgangsadresseid mangler.' });
    }

    try {
        const data = await fetchBbrData(adgangsadresseid);
        return res.status(200).json(data);
    } catch (error) {
        error.status = 502;
        error.publicMessage = 'Der opstod en fejl ved hentning af BBR-data.';
        return next(error);
    }
});

module.exports = api;
