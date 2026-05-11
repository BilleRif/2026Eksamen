const express = require('express');
const { sql } = require('../Database/database');

// De samme casefelter bruges flere steder i filen.
const caseSelectKolonner = `
    [case_id]     AS caseId,
    [ejendom_id]  AS ejendomId,
    [navn],
    [beskrivelse],
    [oprettet]    AS createdAt
`;

function normaliserPayload(body) {
    // Rydder input fra formularen, før casen valideres og gemmes.
    return {
        ejendomId: Number.parseInt(body.ejendomId, 10),
        navn: String(body.navn || '').trim(),
        beskrivelse: String(body.beskrivelse || '').trim()
    };
}

function validerCase(caseData) {
    // En case skal altid høre til en eksisterende ejendom.
    if (!Number.isInteger(caseData.ejendomId) || caseData.ejendomId <= 0) {
        return 'Ejendoms-id skal være et positivt heltal.';
    }
    if (!caseData.navn) {
        return 'Navn på investeringscase mangler.';
    }
    if (caseData.navn.length > 100) {
        return 'Navnet må maksimalt være 100 tegn.';
    }
    return null;
}

module.exports = function createInvestmentCasesRouter(database) {
    const api = express.Router();
    const page = express.Router();

    page.get('/', (req, res) => {
        // Viser oversigten over alle investeringscases.
        res.render('investeringscases', { title: 'Investeringscases' });
    });
    // Sammenligningssiden skal registreres før de routes, der bruger id.
    page.get('/compare', (req, res) => {
        res.render('sammenlignInvesteringscases', { title: 'Sammenlign cases' });
    });
    page.get('/:id', (req, res) => {
        // Detaljesiden skal bruge caseId til alle underformularer.
        const caseId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).send('Ugyldigt case-id.');
        }
        res.render('investeringscaseDetalje', { title: 'Investeringscase', caseId });
    });

    // Henter alle investeringscases
    api.get('/', async function (req, res, next) {
        try {
            const investeringscases = await database.query(`
                SELECT ${caseSelectKolonner}
                FROM [dbo].[InvesteringsCase]
                ORDER BY [case_id] DESC
            `);
            return res.status(200).json(investeringscases);
        } catch (error) {
            return next(error);
        }
    });

    // Henter én bestemt investeringscase
    api.get('/:id', async function (req, res, next) {
        const caseId = Number.parseInt(req.params.id, 10);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'Case-id skal være et positivt heltal.' });
        }

        try {
            const rækker = await database.query(`
                SELECT ${caseSelectKolonner}
                FROM [dbo].[InvesteringsCase]
                WHERE [case_id] = @caseId
            `, [{ name: 'caseId', type: sql.Int, value: caseId }]);

            if (rækker.length === 0) {
                return res.status(404).json({ error: 'Casen blev ikke fundet.' });
            }
            return res.status(200).json(rækker[0]);
        } catch (error) {
            return next(error);
        }
    });

    // Opretter en ny investeringscase for en eksisterende ejendom
    api.post('/', async function (req, res, next) {
        // Samme validering bruges uanset om data kommer fra frontend eller HTTP-test.
        const caseData = normaliserPayload(req.body);
        const valideringsFejl = validerCase(caseData);

        if (valideringsFejl) {
            return res.status(400).json({ error: valideringsFejl });
        }

        try {
            // Tjek at ejendommen findes
            const ejendomsRækker = await database.query(`
                SELECT [ejendom_id] FROM [dbo].[Ejendom]
                WHERE [ejendom_id] = @ejendomId
            `, [{ name: 'ejendomId', type: sql.Int, value: caseData.ejendomId }]);

            if (ejendomsRækker.length === 0) {
                return res.status(404).json({ error: 'Ejendommen blev ikke fundet.' });
            }

            // Tjek at der ikke allerede findes en case med samme navn
            const eksisterendeCase = await database.query(`
                SELECT [case_id] FROM [dbo].[InvesteringsCase]
                WHERE [ejendom_id] = @ejendomId AND [navn] = @navn
            `, [
                { name: 'ejendomId', type: sql.Int, value: caseData.ejendomId },
                { name: 'navn', type: sql.NVarChar(100), value: caseData.navn }
            ]);

            if (eksisterendeCase.length > 0) {
                return res.status(400).json({ error: 'Der findes allerede en case med dette navn for ejendommen.' });
            }

            // Når casen er oprettet, sendes den nye række tilbage til frontend.
            const rækker = await database.query(`
                INSERT INTO [dbo].[InvesteringsCase] ([ejendom_id],[navn],[beskrivelse])
                OUTPUT INSERTED.case_id AS caseId,
                       INSERTED.ejendom_id AS ejendomId,
                       INSERTED.navn,
                       INSERTED.beskrivelse,
                       INSERTED.oprettet AS createdAt
                VALUES (@ejendomId, @navn, @beskrivelse)
            `, [
                { name: 'ejendomId', type: sql.Int, value: caseData.ejendomId },
                { name: 'navn', type: sql.NVarChar(100), value: caseData.navn },
                { name: 'beskrivelse', type: sql.NVarChar(500), value: caseData.beskrivelse || null }
            ]);

            return res.status(201).json({
                message: 'Investeringscasen blev oprettet.',
                investmentCase: rækker[0]
            });
        } catch (error) {
            return next(error);
        }
    });

    // Sletter en investeringscase og de linjer, der hører til.
    api.delete('/:id', async function (req, res, next) {
        const caseId = Number.parseInt(req.params.id, 10);

        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'Id skal være et positivt heltal.' });
        }

        try {
            // Sletningen samles i en transaktion, så casen ikke efterlades halvt slettet.
            const slettedeRækker = await database.query(`
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

            if (slettedeRækker.length === 0) {
                return res.status(404).json({ error: 'Casen blev ikke fundet.' });
            }
            return res.status(200).json({ message: 'Casen blev slettet.' });
        } catch (error) {
            return next(error);
        }
    });

    // Kopierer en case med alle tilhørende linjer.
    api.post('/:id/duplicate', async function (req, res, next) {
        const kildeCaseId = Number.parseInt(req.params.id, 10);
        const onsketNavn = String(req.body.navn || '').trim();

        if (!Number.isInteger(kildeCaseId) || kildeCaseId <= 0) {
            return res.status(400).json({ error: 'Id skal være et positivt heltal.' });
        }

        try {
            // Hent den oprindelige case først.
            const kildeRækker = await database.query(`
                SELECT ${caseSelectKolonner}
                FROM [dbo].[InvesteringsCase]
                WHERE [case_id] = @caseId
            `, [{ name: 'caseId', type: sql.Int, value: kildeCaseId }]);

            if (kildeRækker.length === 0) {
                return res.status(404).json({ error: 'Kilde-casen blev ikke fundet.' });
            }
            const kildeCase = kildeRækker[0];

            // Find et ledigt navn til kopien.
            let nytNavn = onsketNavn || `${kildeCase.navn} (kopi)`;
            let kopiNummer = 2;
            while (true) {
                const navneMatch = await database.query(`
                    SELECT [case_id] FROM [dbo].[InvesteringsCase]
                    WHERE [ejendom_id] = @ejendomId AND [navn] = @navn
                `, [
                    { name: 'ejendomId', type: sql.Int,           value: kildeCase.ejendomId },
                    { name: 'navn',      type: sql.NVarChar(100), value: nytNavn }
                ]);
                if (navneMatch.length === 0) break;
                if (onsketNavn) {
                    return res.status(400).json({ error: 'Der findes allerede en case med dette navn.' });
                }
                nytNavn = `${kildeCase.navn} (kopi ${kopiNummer++})`;
                if (kopiNummer > 50) {
                    return res.status(409).json({ error: 'Kunne ikke finde et ledigt navn.' });
                }
            }

            // Opret den nye case
            const oprettetCase = await database.query(`
                INSERT INTO [dbo].[InvesteringsCase] ([ejendom_id],[navn],[beskrivelse])
                OUTPUT INSERTED.case_id     AS caseId,
                       INSERTED.ejendom_id  AS ejendomId,
                       INSERTED.navn,
                       INSERTED.beskrivelse,
                       INSERTED.oprettet    AS createdAt
                VALUES (@ejendomId, @navn, @beskrivelse)
            `, [
                { name: 'ejendomId',   type: sql.Int,           value: kildeCase.ejendomId },
                { name: 'navn',        type: sql.NVarChar(100), value: nytNavn },
                { name: 'beskrivelse', type: sql.NVarChar(500), value: kildeCase.beskrivelse }
            ]);
            const nyCaseId = oprettetCase[0].caseId;

            // Kopier alle linjer over til den nye case.
            // Hver tabel kopieres separat, fordi de har forskellige kolonner.
            await database.execute(`
                INSERT INTO [dbo].[Koebsomkostning] ([case_id],[beskrivelse],[beloeb])
                SELECT @newCaseId, [beskrivelse], [beloeb]
                FROM [dbo].[Koebsomkostning] WHERE [case_id] = @sourceId
            `, [
                { name: 'newCaseId', type: sql.Int, value: nyCaseId },
                { name: 'sourceId',  type: sql.Int, value: kildeCaseId }
            ]);

            await database.execute(`
                INSERT INTO [dbo].[Finansiering]
                    ([case_id],[laanebeloeb],[rente_pct],[loebetid_aar],[afdragsfri_aar],[laanetype])
                SELECT @newCaseId, [laanebeloeb], [rente_pct], [loebetid_aar], [afdragsfri_aar], [laanetype]
                FROM [dbo].[Finansiering] WHERE [case_id] = @sourceId
            `, [
                { name: 'newCaseId', type: sql.Int, value: nyCaseId },
                { name: 'sourceId',  type: sql.Int, value: kildeCaseId }
            ]);

            await database.execute(`
                INSERT INTO [dbo].[Renovering] ([case_id],[beskrivelse],[beloeb],[aar])
                SELECT @newCaseId, [beskrivelse], [beloeb], [aar]
                FROM [dbo].[Renovering] WHERE [case_id] = @sourceId
            `, [
                { name: 'newCaseId', type: sql.Int, value: nyCaseId },
                { name: 'sourceId',  type: sql.Int, value: kildeCaseId }
            ]);

            await database.execute(`
                INSERT INTO [dbo].[Driftsudgift] ([case_id],[navn],[beloeb_maaned])
                SELECT @newCaseId, [navn], [beloeb_maaned]
                FROM [dbo].[Driftsudgift] WHERE [case_id] = @sourceId
            `, [
                { name: 'newCaseId', type: sql.Int, value: nyCaseId },
                { name: 'sourceId',  type: sql.Int, value: kildeCaseId }
            ]);

            await database.execute(`
                INSERT INTO [dbo].[Udlejning] ([case_id],[maanedlig_leje],[maanedlig_udgift])
                SELECT @newCaseId, [maanedlig_leje], [maanedlig_udgift]
                FROM [dbo].[Udlejning] WHERE [case_id] = @sourceId
            `, [
                { name: 'newCaseId', type: sql.Int, value: nyCaseId },
                { name: 'sourceId',  type: sql.Int, value: kildeCaseId }
            ]);

            return res.status(201).json({
                message: 'Case duplikeret.',
                investmentCase: oprettetCase[0]
            });
        } catch (error) {
            return next(error);
        }
    });

    // Henter en case med alle linjer i ét kald.
    api.get('/:id/full', async function (req, res, next) {
        const caseId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(caseId) || caseId <= 0) {
            return res.status(400).json({ error: 'Case-id skal være et positivt heltal.' });
        }

        try {
            const caseRækker = await database.query(`
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

            if (caseRækker.length === 0) {
                return res.status(404).json({ error: 'Casen blev ikke fundet.' });
            }

            // Samme caseId bruges til alle deltabeller.
            const sqlParametre = [{ name: 'caseId', type: sql.Int, value: caseId }];

            // De uafhængige tabeller kan hentes samtidig.
            const [koeb, finansiering, renoveringer, drift, udlejning] = await Promise.all([
                database.query(`
                    SELECT [koebsomkostning_id] AS id, [beskrivelse], [beloeb]
                    FROM [dbo].[Koebsomkostning] WHERE [case_id] = @caseId
                `, sqlParametre),
                database.query(`
                    SELECT [finansiering_id] AS id,
                           [laanebeloeb], [rente_pct] AS rentePct,
                           [loebetid_aar] AS loebetidAar,
                           [afdragsfri_aar] AS afdragsfriAar,
                           [laanetype]
                    FROM [dbo].[Finansiering] WHERE [case_id] = @caseId
                `, sqlParametre),
                database.query(`
                    SELECT [renovering_id] AS id, [beskrivelse], [beloeb], [aar]
                    FROM [dbo].[Renovering] WHERE [case_id] = @caseId ORDER BY [aar] ASC
                `, sqlParametre),
                database.query(`
                    SELECT [driftsudgift_id] AS id, [navn], [beloeb_maaned] AS beloebMaaned
                    FROM [dbo].[Driftsudgift] WHERE [case_id] = @caseId
                `, sqlParametre),
                database.query(`
                    SELECT [udlejning_id] AS id,
                           [maanedlig_leje] AS maanedligLeje,
                           [maanedlig_udgift] AS maanedligUdgift
                    FROM [dbo].[Udlejning] WHERE [case_id] = @caseId
                `, sqlParametre)
            ]);

            return res.status(200).json({
                ...caseRækker[0],
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
            // Kun navn og beskrivelse kan ændres her.
            const ændredeRækker = await database.execute(`
                UPDATE [dbo].[InvesteringsCase]
                SET [navn] = @navn, [beskrivelse] = @beskrivelse
                WHERE [case_id] = @caseId
            `, [
                { name: 'caseId', type: sql.Int, value: caseId },
                { name: 'navn', type: sql.NVarChar(100), value: navn },
                { name: 'beskrivelse', type: sql.NVarChar(500), value: beskrivelse || null }
            ]);

            if (ændredeRækker === 0) {
                return res.status(404).json({ error: 'Casen blev ikke fundet.' });
            }
            return res.status(200).json({ message: 'Casen blev opdateret.' });
        } catch (error) {
            return next(error);
        }
    });

    return { page, api };
};
