const express = require('express');
const api = express.Router();

async function fetchDataforsyningen(pathname) {
    const response = await fetch(`https://api.dataforsyningen.dk${pathname}`, {
        signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
        const error = new Error(`Dataforsyningen svarede med status ${response.status}.`);
        error.status = response.status;
        throw error;
    }

    return response.json();
}

// Henter matriklens geometri til kortet.
// Hvis opslaget fejler, vises kortet bare uden matrikel.
async function fetchJordstykkeGeometri(href) {
    try {
        const response = await fetch(`${href}?format=geojson&srid=4326`, {
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) {
            return null;
        }
        const feature = await response.json();
        return feature?.geometry || null;
    } catch (error) {
        console.error('Kunne ikke hente jordstykke-geometri:', error.message);
        return null;
    }
}

// Henter adresseoplysninger og geometri til BBR-opslag og kort.
api.get('/validate', async (req, res, next) => {
    const adgangsadresseid = String(req.query.adgangsadresseid || '').trim();

    if (!adgangsadresseid) {
        return res.status(400).json({ error: 'adgangsadresseid mangler.' });
    }

    try {
        const result = await fetchDataforsyningen(
            `/adgangsadresser/${encodeURIComponent(adgangsadresseid)}`
        );

        // Nogle adresser har ikke et jordstykke, så geometri kan være tom.
        const geometri = result.jordstykke?.href
            ? await fetchJordstykkeGeometri(result.jordstykke.href)
            : null;

        return res.status(200).json({
            gyldig:            true,
            adgangsadresseid:  result.id,
            adressebetegnelse: result.adressebetegnelse,
            kommune:           result.kommune?.navn || '',
            region:            result.region?.navn || '',
            postnummer:        result.postnummer?.nr || '',
            postnummerNavn:    result.postnummer?.navn || '',
            matrikelnr:        result.jordstykke?.matrikelnr || result.matrikelnr || '',
            ejerlav:           result.jordstykke?.ejerlav?.navn || result.ejerlav?.navn || '',
            esrEjendomsnr:     result.jordstykke?.esrejendomsnr || result.esrejendomsnr || '',
            koordinater:       Array.isArray(result.adgangspunkt?.koordinater)
                                   ? result.adgangspunkt.koordinater
                                   : [],
            geometri
        });

    } catch (error) {
        error.status = error.status === 404 ? 404 : 502;
        error.publicMessage = error.status === 404
            ? 'Adressen er ikke gyldig.'
            : 'Der opstod en fejl ved validering af adressen.';
        return next(error);
    }
});

module.exports = api;
