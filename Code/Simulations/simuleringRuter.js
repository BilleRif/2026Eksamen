const express = require("express");
const router = express.Router();

const { simulateInvestment } = require("./simuleringBeregner");

// Numeriske parametre simulationen forventer. Alle skal være endelige tal
// (ikke NaN/Infinity). Vi bruger Number.isFinite + eksplicitte range-checks
// fremfor falsy-checks fordi 0 er en legitim værdi for flere af felterne
// (fx initialEquity hvis køb finansieres 100% via lån, eller interestRate
// ved en 0%-rente-case).
const NUMERIC_FIELDS = [
    'loanAmount',
    'initialEquity',
    'interestRate',
    'annualRepayment',
    'rent',
    'expenses'
];

// POST /simulate — modtager case-parametre fra frontend og returnerer
// 30-års forløb (egenkapital, cashflow, restgæld) som JSON.
router.post("/simulate", (req, res, next) => {
    try {
        const params = req.body || {};

        for (const key of NUMERIC_FIELDS) {
            const value = Number(params[key]);
            if (!Number.isFinite(value)) {
                return res.status(400).json({
                    error: `${key} skal være et tal.`
                });
            }
        }

        const years = Number.parseInt(params.years, 10);
        if (!Number.isInteger(years) || years <= 0) {
            return res.status(400).json({
                error: 'years skal være et positivt heltal.'
            });
        }

        if (params.renovations !== undefined && !Array.isArray(params.renovations)) {
            return res.status(400).json({
                error: 'renovations skal være et array.'
            });
        }

        const result = simulateInvestment(params);
        res.json(result);
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
