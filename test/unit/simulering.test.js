// Unit tests — simulateInvestment (30-års cashflow-simulation)
//
// Hvorfor er denne unit kritisk?
// simulateInvestment driver hele visualiseringen brugeren ser efter at have
// udfyldt en case. Hvis loop-logikken (rente på faldende gæld, afdrag der
// reducerer gæld men øger egenkapital, cashflow = indtægt - omkostninger -
// rente - afdrag) er forkert, er hele simulationsbilledet vildledende.
//
// Vi tester invarianter snarere end specifikke kr-beloeb, fordi det er de
// strukturelle egenskaber, der bestemmer om grafen er korrekt:
//   - Output har præcis params.years rækker
//   - Gæld er monotont faldende (eller konstant 0 efter fuldt afdrag)
//   - Gæld kan aldrig blive negativ, selv hvis afdrag overstiger restgæld

const test = require('node:test');
const assert = require('node:assert/strict');

const { simulateInvestment } = require('../../Code/Simulations/simuleringBeregner');

const baseParams = {
    loanAmount:      1000000,
    initialEquity:   200000,
    interestRate:    0.04,
    annualRepayment: 30000,
    rent:            10000,
    expenses:        2000,
    years:           30
};

test('simulateInvestment: returnerer præcis params.years rækker', () => {
    const result = simulateInvestment(baseParams);
    assert.equal(result.length, 30);
    assert.equal(result[0].year, 1);
    assert.equal(result[29].year, 30);
});

test('simulateInvestment: gæld er monotont ikke-stigende', () => {
    const result = simulateInvestment(baseParams);
    for (let i = 1; i < result.length; i++) {
        assert.ok(
            result[i].debt <= result[i - 1].debt,
            `Gæld steg mellem år ${result[i - 1].year} (${result[i - 1].debt}) og år ${result[i].year} (${result[i].debt})`
        );
    }
});

test('simulateInvestment: gæld gaar aldrig under 0 selv ved meget højt afdrag', () => {
    // Med årligt afdrag på 200.000 og kun 100.000 i lån skulle gælden være
    // 0 efter første år, ikke -100.000. Dette tester Math.max(0, ...) clampen.
    const result = simulateInvestment({
        ...baseParams,
        loanAmount: 100000,
        annualRepayment: 200000,
        years: 5
    });
    result.forEach(r => {
        assert.ok(r.debt >= 0, `År ${r.year}: gæld = ${r.debt} er negativ`);
    });
    assert.equal(result[result.length - 1].debt, 0);
});
