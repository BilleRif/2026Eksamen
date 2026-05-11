const express = require('express');
const { sql } = require('../Database/database');

// Håndterer udlejningsdata for en investeringscase
// Én case har én udlejningsrække (månedlig leje og udgift)
// Samme mønster som finansiering.js

module.exports = function createUdlejningRouter(database) {
    const api = express.Router();

    // GET /api/udlejning?caseId=X
    // Henter udlejningsdata for en case
    api.get('/', async function (req, res, next) {
        const caseId = Number.parseInt(req.query.caseId, 10);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'caseId mangler.' });
        }

        try {
            const rows = await database.query(`
                SELECT [udlejning_id]      AS udlejningId,
                       [case_id]           AS caseId,
                       [maanedlig_leje]    AS maanedligLeje,
                       [maanedlig_udgift]  AS maanedligUdgift
                FROM [dbo].[Udlejning]
                WHERE [case_id] = @caseId
            `, [{ name: 'caseId', type: sql.Int, value: caseId }]);

            return res.status(200).json(rows[0] || null);
        } catch (error) {
            return next(error);
        }
    });

    // POST /api/udlejning
    // Upsert: gemmer eller opdaterer udlejningsdata for en case.
    // Casen har 0..1 udlejningsrækker (UNIQUE(case_id) i skemaet), så vi tjekker
    // om der allerede findes en før vi vælger INSERT eller UPDATE. Det giver
    // brugeren én knap i UI'et, der "Gemmer udlejning" uafhængigt af om casen
    // havde data i forvejen.
    api.post('/', async function (req, res, next) {
        const caseId          = Number.parseInt(req.body.caseId, 10);
        const maanedligLeje   = Number(req.body.maanedligLeje);
        const maanedligUdgift = Number(req.body.maanedligUdgift ?? 0);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'caseId skal være et positivt heltal.' });
        }
        if (!Number.isFinite(maanedligLeje) || maanedligLeje <= 0) {
            return res.status(400).json({ error: 'Månedlig leje skal være et tal større end 0.' });
        }
        if (!Number.isFinite(maanedligUdgift) || maanedligUdgift < 0) {
            return res.status(400).json({ error: 'Månedlig udgift skal være et tal ≥ 0.' });
        }

        try {
            const eksisterer = await database.query(`
                SELECT [udlejning_id] AS id
                FROM [dbo].[Udlejning]
                WHERE [case_id] = @caseId
            `, [{ name: 'caseId', type: sql.Int, value: caseId }]);

            const params = [
                { name: 'caseId',          type: sql.Int,           value: caseId },
                { name: 'maanedligLeje',   type: sql.Decimal(18,2), value: maanedligLeje },
                { name: 'maanedligUdgift', type: sql.Decimal(18,2), value: maanedligUdgift }
            ];

            if (eksisterer.length > 0) {
                const opdateret = await database.query(`
                    UPDATE [dbo].[Udlejning]
                    SET [maanedlig_leje]   = @maanedligLeje,
                        [maanedlig_udgift] = @maanedligUdgift
                    OUTPUT INSERTED.udlejning_id      AS udlejningId,
                           INSERTED.case_id           AS caseId,
                           INSERTED.maanedlig_leje    AS maanedligLeje,
                           INSERTED.maanedlig_udgift  AS maanedligUdgift
                    WHERE [case_id] = @caseId
                `, params);
                return res.status(200).json({
                    message: 'Udlejning opdateret.',
                    udlejning: opdateret[0]
                });
            }

            const oprettet = await database.query(`
                INSERT INTO [dbo].[Udlejning] ([case_id],[maanedlig_leje],[maanedlig_udgift])
                OUTPUT INSERTED.udlejning_id     AS udlejningId,
                       INSERTED.case_id          AS caseId,
                       INSERTED.maanedlig_leje   AS maanedligLeje,
                       INSERTED.maanedlig_udgift AS maanedligUdgift
                VALUES (@caseId, @maanedligLeje, @maanedligUdgift)
            `, params);

            return res.status(201).json({
                message: 'Udlejning gemt.',
                udlejning: oprettet[0]
            });
        } catch (error) {
            return next(error);
        }
    });

    return { api };
};