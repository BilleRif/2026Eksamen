// Samler oprydning og validering af ejendomsdata.
class PropertyValidator {
    // Adressefelter er obligatoriske. BBR-felter må gerne mangle.
    static REQUIRED_FIELDS = [
        ['vejnavn',    'Vejnavn mangler.'],
        ['husnummer',  'Husnummer mangler.'],
        ['postnummer', 'Postnummer mangler.'],
        ['bynavn',     'Bynavn mangler.'],
    ];

    // Rydder tekstfelter og gør talfelter klar til databasen.
    normalize(body = {}) {
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

    validate(property) {
        const missing = PropertyValidator.REQUIRED_FIELDS.find(([key]) => !property[key]);
        return missing ? missing[1] : null;
    }
}

// Beholder de gamle funktionsnavne, så resten af koden stadig virker.
const _validator = new PropertyValidator();
const normalizePropertyPayload = (body) => _validator.normalize(body);
const validateProperty = (property) => _validator.validate(property);

module.exports = { PropertyValidator, normalizePropertyPayload, validateProperty };
