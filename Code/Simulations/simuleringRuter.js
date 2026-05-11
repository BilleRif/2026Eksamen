const express = require("express");
const router = express.Router();

const { simulateInvestment } = require("./simuleringBeregner");

// Tal som simulationen kræver. 0 må gerne være en gyldig værdi.
const NUMERIC_FIELDS = [
    'loanAmount',
    'initialEquity',
    'interestRate',
    'annualRepayment',
    'rent',
    'expenses'
];

// Beregner udviklingen for en case.
router.post("/simulate", (req, res, next) => {
    try {
        // Frontend sender alle simuleringsværdier i request body.
        const params = req.body || {};

        // De vigtigste felter skal kunne laves om til tal.
        for (const key of NUMERIC_FIELDS) {
            const value = Number(params[key]);
            if (!Number.isFinite(value)) {
                return res.status(400).json({
                    error: `${key} skal være et tal.`
                });
            }
        }

        // Antal år styrer hvor mange rækker simulationen returnerer.
        const years = Number.parseInt(params.years, 10);
        if (!Number.isInteger(years) || years <= 0) {
            return res.status(400).json({
                error: 'years skal være et positivt heltal.'
            });
        }

        // Renoveringer er valgfrie, men hvis de sendes, skal de være en liste.
        if (params.renovations !== undefined && !Array.isArray(params.renovations)) {
            return res.status(400).json({
                error: 'renovations skal være et array.'
            });
        }

        // Selve beregningen ligger i simuleringBeregner, så routen kun validerer input.
        const result = simulateInvestment(params);
        res.json(result);
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
