// Unit tests — ejendomValidator (input-håndtering for /api/ejendom)
//
// Hvorfor er denne unit kritisk?
// validateProperty + normalizePropertyPayload er det første led mellem rå
// input fra brugeren (DAWA + manuelle felter) og databasen. Hvis valideringen
// fejler, kan ufuldstændige ejendomsrækker havne i databasen og senere
// blokere for, at investeringscases kan oprettes ovenpå dem. Vi tester:
//   - Tomme/manglende felter fanges med en præcis fejlbesked
//   - Whitespace omkring felter trimmes (vigtigt fordi DAWA kan returnere
//     adressedele med trailing space)
//   - Numeriske BBR-felter konverteres korrekt fra strenge til Number

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizePropertyPayload,
    validateProperty
} = require('../../Code/Models/ejendomValidator');

test('validateProperty: returnerer null for fuldt udfyldt adresse', () => {
    const property = normalizePropertyPayload({
        vejnavn: 'Solbjerg Plads',
        husnummer: '3',
        postnummer: '2000',
        bynavn: 'Frederiksberg'
    });
    assert.equal(validateProperty(property), null);
});

test('validateProperty: returnerer fejlbesked for manglende vejnavn', () => {
    const property = normalizePropertyPayload({
        vejnavn: '',
        husnummer: '3',
        postnummer: '2000',
        bynavn: 'Frederiksberg'
    });
    assert.equal(validateProperty(property), 'Vejnavn mangler.');
});

test('normalizePropertyPayload: trimmer whitespace og konverterer tal-felter', () => {
    const result = normalizePropertyPayload({
        vejnavn:    '  Solbjerg Plads  ',
        husnummer:  ' 3 ',
        postnummer: '2000',
        bynavn:     'Frederiksberg',
        byggeaar:   '1929',          // String fra HTTP body
        boligareal: '85.5',
        antalVaerelser: '4'
    });
    assert.equal(result.vejnavn, 'Solbjerg Plads');
    assert.equal(result.husnummer, '3');
    assert.equal(result.byggeaar, 1929);
    assert.equal(result.boligareal, 85.5);
    assert.equal(result.antalVaerelser, 4);
    // Felter der ikke blev sendt skal være null (ikke undefined eller NaN)
    assert.equal(result.grundareal, null);
});
