// Beregner den månedlige ydelse på et lån.
// 0 % rente håndteres særskilt, så vi undgaar division med nul.
function beregnMånedligYdelse(laanebeloeb, rentePct, loebetidAar, afdragsfriAar = 0) {
    const maaneder = (loebetidAar - afdragsfriAar) * 12;
    const maanedligRente = (rentePct / 100) / 12;

    if (maanedligRente === 0) {
        return laanebeloeb / maaneder;
    }
    return laanebeloeb * maanedligRente / (1 - Math.pow(1 + maanedligRente, -maaneder));
}

module.exports = { beregnMånedligYdelse };
