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
