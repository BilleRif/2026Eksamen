const express = require('express');
const { sql } = require('../Database/database');
const { PropertyValidator } = require('../Models/ejendomValidator');

// Én delt validator-instans pr. proces. Validatoren er stateless,
// så det er sikkert at genbruge på tværs af requests.
const propertyValidator = new PropertyValidator();

// Vi henter altid case-count med, så frontend kan vise "antal tilknyttede
// investeringscases" uden et ekstra API-kald per ejendom. COALESCE bruges
// fordi subquery'en returnerer NULL for ejendomme uden cases, og frontend
// skal kunne læse 0 som tal.
const ejendomSelectColumns = `
    e.[ejendom_id]      AS ejendomId,
    e.[vejnavn],
    e.[husnummer],
    e.[postnummer],
    e.[bynavn],
    e.[bbr_id]          AS bbrId,
    e.[ejendomstype],
    e.[byggeaar],
    e.[boligareal_m2]   AS boligareal,
    e.[antal_vaerelser] AS antalVaerelser,
    e.[grundareal_m2]   AS grundareal,
    e.[oprettet]        AS createdAt,
    e.[sidst_opdateret] AS sidstOpdateret,
    e.[arkiveret]       AS arkiveret,
    COALESCE((SELECT COUNT(*) FROM [dbo].[InvesteringsCase] c
              WHERE c.[ejendom_id] = e.[ejendom_id]), 0) AS antalCases
`;

function parseEjendomId(value) {
    const ejendomId = Number.parseInt(value, 10);
    return Number.isInteger(ejendomId) && ejendomId > 0 ? ejendomId : null;
}

module.exports = function createEjendomRouter(database) {
    const page = express.Router();
    const api = express.Router();

    page.get('/', (req, res) => {
        res.render('ejendomme', { title: 'Opret ejendom' });
    });

    // GET /api/ejendom
    // Query-parameter `?includeArkiveret=false` skjuler arkiverede ejendomme.
    // Bruges af case-oprettelses-dropdown'en, hvor man ikke skal kunne vælge
    // en arkiveret ejendom. Listen på ejendomssiden viser dem alle.
    api.get('/', async (req, res, next) => {
        const includeArkiveret = req.query.includeArkiveret !== 'false';
        try {
            const where = includeArkiveret ? '' : 'WHERE e.[arkiveret] = 0';
            const ejendomme = await database.query(`
                SELECT ${ejendomSelectColumns}
                FROM [dbo].[Ejendom] e
                ${where}
                ORDER BY e.[arkiveret] ASC, e.[ejendom_id] DESC
            `);
            return res.status(200).json(ejendomme);
        } catch (error) {
            return next(error);
        }
    });

    // GET /api/ejendom/:id
    api.get('/:id', async (req, res, next) => {
        const ejendomId = parseEjendomId(req.params.id);
        if (!ejendomId) {
            return res.status(400).json({ error: 'Ejendoms-id skal være et positivt heltal.' });
        }

        try {
            const rows = await database.query(`
                SELECT ${ejendomSelectColumns}
                FROM [dbo].[Ejendom] e
                WHERE e.[ejendom_id] = @ejendomId
            `, [{ name: 'ejendomId', type: sql.Int, value: ejendomId }]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Ejendommen blev ikke fundet.' });
            }
            return res.status(200).json(rows[0]);
        } catch (error) {
            return next(error);
        }
    });

    // POST /api/ejendom
    api.post('/', async (req, res, next) => {
        const property = propertyValidator.normalize(req.body);
        const validationError = propertyValidator.validate(property);
        if (validationError) return res.status(400).json({ error: validationError });

        try {
            const rows = await database.query(`
                INSERT INTO [dbo].[Ejendom] (
                    [vejnavn],[husnummer],[postnummer],[bynavn],[bbr_id],
                    [ejendomstype],[byggeaar],[boligareal_m2],[antal_vaerelser],[grundareal_m2]
                )
                OUTPUT INSERTED.ejendom_id, INSERTED.oprettet
                VALUES (
                    @vejnavn,@husnummer,@postnummer,@bynavn,@bbrId,
                    @ejendomstype,@byggeaar,@boligareal,@antalVaerelser,@grundareal
                )
            `, [
                { name: 'vejnavn',        type: sql.NVarChar(100), value: property.vejnavn },
                { name: 'husnummer',      type: sql.NVarChar(20),  value: property.husnummer },
                { name: 'postnummer',     type: sql.NVarChar(10),  value: property.postnummer },
                { name: 'bynavn',         type: sql.NVarChar(100), value: property.bynavn },
                { name: 'bbrId',          type: sql.NVarChar(50),  value: property.bbrId          || null },
                { name: 'ejendomstype',   type: sql.NVarChar(100), value: property.ejendomstype   || null },
                { name: 'byggeaar',       type: sql.Int,           value: property.byggeaar       || null },
                { name: 'boligareal',     type: sql.Decimal(10,2), value: property.boligareal     || null },
                { name: 'antalVaerelser', type: sql.Int,           value: property.antalVaerelser || null },
                { name: 'grundareal',     type: sql.Decimal(10,2), value: property.grundareal     || null },
            ]);

            return res.status(201).json({
                message:   'Ejendommen blev gemt.',
                ejendomId: rows[0].ejendom_id,
                createdAt: rows[0].oprettet
            });
        } catch (error) {
            return next(error);
        }
    });

    // PUT /api/ejendom/:id
    api.put('/:id', async (req, res, next) => {
        const ejendomId = parseEjendomId(req.params.id);
        const property = propertyValidator.normalize(req.body);
        const validationError = propertyValidator.validate(property);
        if (!ejendomId) return res.status(400).json({ error: 'Ejendoms-id skal være et positivt heltal.' });
        if (validationError) return res.status(400).json({ error: validationError });

        try {
            // sidst_opdateret sættes til nu, fordi PUT kun bruges, når brugeren
            // har genindhentet adresse-/BBR-data og ønsker en frisk profil.
            const rows = await database.query(`
                UPDATE [dbo].[Ejendom]
                SET
                    [vejnavn]         = @vejnavn,
                    [husnummer]       = @husnummer,
                    [postnummer]      = @postnummer,
                    [bynavn]          = @bynavn,
                    [bbr_id]          = @bbrId,
                    [ejendomstype]    = @ejendomstype,
                    [byggeaar]        = @byggeaar,
                    [boligareal_m2]   = @boligareal,
                    [antal_vaerelser] = @antalVaerelser,
                    [grundareal_m2]   = @grundareal,
                    [sidst_opdateret] = SYSDATETIME()
                OUTPUT
                    INSERTED.ejendom_id      AS ejendomId,
                    INSERTED.oprettet        AS createdAt,
                    INSERTED.sidst_opdateret AS sidstOpdateret
                WHERE [ejendom_id] = @ejendomId
            `, [
                { name: 'ejendomId',      type: sql.Int,           value: ejendomId },
                { name: 'vejnavn',        type: sql.NVarChar(100), value: property.vejnavn },
                { name: 'husnummer',      type: sql.NVarChar(20),  value: property.husnummer },
                { name: 'postnummer',     type: sql.NVarChar(10),  value: property.postnummer },
                { name: 'bynavn',         type: sql.NVarChar(100), value: property.bynavn },
                { name: 'bbrId',          type: sql.NVarChar(50),  value: property.bbrId          || null },
                { name: 'ejendomstype',   type: sql.NVarChar(100), value: property.ejendomstype   || null },
                { name: 'byggeaar',       type: sql.Int,           value: property.byggeaar       || null },
                { name: 'boligareal',     type: sql.Decimal(10,2), value: property.boligareal     || null },
                { name: 'antalVaerelser', type: sql.Int,           value: property.antalVaerelser || null },
                { name: 'grundareal',     type: sql.Decimal(10,2), value: property.grundareal     || null },
            ]);

            if (rows.length === 0) return res.status(404).json({ error: 'Ejendommen blev ikke fundet.' });
            return res.status(200).json({
                message:        'Ejendommen blev opdateret.',
                ejendomId:      rows[0].ejendomId,
                createdAt:      rows[0].createdAt,
                sidstOpdateret: rows[0].sidstOpdateret
            });
        } catch (error) {
            return next(error);
        }
    });

    // PUT /api/ejendom/:id/arkiver
    // Toggle-endpoint for soft-archive. Body: { arkiveret: true | false }.
    // Soft-archive frem for hard delete bevarer historiske investeringscases,
    // så brugeren stadig kan slå op i tidligere analyser uden at miste FK-integritet.
    api.put('/:id/arkiver', async (req, res, next) => {
        const ejendomId = parseEjendomId(req.params.id);
        if (!ejendomId) return res.status(400).json({ error: 'Ejendoms-id skal være et positivt heltal.' });

        const arkiveret = req.body.arkiveret === true || req.body.arkiveret === 'true';

        try {
            const rows = await database.query(`
                UPDATE [dbo].[Ejendom]
                SET [arkiveret] = @arkiveret
                OUTPUT INSERTED.ejendom_id AS ejendomId,
                       INSERTED.arkiveret  AS arkiveret
                WHERE [ejendom_id] = @ejendomId
            `, [
                { name: 'ejendomId', type: sql.Int, value: ejendomId },
                { name: 'arkiveret', type: sql.Bit, value: arkiveret ? 1 : 0 }
            ]);
            if (rows.length === 0) return res.status(404).json({ error: 'Ejendommen blev ikke fundet.' });
            return res.status(200).json({
                message:   arkiveret ? 'Ejendommen blev arkiveret.' : 'Ejendommen blev gendannet.',
                ejendomId: rows[0].ejendomId,
                arkiveret: rows[0].arkiveret
            });
        } catch (error) {
            return next(error);
        }
    });

    // DELETE /api/ejendom/:id
    api.delete('/:id', async (req, res, next) => {
        const ejendomId = parseEjendomId(req.params.id);
        if (!ejendomId) return res.status(400).json({ error: 'Ejendoms-id skal være et positivt heltal.' });

        try {
            const deletedRows = await database.query(`
                DELETE FROM [dbo].[Ejendom]
                OUTPUT DELETED.ejendom_id AS ejendomId
                WHERE [ejendom_id] = @ejendomId
            `, [{ name: 'ejendomId', type: sql.Int, value: ejendomId }]);

            if (deletedRows.length === 0) return res.status(404).json({ error: 'Ejendommen blev ikke fundet.' });
            return res.status(200).json({
                message:   'Ejendommen blev slettet.',
                ejendomId: deletedRows[0].ejendomId
            });
        } catch (error) {
            return next(error);
        }
    });

    return { page, api };
};
