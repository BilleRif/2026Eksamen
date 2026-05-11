const express = require('express');
const { sql } = require('../Database/database');

// Håndterer renoveringer for en investeringscase
// Én case kan have flere renoveringslinjer

module.exports = function createRenoveringRouter(database) {
    const api = express.Router();

    // Henter alle renoveringer for en case
    api.get('/', async function (req, res, next) {
        const caseId = Number.parseInt(req.query.caseId, 10);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'caseId mangler.' });
        }

        try {
            const rows = await database.query(`
                SELECT [renovering_id] AS renoveringId,
                       [case_id]       AS caseId,
                       [beskrivelse],
                       [beloeb],
                       [aar]
                FROM [dbo].[Renovering]
                WHERE [case_id] = @caseId
                ORDER BY [aar] ASC
            `, [{ name: 'caseId', type: sql.Int, value: caseId }]);

            return res.status(200).json(rows);
        } catch (error) {
            return next(error);
        }
    });

    // Tilføjer en ny renovering til en case
    api.post('/', async function (req, res, next) {
        const caseId      = Number.parseInt(req.body.caseId, 10);
        const beskrivelse = String(req.body.beskrivelse || '').trim();
        const beloeb      = Number(req.body.beloeb);
        const aar        = Number.parseInt(req.body.aar, 10);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'caseId skal være et positivt heltal.' });
        }
        if (!beskrivelse) {
            return res.status(400).json({ error: 'Beskrivelse mangler.' });
        }
        if (!Number.isFinite(beloeb) || beloeb <= 0) {
            return res.status(400).json({ error: 'Beløb skal være et tal større end 0.' });
        }
        if (!Number.isInteger(aar) || aar <= 0) {
            return res.status(400).json({ error: 'År skal være et positivt heltal.' });
        }

        try {
            const rows = await database.query(`
                INSERT INTO [dbo].[Renovering] ([case_id],[beskrivelse],[beloeb],[aar])
                OUTPUT INSERTED.renovering_id AS renoveringId,
                       INSERTED.case_id AS caseId,
                       INSERTED.beskrivelse,
                       INSERTED.beloeb,
                       INSERTED.aar
                VALUES (@caseId, @beskrivelse, @beloeb, @aar)
            `, [
                { name: 'caseId',      type: sql.Int,           value: caseId },
                { name: 'beskrivelse', type: sql.NVarChar(100), value: beskrivelse },
                { name: 'beloeb',      type: sql.Decimal(18,2), value: beloeb },
                { name: 'aar',         type: sql.Int,           value: aar }
            ]);

            return res.status(201).json({
                message: 'Renovering tilføjet.',
                renovering: rows[0]
            });
        } catch (error) {
            return next(error);
        }
    });

    // Sletter én renovering
    api.delete('/:id', async function (req, res, next) {
        const id = Number.parseInt(req.params.id, 10);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Id skal være et positivt heltal.' });
        }

        try {
            const deleted = await database.query(`
                DELETE FROM [dbo].[Renovering]
                OUTPUT DELETED.renovering_id AS renoveringId
                WHERE [renovering_id] = @id
            `, [{ name: 'id', type: sql.Int, value: id }]);

            if (deleted.length === 0) {
                return res.status(404).json({ error: 'Renoveringen blev ikke fundet.' });
            }
            return res.status(200).json({ message: 'Renovering slettet.' });
        } catch (error) {
            return next(error);
        }
    });

    return { api };
};
