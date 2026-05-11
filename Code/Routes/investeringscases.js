const express = require('express');
const { sql } = require('../Database/database');

const caseSelectColumns = `
    [case_id]     AS caseId,
    [ejendom_id]  AS ejendomId,
    [navn],
    [beskrivelse],
    [oprettet]    AS createdAt
`;

function normalizePayload(body) {
    return {
        ejendomId: Number.parseInt(body.ejendomId, 10),
        navn: String(body.navn || '').trim(),
        beskrivelse: String(body.beskrivelse || '').trim()
    };
}

function validateCase(data) {
    if (!Number.isInteger(data.ejendomId) || data.ejendomId <= 0) {
        return 'Ejendoms-id skal være et positivt heltal.';
    }
    if (!data.navn) {
        return 'Navn på investeringscase mangler.';
    }
    if (data.navn.length > 100) {
        return 'Navnet må maksimalt være 100 tegn.';
    }
    return null;
}

module.exports = function createInvestmentCasesRouter(database) {
    const api = express.Router();
    const page = express.Router();

    page.get('/', (req, res) => {
        res.render('investeringscases', { title: 'Investeringscases' });
    });
    // '/compare' skal ligge FØR '/:id', så Express ikke fanger 'compare' som et id.
    page.get('/compare', (req, res) => {
        res.render('sammenlignInvesteringscases', { title: 'Sammenlign cases' });
    });
    page.get('/:id', (req, res) => {
        const caseId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).send('Ugyldigt case-id.');
        }
        res.render('investeringscaseDetalje', { title: 'Investeringscase', caseId });
    });

    // GET /api/investment-cases
    // Henter alle investeringscases
    api.get('/', async function (req, res, next) {
        try {
            const cases = await database.query(`
                SELECT ${caseSelectColumns}
                FROM [dbo].[InvesteringsCase]
                ORDER BY [case_id] DESC
            `);
            return res.status(200).json(cases);
        } catch (error) {
            return next(error);
        }
    });

    // GET /api/investment-cases/:id
    // Henter én bestemt investeringscase
    api.get('/:id', async function (req, res, next) {
        const caseId = Number.parseInt(req.params.id, 10);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'Case-id skal være et positivt heltal.' });
        }

        try {
            const rows = await database.query(`
                SELECT ${caseSelectColumns}
                FROM [dbo].[InvesteringsCase]
                WHERE [case_id] = @caseId
            `, [{ name: 'caseId', type: sql.Int, value: caseId }]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Casen blev ikke fundet.' });
            }
            return res.status(200).json(rows[0]);
        } catch (error) {
            return next(error);
        }
    });

    // POST /api/investment-cases
    // Opretter en ny investeringscase for en eksisterende ejendom
    api.post('/', async function (req, res, next) {
        const data = normalizePayload(req.body);
        const validationError = validateCase(data);

        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

        try {
            // Tjek at ejendommen findes
            const ejendomRows = await database.query(`
                SELECT [ejendom_id] FROM [dbo].[Ejendom]
                WHERE [ejendom_id] = @ejendomId
            `, [{ name: 'ejendomId', type: sql.Int, value: data.ejendomId }]);

            if (ejendomRows.length === 0) {
                return res.status(404).json({ error: 'Ejendommen blev ikke fundet.' });
            }

            // Tjek at der ikke allerede findes en case med samme navn
            const existing = await database.query(`
                SELECT [case_id] FROM [dbo].[InvesteringsCase]
                WHERE [ejendom_id] = @ejendomId AND [navn] = @navn
            `, [
                { name: 'ejendomId', type: sql.Int, value: data.ejendomId },
                { name: 'navn', type: sql.NVarChar(100), value: data.navn }
            ]);

            if (existing.length > 0) {
                return res.status(400).json({ error: 'Der findes allerede en case med dette navn for ejendommen.' });
            }

            const rows = await database.query(`
                INSERT INTO [dbo].[InvesteringsCase] ([ejendom_id],[navn],[beskrivelse])
                OUTPUT INSERTED.case_id AS caseId,
                       INSERTED.ejendom_id AS ejendomId,
                       INSERTED.navn,
                       INSERTED.beskrivelse,
                       INSERTED.oprettet AS createdAt
                VALUES (@ejendomId, @navn, @beskrivelse)
            `, [
                { name: 'ejendomId', type: sql.Int, value: data.ejendomId },
                { name: 'navn', type: sql.NVarChar(100), value: data.navn },
                { name: 'beskrivelse', type: sql.NVarChar(500), value: data.beskrivelse || null }
            ]);

            return res.status(201).json({
                message: 'Investeringscasen blev oprettet.',
                investmentCase: rows[0]
            });
        } catch (error) {
            return next(error);
        }
    });

    // DELETE /api/investment-cases/:id
    // Sletter én investeringscase og dens tilknyttede linjer.
    // Skemaet definerer ON DELETE CASCADE, men vi sletter child-rækker eksplicit
    // her også, så funktionen virker på lokale databaser der er oprettet før
    // cascade-constraints blev tilføjet.
    api.delete('/:id', async function (req, res, next) {
        const caseId = Number.parseInt(req.params.id, 10);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'Id skal være et positivt heltal.' });
        }

        try {
            const deleted = await database.query(`
                SET XACT_ABORT ON;
                BEGIN TRANSACTION;

                DELETE FROM [dbo].[Finansiering]
                WHERE [case_id] = @caseId;

                DELETE FROM [dbo].[Koebsomkostning]
                WHERE [case_id] = @caseId;

                DELETE FROM [dbo].[Renovering]
                WHERE [case_id] = @caseId;

                DELETE FROM [dbo].[Driftsudgift]
                WHERE [case_id] = @caseId;

                DELETE FROM [dbo].[Udlejning]
                WHERE [case_id] = @caseId;

                DECLARE @Deleted TABLE (caseId INT);

                DELETE FROM [dbo].[InvesteringsCase]
                OUTPUT DELETED.case_id INTO @Deleted
                WHERE [case_id] = @caseId;

                COMMIT TRANSACTION;

                SELECT caseId FROM @Deleted;
            `, [{ name: 'caseId', type: sql.Int, value: caseId }]);

            if (deleted.length === 0) {
                return res.status(404).json({ error: 'Casen blev ikke fundet.' });
            }
            return res.status(200).json({ message: 'Casen blev slettet.' });
        } catch (error) {
            return next(error);
        }
    });

    // POST /api/investment-cases/:id/duplicate
    // Duplikerer en case inkl. alle tilknyttede linjer (omkostninger, finansiering,
    // renoveringer, drift, udlejning). Bruges til scenarie-sammenligning hvor man
    // vil teste en variant uden at miste den oprindelige case.
    api.post('/:id/duplicate', async function (req, res, next) {
        const sourceId = Number.parseInt(req.params.id, 10);
        const onsketNavn = String(req.body.navn || '').trim();

        if (!Number.isInteger(sourceId) || sourceId <= 0) {
            return res.status(400).json({ error: 'Id skal være et positivt heltal.' });
        }

        try {
            // Hent kilde-casen først, så vi kender ejendomId og kan bygge nyt navn
            const sourceRows = await database.query(`
                SELECT ${caseSelectColumns}
                FROM [dbo].[InvesteringsCase]
                WHERE [case_id] = @caseId
            `, [{ name: 'caseId', type: sql.Int, value: sourceId }]);

            if (sourceRows.length === 0) {
                return res.status(404).json({ error: 'Kilde-casen blev ikke fundet.' });
            }
            const source = sourceRows[0];

            // Find et navn der ikke kolliderer med UNIQUE(ejendom_id, navn).
            // Hvis brugeren ikke selv valgte navn: prøv "<navn> (kopi)", så
            // "<navn> (kopi 2)", "<navn> (kopi 3)" osv. indtil et er ledigt.
            let nytNavn = onsketNavn || `${source.navn} (kopi)`;
            let suffix = 2;
            while (true) {
                const collision = await database.query(`
                    SELECT [case_id] FROM [dbo].[InvesteringsCase]
                    WHERE [ejendom_id] = @ejendomId AND [navn] = @navn
                `, [
                    { name: 'ejendomId', type: sql.Int,           value: source.ejendomId },
                    { name: 'navn',      type: sql.NVarChar(100), value: nytNavn }
                ]);
                if (collision.length === 0) break;
                if (onsketNavn) {
                    return res.status(400).json({ error: 'Der findes allerede en case med dette navn.' });
                }
                nytNavn = `${source.navn} (kopi ${suffix++})`;
                if (suffix > 50) {
                    return res.status(409).json({ error: 'Kunne ikke finde et ledigt navn.' });
                }
            }

            // Opret den nye case
            const insertedCase = await database.query(`
                INSERT INTO [dbo].[InvesteringsCase] ([ejendom_id],[navn],[beskrivelse])
                OUTPUT INSERTED.case_id     AS caseId,
                       INSERTED.ejendom_id  AS ejendomId,
                       INSERTED.navn,
                       INSERTED.beskrivelse,
                       INSERTED.oprettet    AS createdAt
                VALUES (@ejendomId, @navn, @beskrivelse)
            `, [
                { name: 'ejendomId',   type: sql.Int,           value: source.ejendomId },
                { name: 'navn',        type: sql.NVarChar(100), value: nytNavn },
                { name: 'beskrivelse', type: sql.NVarChar(500), value: source.beskrivelse }
            ]);
            const newCaseId = insertedCase[0].caseId;

            // Kopier alle tilknyttede linjer over til den nye case.
            // INSERT...SELECT bevarer alle felter undtagen PK og case_id.
            await database.execute(`
                INSERT INTO [dbo].[Koebsomkostning] ([case_id],[beskrivelse],[beloeb])
                SELECT @newCaseId, [beskrivelse], [beloeb]
                FROM [dbo].[Koebsomkostning] WHERE [case_id] = @sourceId
            `, [
                { name: 'newCaseId', type: sql.Int, value: newCaseId },
                { name: 'sourceId',  type: sql.Int, value: sourceId }
            ]);

            await database.execute(`
                INSERT INTO [dbo].[Finansiering]
                    ([case_id],[laanebeloeb],[rente_pct],[loebetid_aar],[afdragsfri_aar],[laanetype])
                SELECT @newCaseId, [laanebeloeb], [rente_pct], [loebetid_aar], [afdragsfri_aar], [laanetype]
                FROM [dbo].[Finansiering] WHERE [case_id] = @sourceId
            `, [
                { name: 'newCaseId', type: sql.Int, value: newCaseId },
                { name: 'sourceId',  type: sql.Int, value: sourceId }
            ]);

            await database.execute(`
                INSERT INTO [dbo].[Renovering] ([case_id],[beskrivelse],[beloeb],[aar])
                SELECT @newCaseId, [beskrivelse], [beloeb], [aar]
                FROM [dbo].[Renovering] WHERE [case_id] = @sourceId
            `, [
                { name: 'newCaseId', type: sql.Int, value: newCaseId },
                { name: 'sourceId',  type: sql.Int, value: sourceId }
            ]);

            await database.execute(`
                INSERT INTO [dbo].[Driftsudgift] ([case_id],[navn],[beloeb_maaned])
                SELECT @newCaseId, [navn], [beloeb_maaned]
                FROM [dbo].[Driftsudgift] WHERE [case_id] = @sourceId
            `, [
                { name: 'newCaseId', type: sql.Int, value: newCaseId },
                { name: 'sourceId',  type: sql.Int, value: sourceId }
            ]);

            await database.execute(`
                INSERT INTO [dbo].[Udlejning] ([case_id],[maanedlig_leje],[maanedlig_udgift])
                SELECT @newCaseId, [maanedlig_leje], [maanedlig_udgift]
                FROM [dbo].[Udlejning] WHERE [case_id] = @sourceId
            `, [
                { name: 'newCaseId', type: sql.Int, value: newCaseId },
                { name: 'sourceId',  type: sql.Int, value: sourceId }
            ]);

            return res.status(201).json({
                message: 'Case duplikeret.',
                investmentCase: insertedCase[0]
            });
        } catch (error) {
            return next(error);
        }
    });

    // GET /api/investment-cases/:id/full
    // Henter en case med alle tilknyttede linjer i ét kald — bruges af
    // sammenligningssiden, så frontend ikke skal lave 5 separate fetches per case.
    api.get('/:id/full', async function (req, res, next) {
        const caseId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'Case-id skal være et positivt heltal.' });
        }

        try {
            const caseRows = await database.query(`
                SELECT c.[case_id]      AS caseId,
                       c.[ejendom_id]   AS ejendomId,
                       c.[navn],
                       c.[beskrivelse],
                       c.[oprettet]     AS createdAt,
                       e.[vejnavn], e.[husnummer], e.[postnummer], e.[bynavn]
                FROM [dbo].[InvesteringsCase] c
                JOIN [dbo].[Ejendom] e ON e.[ejendom_id] = c.[ejendom_id]
                WHERE c.[case_id] = @caseId
            `, [{ name: 'caseId', type: sql.Int, value: caseId }]);

            if (caseRows.length === 0) {
                return res.status(404).json({ error: 'Casen blev ikke fundet.' });
            }

            const params = [{ name: 'caseId', type: sql.Int, value: caseId }];

            const [koeb, finansiering, renoveringer, drift, udlejning] = await Promise.all([
                database.query(`
                    SELECT [koebsomkostning_id] AS id, [beskrivelse], [beloeb]
                    FROM [dbo].[Koebsomkostning] WHERE [case_id] = @caseId
                `, params),
                database.query(`
                    SELECT [finansiering_id] AS id,
                           [laanebeloeb], [rente_pct] AS rentePct,
                           [loebetid_aar] AS loebetidAar,
                           [afdragsfri_aar] AS afdragsfriAar,
                           [laanetype]
                    FROM [dbo].[Finansiering] WHERE [case_id] = @caseId
                `, params),
                database.query(`
                    SELECT [renovering_id] AS id, [beskrivelse], [beloeb], [aar]
                    FROM [dbo].[Renovering] WHERE [case_id] = @caseId ORDER BY [aar] ASC
                `, params),
                database.query(`
                    SELECT [driftsudgift_id] AS id, [navn], [beloeb_maaned] AS beloebMaaned
                    FROM [dbo].[Driftsudgift] WHERE [case_id] = @caseId
                `, params),
                database.query(`
                    SELECT [udlejning_id] AS id,
                           [maanedlig_leje] AS maanedligLeje,
                           [maanedlig_udgift] AS maanedligUdgift
                    FROM [dbo].[Udlejning] WHERE [case_id] = @caseId
                `, params)
            ]);

            return res.status(200).json({
                ...caseRows[0],
                koebsomkostninger: koeb,
                finansiering: finansiering[0] || null,
                renoveringer,
                driftsudgifter: drift,
                udlejning: udlejning[0] || null
            });
        } catch (error) {
            return next(error);
        }
    });

    // PUT /api/investment-cases/:id
    // Opdaterer navn og beskrivelse på en eksisterende case
    api.put('/:id', async function (req, res, next) {
        const caseId = Number.parseInt(req.params.id, 10);
        const navn = String(req.body.navn || '').trim();
        const beskrivelse = String(req.body.beskrivelse || '').trim();

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'Id skal være et positivt heltal.' });
        }
        if (!navn) {
            return res.status(400).json({ error: 'Navn mangler.' });
        }

        try {
            const rowsAffected = await database.execute(`
                UPDATE [dbo].[InvesteringsCase]
                SET [navn] = @navn, [beskrivelse] = @beskrivelse
                WHERE [case_id] = @caseId
            `, [
                { name: 'caseId', type: sql.Int, value: caseId },
                { name: 'navn', type: sql.NVarChar(100), value: navn },
                { name: 'beskrivelse', type: sql.NVarChar(500), value: beskrivelse || null }
            ]);

            if (rowsAffected === 0) {
                return res.status(404).json({ error: 'Casen blev ikke fundet.' });
            }
            return res.status(200).json({ message: 'Casen blev opdateret.' });
        } catch (error) {
            return next(error);
        }
    });

    return { page, api };
};
