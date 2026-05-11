const express = require('express');
const { sql } = require('../Database/database');

// Håndterer driftsudgifter for en investeringscase
// Én case kan have flere driftsudgifter (forsikring, ejendomsskat osv.)
// Samme mønster som koebsomkostning.js

module.exports = function createDriftsudgiftRouter(database) {
    const api = express.Router();

    // GET /api/driftsudgift?caseId=X
    // Henter alle driftsudgifter for en case
    api.get('/', async function (req, res, next) {
        const caseId = Number.parseInt(req.query.caseId, 10);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'caseId mangler.' });
        }

        try {
            const rows = await database.query(`
                SELECT [driftsudgift_id] AS driftsudgiftId,
                       [case_id]         AS caseId,
                       [navn],
                       [beloeb_maaned]   AS beloebMaaned
                FROM [dbo].[Driftsudgift]
                WHERE [case_id] = @caseId
                ORDER BY [driftsudgift_id] ASC
            `, [{ name: 'caseId', type: sql.Int, value: caseId }]);

            return res.status(200).json(rows);
        } catch (error) {
            return next(error);
        }
    });

    // POST /api/driftsudgift
    // Tilføjer en ny driftsudgift til en case
    api.post('/', async function (req, res, next) {
        const caseId      = Number.parseInt(req.body.caseId, 10);
        const navn        = String(req.body.navn || '').trim();
        const beloebMaaned = Number(req.body.beloebMaaned);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'caseId skal være et positivt heltal.' });
        }
        if (!navn) {
            return res.status(400).json({ error: 'Navn mangler.' });
        }
        if (!Number.isFinite(beloebMaaned) || beloebMaaned <= 0) {
            return res.status(400).json({ error: 'Beløb skal være et tal større end 0.' });
        }

        try {
            const rows = await database.query(`
                INSERT INTO [dbo].[Driftsudgift] ([case_id],[navn],[beloeb_maaned])
                OUTPUT INSERTED.driftsudgift_id AS driftsudgiftId,
                       INSERTED.case_id AS caseId,
                       INSERTED.navn,
                       INSERTED.beloeb_maaned AS beloebMaaned
                VALUES (@caseId, @navn, @beloebMaaned)
            `, [
                { name: 'caseId',       type: sql.Int,           value: caseId },
                { name: 'navn',         type: sql.NVarChar(100), value: navn },
                { name: 'beloebMaaned', type: sql.Decimal(18,2), value: beloebMaaned }
            ]);

            return res.status(201).json({
                message: 'Driftsudgift tilføjet.',
                driftsudgift: rows[0]
            });
        } catch (error) {
            return next(error);
        }
    });

    // DELETE /api/driftsudgift/:id
    // Sletter én driftsudgift
    api.delete('/:id', async function (req, res, next) {
        const id = Number.parseInt(req.params.id, 10);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Id skal være et positivt heltal.' });
        }

        try {
            const deleted = await database.query(`
                DELETE FROM [dbo].[Driftsudgift]
                OUTPUT DELETED.driftsudgift_id AS driftsudgiftId
                WHERE [driftsudgift_id] = @id
            `, [{ name: 'id', type: sql.Int, value: id }]);

            if (deleted.length === 0) {
                return res.status(404).json({ error: 'Driftsudgiften blev ikke fundet.' });
            }
            return res.status(200).json({ message: 'Driftsudgift slettet.' });
        } catch (error) {
            return next(error);
        }
    });

    return { api };
};