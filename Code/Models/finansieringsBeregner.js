// Annuitetsformel for månedlig ydelse på et lån.
// Afdragsfrie år trækkes fra løbetiden, da hovedstolen først afdrages
// efter den afdragsfrie periode. 0 % rente håndteres separat for at
// undgå division med nul.
function beregnMaanedligYdelse(laanebeloeb, rentePct, loebetidAar, afdragsfriAar = 0) {
    const maaneder = (loebetidAar - afdragsfriAar) * 12;
    const maanedligRente = (rentePct / 100) / 12;

    if (maanedligRente === 0) {
        return laanebeloeb / maaneder;
    }
    return laanebeloeb * maanedligRente / (1 - Math.pow(1 + maanedligRente, -maaneder));
}

module.exports = { beregnMaanedligYdelse };
