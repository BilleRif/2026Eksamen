const express = require('express');
const { sql } = require('../Database/database');

// Håndterer koebsomkostninger for en investeringscase
// Én case kan have flere omkostningslinjer (ejendomspris, tinglysning, advokat osv.)

module.exports = function createKøbsomkostningRouter(database) {
    const api = express.Router();

    // Henter alle omkostningslinjer for en case
    api.get('/', async function (req, res, next) {
        const caseId = Number.parseInt(req.query.caseId, 10);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'caseId mangler.' });
        }

        try {
            const rækker = await database.query(`
                SELECT [koebsomkostning_id] AS koebsomkostningId,
                       [case_id]            AS caseId,
                       [beskrivelse],
                       [beloeb]
                FROM [dbo].[Koebsomkostning]
                WHERE [case_id] = @caseId
                ORDER BY [koebsomkostning_id] ASC
            `, [{ name: 'caseId', type: sql.Int, value: caseId }]);

            return res.status(200).json(rækker);
        } catch (error) {
            return next(error);
        }
    });

    // Tilføjer en ny omkostningslinje til en case
    api.post('/', async function (req, res, next) {
        const caseId      = Number.parseInt(req.body.caseId, 10);
        const beskrivelse = String(req.body.beskrivelse || '').trim();
        const beloeb      = Number(req.body.beloeb);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'caseId skal være et positivt heltal.' });
        }
        if (!beskrivelse) {
            return res.status(400).json({ error: 'Beskrivelse mangler.' });
        }
        if (!Number.isFinite(beloeb) || beloeb <= 0) {
            return res.status(400).json({ error: 'Beløb skal være et tal større end 0.' });
        }

        try {
            const rækker = await database.query(`
                INSERT INTO [dbo].[Koebsomkostning] ([case_id],[beskrivelse],[beloeb])
                OUTPUT INSERTED.koebsomkostning_id AS koebsomkostningId,
                       INSERTED.case_id AS caseId,
                       INSERTED.beskrivelse,
                       INSERTED.beloeb
                VALUES (@caseId, @beskrivelse, @beloeb)
            `, [
                { name: 'caseId',      type: sql.Int,           value: caseId },
                { name: 'beskrivelse', type: sql.NVarChar(100), value: beskrivelse },
                { name: 'beloeb',      type: sql.Decimal(18,2), value: beloeb }
            ]);

            return res.status(201).json({
                message: 'Omkostning tilføjet.',
                koebsomkostning: rækker[0]
            });
        } catch (error) {
            return next(error);
        }
    });

    // Sletter én omkostningslinje
    api.delete('/:id', async function (req, res, next) {
        const id = Number.parseInt(req.params.id, 10);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Id skal være et positivt heltal.' });
        }

        try {
            const slettedeRækker = await database.query(`
                DELETE FROM [dbo].[Koebsomkostning]
                OUTPUT DELETED.koebsomkostning_id AS koebsomkostningId
                WHERE [koebsomkostning_id] = @id
            `, [{ name: 'id', type: sql.Int, value: id }]);

            if (slettedeRækker.length === 0) {
                return res.status(404).json({ error: 'Omkostningen blev ikke fundet.' });
            }
            return res.status(200).json({ message: 'Omkostning slettet.' });
        } catch (error) {
            return next(error);
        }
    });

    return { api };
};
