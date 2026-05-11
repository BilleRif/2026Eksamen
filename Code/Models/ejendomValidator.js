// PropertyValidator samler input-håndteringen for ejendomsprofiler i én klasse:
//   - normalize(): trimmer strenge og konverterer tal-felter til Number/null
//   - validate(): returnerer en fejlbesked hvis et obligatorisk adressefelt mangler
//
// Klassen bruges af /api/ejendom-routeren før hver INSERT/UPDATE og er en del af
// vores OO-struktur sammen med Database (krav: meningsfulde klasser med
// tilhørende metoder).
class PropertyValidator {
    // Kun adressefelterne er obligatoriske — BBR-felter (byggeår, areal m.v.)
    // kan mangle for nyere ejendomme uden registreret data.
    static REQUIRED_FIELDS = [
        ['vejnavn',    'Vejnavn mangler.'],
        ['husnummer',  'Husnummer mangler.'],
        ['postnummer', 'Postnummer mangler.'],
        ['bynavn',     'Bynavn mangler.'],
    ];

    // Tomme strenge beholdes så validate() kan fange dem som "mangler".
    // Tal-felter bliver Number eller null, så SQL-laget får rene typer.
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

// Funktionelle wrappers — bevares så eksisterende unit tests og routes kan
// importere dem uden ændringer. Begge peger på samme delte instans.
const _validator = new PropertyValidator();
const normalizePropertyPayload = (body) => _validator.normalize(body);
const validateProperty = (property) => _validator.validate(property);

module.exports = { PropertyValidator, normalizePropertyPayload, validateProperty };
