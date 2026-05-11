const express = require('express');
const { sql } = require('../Database/database');
const { beregnMånedligYdelse } = require('../Models/finansieringsBeregner');

module.exports = function createFinansieringRouter(database) {
    const api = express.Router();

    // Henter finansiering for en bestemt case
    api.get('/', async function (req, res, next) {
        const caseId = Number.parseInt(req.query.caseId, 10);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'caseId mangler.' });
        }

        try {
            const rækker = await database.query(`
                SELECT [finansiering_id] AS finansieringId,
                       [case_id]         AS caseId,
                       [laanebeloeb],
                       [rente_pct]       AS rentePct,
                       [loebetid_aar]    AS loebetidAar,
                       [afdragsfri_aar]  AS afdragsfriAar,
                       [laanetype]
                FROM [dbo].[Finansiering]
                WHERE [case_id] = @caseId
            `, [{ name: 'caseId', type: sql.Int, value: caseId }]);

            return res.status(200).json(rækker[0] || null);
        } catch (error) {
            return next(error);
        }
    });

    // Gemmer finansiering. Hvis den findes i forvejen, opdateres den.
    api.post('/', async function (req, res, next) {
        // Formularen sender tekst, så tallene laves om før validering.
        const caseId       = Number.parseInt(req.body.caseId, 10);
        const laanebeloeb  = Number(req.body.laanebeloeb);
        const rentePct     = Number(req.body.rentePct);
        const loebetidAar  = Number.parseInt(req.body.loebetidAar, 10);
        const afdragsfriAar = Number.parseInt(req.body.afdragsfriAar, 10) || 0;
        const laanetype    = String(req.body.laanetype || '').trim();

        // Tjekker tal direkte, så 0 stadig er en gyldig værdi.
        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'caseId skal være et positivt heltal.' });
        }
        if (!Number.isFinite(laanebeloeb) || laanebeloeb < 0) {
            return res.status(400).json({ error: 'Lånebeløb skal være et tal ≥ 0.' });
        }
        if (!Number.isFinite(rentePct) || rentePct < 0) {
            return res.status(400).json({ error: 'Rente (pct) skal være et tal ≥ 0.' });
        }
        if (!Number.isInteger(loebetidAar) || loebetidAar <= 0) {
            return res.status(400).json({ error: 'Løbetid skal være et positivt heltal (år).' });
        }
        if (!Number.isInteger(afdragsfriAar) || afdragsfriAar < 0 || afdragsfriAar > loebetidAar) {
            return res.status(400).json({ error: 'Afdragsfri periode skal være et heltal mellem 0 og løbetiden.' });
        }

        try {
            // De samme parametre bruges både ved oprettelse og opdatering.
            const sqlParametre = [
                { name: 'caseId',        type: sql.Int,           value: caseId },
                { name: 'laanebeloeb',   type: sql.Decimal(18,2), value: laanebeloeb },
                { name: 'rentePct',      type: sql.Decimal(5,3),  value: rentePct },
                { name: 'loebetidAar',   type: sql.Int,           value: loebetidAar },
                { name: 'afdragsfriAar', type: sql.Int,           value: afdragsfriAar },
                { name: 'laanetype',     type: sql.NVarChar(50),  value: laanetype || null }
            ];

            // Der må kun være én finansiering pr. case.
            const eksisterer = await database.query(`
                SELECT [finansiering_id] AS id
                FROM [dbo].[Finansiering]
                WHERE [case_id] = @caseId
            `, [{ name: 'caseId', type: sql.Int, value: caseId }]);

            let finansieringId;
            let opdateret = false;
            if (eksisterer.length > 0) {
                // Hvis casen allerede har finansiering, overskrives den gamle række.
                const rækker = await database.query(`
                    UPDATE [dbo].[Finansiering]
                    SET [laanebeloeb]    = @laanebeloeb,
                        [rente_pct]      = @rentePct,
                        [loebetid_aar]   = @loebetidAar,
                        [afdragsfri_aar] = @afdragsfriAar,
                        [laanetype]      = @laanetype
                    OUTPUT INSERTED.finansiering_id AS finansieringId
                    WHERE [case_id] = @caseId
                `, sqlParametre);
                finansieringId = rækker[0].finansieringId;
                opdateret = true;
            } else {
                // Hvis casen ikke har finansiering endnu, oprettes en ny række.
                const rækker = await database.query(`
                    INSERT INTO [dbo].[Finansiering] (
                        [case_id],[laanebeloeb],[rente_pct],
                        [loebetid_aar],[afdragsfri_aar],[laanetype]
                    )
                    OUTPUT INSERTED.finansiering_id AS finansieringId
                    VALUES (
                        @caseId,@laanebeloeb,@rentePct,
                        @loebetidAar,@afdragsfriAar,@laanetype
                    )
                `, sqlParametre);
                finansieringId = rækker[0].finansieringId;
            }

            // Frontend viser ydelsen med det samme efter gem.
            const maanedligYdelse = beregnMånedligYdelse(laanebeloeb, rentePct, loebetidAar, afdragsfriAar);

            return res.status(opdateret ? 200 : 201).json({
                message: opdateret ? 'Finansiering opdateret.' : 'Finansiering gemt.',
                finansieringId,
                maanedligYdelse: Math.round(maanedligYdelse)
            });
        } catch (error) {
            return next(error);
        }
    });

    return { api };
};
