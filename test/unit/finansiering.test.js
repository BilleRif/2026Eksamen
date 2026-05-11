// Unit tests — beregnMaanedligYdelse (annuitetsformel)
//
// Hvorfor er denne unit kritisk?
// Funktionen bruges hver gang en bruger gemmer finansiering i en case og
// driver den månedlige ydelse, der vises i UI'et og indgår i renteberegningen
// i 30-års simulationen. En bug her forplanter sig direkte til alle nøgletal,
// brugeren tager beslutninger ud fra. Derfor verificerer vi:
//   - Korrekt resultat for et standardlån (kendt facit fra annuitetsformlen)
//   - Edge case: rente = 0% → lineær fordeling, ikke division med nul
//   - Edge case: afdragsfri periode forkorter den effektive løbetid
//
// Testene bruger Node's indbyggede testløber (`node:test`), så vi undgår
// at trække Jest ind som dependency.

const test = require('node:test');
const assert = require('node:assert/strict');

const { beregnMaanedligYdelse } = require('../../Code/Models/finansieringsBeregner');

test('beregnMaanedligYdelse: standardlån (2M, 4%, 30 år) ≈ 9.548 kr', () => {
    // Facit fra annuitetsformlen: P * r / (1 - (1+r)^-n)
    // P = 2.000.000, r = 0,04/12 ≈ 0,003333, n = 360 → ≈ 9.548,31
    const ydelse = beregnMaanedligYdelse(2000000, 4, 30, 0);
    assert.ok(Math.abs(ydelse - 9548.31) < 0.5, `Forventede ~9548.31, fik ${ydelse}`);
});

test('beregnMaanedligYdelse: 0% rente fordeler lånet ligeligt', () => {
    // Med 0% rente skal funktionen ikke kaste division-by-zero, men returnere
    // P / n. 1.200.000 / (10*12) = 10.000.
    const ydelse = beregnMaanedligYdelse(1200000, 0, 10, 0);
    assert.equal(ydelse, 10_000);
});

test('beregnMaanedligYdelse: afdragsfri periode forkorter afviklingsperioden', () => {
    // Hvis 5 af 30 år er afdragsfrie, skal lånet afdrages over 25 år.
    // Det betyder højere månedlig ydelse end et tilsvarende fuldt 30-årigt lån.
    const med = beregnMaanedligYdelse(2000000, 4, 30, 5);
    const uden = beregnMaanedligYdelse(2000000, 4, 30, 0);
    assert.ok(med > uden, 'Afdragsfri skal give højere månedlig ydelse i afviklingsfasen');
});
