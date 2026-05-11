// Unit tests — ejendomsValidering (input-håndtering for /api/ejendom)
//
// Hvorfor er denne unit kritisk?
// validerEjendom + normaliserEjendomsPayload er det første led mellem rå
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
    normaliserEjendomsPayload,
    validerEjendom
} = require('../../Code/Models/ejendomsValidering');

test('validerEjendom: returnerer null for fuldt udfyldt adresse', () => {
    const ejendom = normaliserEjendomsPayload({
        vejnavn: 'Solbjerg Plads',
        husnummer: '3',
        postnummer: '2000',
        bynavn: 'Frederiksberg'
    });
    assert.equal(validerEjendom(ejendom), null);
});

test('validerEjendom: returnerer fejlbesked for manglende vejnavn', () => {
    const ejendom = normaliserEjendomsPayload({
        vejnavn: '',
        husnummer: '3',
        postnummer: '2000',
        bynavn: 'Frederiksberg'
    });
    assert.equal(validerEjendom(ejendom), 'Vejnavn mangler.');
});

test('normaliserEjendomsPayload: trimmer whitespace og konverterer tal-felter', () => {
    const resultat = normaliserEjendomsPayload({
        vejnavn:    '  Solbjerg Plads  ',
        husnummer:  ' 3 ',
        postnummer: '2000',
        bynavn:     'Frederiksberg',
        byggeaar:   '1929',          // String fra HTTP body
        boligareal: '85.5',
        antalVaerelser: '4'
    });
    assert.equal(resultat.vejnavn, 'Solbjerg Plads');
    assert.equal(resultat.husnummer, '3');
    assert.equal(resultat.byggeaar, 1929);
    assert.equal(resultat.boligareal, 85.5);
    assert.equal(resultat.antalVaerelser, 4);
    // Felter der ikke blev sendt skal være null (ikke undefined eller NaN)
    assert.equal(resultat.grundareal, null);
});
