// Simulerer en investeringscase år for år.
// Renoveringer er valgfrie og trækkes fra i det år, de hører til.
function simulateInvestment(params) {
  const results = [];
  const renovations = Array.isArray(params.renovations) ? params.renovations : [];

  // Startværdier
  let debt = params.loanAmount;        // Restgæld
  let equity = params.initialEquity;   // Egenkapital

  // Loop gennem hvert år i simulationen
  for (let year = 1; year <= params.years; year++) {

    // Beregn renteomkostning på gælden
    const interest = debt * params.interestRate;

    // Fast årligt afdrag på lånet
    const repayment = params.annualRepayment;

    // Årlig lejeindtægt (månedlig * 12)
    const rentalIncome = params.rent * 12;

    // Årlige driftsomkostninger
    const expenses = params.expenses * 12;

    // Renoveringer i dette år
    const renovation = renovations
      .filter(r => Number(r.aar) === year)
      .reduce((sum, r) => sum + Number(r.beloeb), 0);

    // Cashflow: indtægter - alle udgifter (drift, rente, afdrag, renovering)
    const cashflow = rentalIncome - expenses - interest - repayment - renovation;

    // Opdater gæld (kan ikke gå under 0)
    debt = Math.max(0, debt - repayment);

    // Opdater egenkapital med årets resultat og afdrag.
    equity += cashflow + repayment;

    // Gem resultat for året
    results.push({
      year: year,
      equity: Math.round(equity),
      cashflow: Math.round(cashflow),
      debt: Math.round(debt),
    });
  }

  return results;
}

module.exports = { simulateInvestment };
