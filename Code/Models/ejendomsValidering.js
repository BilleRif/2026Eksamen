// Samler oprydning og validering af ejendomsdata.
class EjendomsValidering {
    // Adressefelter er obligatoriske. BBR-felter må gerne mangle.
    static PÅKRÆVEDE_FELTER = [
        ['vejnavn',    'Vejnavn mangler.'],
        ['husnummer',  'Husnummer mangler.'],
        ['postnummer', 'Postnummer mangler.'],
        ['bynavn',     'Bynavn mangler.'],
    ];

    // Rydder tekstfelter og gør talfelter klar til databasen.
    normaliser(body = {}) {
        return {
            vejnavn:        String(body.vejnavn        || '').trim(),
            husnummer:      String(body.husnummer      || '').trim(),
            postnummer:     String(body.postnummer     || '').trim(),
            bynavn:         String(body.bynavn         || '').trim(),
            bbrId:          String(body.bbrId          || '').trim(),
            ejendomstype:   String(body.ejendomstype   || '').trim(),
            byggeaar:       body.byggeaar       ? Number(body.byggeaar)       : null,
            boligareal:     body.boligareal     ? Number(body.boligareal)     : null,
            antalVaerelser: body.antalVaerelser ? Number(body.antalVaerelser) : null,
            grundareal:     body.grundareal     ? Number(body.grundareal)     : null,
        };
    }

    valider(ejendom) {
        const manglendeFelt = EjendomsValidering.PÅKRÆVEDE_FELTER.find(([felt]) => !ejendom[felt]);
        return manglendeFelt ? manglendeFelt[1] : null;
    }
}

const validering = new EjendomsValidering();
const normaliserEjendomsPayload = (body) => validering.normaliser(body);
const validerEjendom = (ejendom) => validering.valider(ejendom);

module.exports = {
    EjendomsValidering,
    normaliserEjendomsPayload,
    validerEjendom
};
