const express = require('express');
const { sql } = require('../Database/database');
const { EjendomsValidering } = require('../Models/ejendomsValidering');

// Én delt validator kan genbruges til alle requests.
const ejendomsValidering = new EjendomsValidering();

// Pakker kolonnenavne ind i SQL-klammer.
// Det er vigtigt, fordi nogle databaser kan have æ/ø/å i kolonnenavne.
const sqlKolonne = (navn) => `[${String(navn).replace(/]/g, ']]')}]`;

let ejendomKolonnerCache = null;

// Finder de faktiske kolonnenavne i databasen.
// Det gør routen robust, hvis databasen stadig har en ældre navngivning.
async function hentEjendomKolonner(database) {
    if (ejendomKolonnerCache) {
        return ejendomKolonnerCache;
    }

    const rækker = await database.query(`
        SELECT COLUMN_NAME AS columnName
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Ejendom'
          AND TABLE_SCHEMA = 'dbo'
    `);
    const navne = new Set(rækker.map(række => række.columnName));

    ejendomKolonnerCache = {
        bbrId: navne.has('bbr_id') ? 'bbr_id' : null,
        ejendomstype: navne.has('ejendomstype') ? 'ejendomstype' : null,
        byggeaar: navne.has('byggeår') ? 'byggeår' : (navne.has('byggeaar') ? 'byggeaar' : null),
        boligareal: navne.has('boligareal_m2') ? 'boligareal_m2' : null,
        antalVaerelser: navne.has('antal_værelser') ? 'antal_værelser' : (navne.has('antal_vaerelser') ? 'antal_vaerelser' : null),
        grundareal: navne.has('grundareal_m2') ? 'grundareal_m2' : null,
        harOprettet: navne.has('oprettet'),
        harSidstOpdateret: navne.has('sidst_opdateret'),
        harArkiveret: navne.has('arkiveret')
    };
    return ejendomKolonnerCache;
}

function vælgKolonne(kolonner, nøgle, alias) {
    // Hvis en ældre database mangler kolonnen, sender vi null i stedet for at fejle.
    return kolonner[nøgle]
        ? `e.${sqlKolonne(kolonner[nøgle])} AS ${alias}`
        : `NULL AS ${alias}`;
}

// Bygger SELECT-listen ud fra de kolonnenavne, databasen faktisk har.
function bygEjendomSelectKolonner(kolonner) {
    // Henter også antal cases, så frontend kan vise det direkte.
    return `
    e.[ejendom_id]      AS ejendomId,
    e.[vejnavn],
    e.[husnummer],
    e.[postnummer],
    e.[bynavn],
    ${vælgKolonne(kolonner, 'bbrId', 'bbrId')},
    ${vælgKolonne(kolonner, 'ejendomstype', 'ejendomstype')},
    ${vælgKolonne(kolonner, 'byggeaar', 'byggeaar')},
    ${vælgKolonne(kolonner, 'boligareal', 'boligareal')},
    ${vælgKolonne(kolonner, 'antalVaerelser', 'antalVaerelser')},
    ${vælgKolonne(kolonner, 'grundareal', 'grundareal')},
    ${kolonner.harOprettet ? 'e.[oprettet]' : 'NULL'} AS createdAt,
    ${kolonner.harSidstOpdateret ? 'e.[sidst_opdateret]' : 'NULL'} AS sidstOpdateret,
    ${kolonner.harArkiveret ? 'e.[arkiveret]' : 'CAST(0 AS bit)'} AS arkiveret,
    COALESCE((SELECT COUNT(*) FROM [dbo].[InvesteringsCase] c
              WHERE c.[ejendom_id] = e.[ejendom_id]), 0) AS antalCases
`;
}

function bygValgfriEjendomInsert(kolonner) {
    // Ekstra BBR-felter tilføjes kun, hvis databasen har kolonnerne.
    const muligheder = [
        { kolonne: kolonner.bbrId, parameter: '@bbrId' },
        { kolonne: kolonner.ejendomstype, parameter: '@ejendomstype' },
        { kolonne: kolonner.byggeaar, parameter: '@byggeaar' },
        { kolonne: kolonner.boligareal, parameter: '@boligareal' },
        { kolonne: kolonner.antalVaerelser, parameter: '@antalVaerelser' },
        { kolonne: kolonner.grundareal, parameter: '@grundareal' }
    ].filter(mulighed => mulighed.kolonne);

    return {
        kolonnerSql: muligheder.map(mulighed => `,${sqlKolonne(mulighed.kolonne)}`).join(''),
        værdierSql: muligheder.map(mulighed => `,${mulighed.parameter}`).join('')
    };
}

function bygValgfriEjendomUpdate(kolonner) {
    // Bruges ved BBR-opdatering, hvor gamle databaser ikke altid har alle felter.
    const muligheder = [
        { kolonne: kolonner.bbrId, parameter: '@bbrId' },
        { kolonne: kolonner.ejendomstype, parameter: '@ejendomstype' },
        { kolonne: kolonner.byggeaar, parameter: '@byggeaar' },
        { kolonne: kolonner.boligareal, parameter: '@boligareal' },
        { kolonne: kolonner.antalVaerelser, parameter: '@antalVaerelser' },
        { kolonne: kolonner.grundareal, parameter: '@grundareal' }
    ].filter(mulighed => mulighed.kolonne);

    return muligheder.map(mulighed => `,
                    ${sqlKolonne(mulighed.kolonne)} = ${mulighed.parameter}`).join('');
}

function parseEjendomId(value) {
    // Alle id'er skal være positive heltal, før de bruges i SQL.
    const ejendomId = Number.parseInt(value, 10);
    return Number.isInteger(ejendomId) && ejendomId > 0 ? ejendomId : null;
}

module.exports = function createEjendomRouter(database) {
    const page = express.Router();
    const api = express.Router();

    page.get('/', (req, res) => {
        // Viser siden med adresseopslag og gemte ejendomme.
        res.render('ejendomme', { title: 'Opret ejendom' });
    });

    // Henter ejendomme. Arkiverede ejendomme kan skjules efter behov.
    api.get('/', async (req, res, next) => {
        const medArkiverede = req.query.includeArkiveret !== 'false';
        try {
            const kolonner = await hentEjendomKolonner(database);
            const ejendomSelectKolonner = bygEjendomSelectKolonner(kolonner);
            // Ældre databaser har ikke arkiveret-kolonnen, så filteret bruges kun når kolonnen findes.
            const filter = medArkiverede || !kolonner.harArkiveret ? '' : 'WHERE e.[arkiveret] = 0';
            const sortering = kolonner.harArkiveret
                ? 'ORDER BY e.[arkiveret] ASC, e.[ejendom_id] DESC'
                : 'ORDER BY e.[ejendom_id] DESC';
            const ejendomme = await database.query(`
                SELECT ${ejendomSelectKolonner}
                FROM [dbo].[Ejendom] e
                ${filter}
                ${sortering}
            `);
            return res.status(200).json(ejendomme);
        } catch (error) {
            return next(error);
        }
    });

    // Henter én bestemt ejendom.
    api.get('/:id', async (req, res, next) => {
        const ejendomId = parseEjendomId(req.params.id);
        if (!ejendomId) {
            return res.status(400).json({ error: 'Ejendoms-id skal være et positivt heltal.' });
        }

        try {
            const kolonner = await hentEjendomKolonner(database);
            const ejendomSelectKolonner = bygEjendomSelectKolonner(kolonner);
            const rækker = await database.query(`
                SELECT ${ejendomSelectKolonner}
                FROM [dbo].[Ejendom] e
                WHERE e.[ejendom_id] = @ejendomId
            `, [{ name: 'ejendomId', type: sql.Int, value: ejendomId }]);

            if (rækker.length === 0) {
                return res.status(404).json({ error: 'Ejendommen blev ikke fundet.' });
            }
            return res.status(200).json(rækker[0]);
        } catch (error) {
            return next(error);
        }
    });

    // Opretter en ny ejendom.
    api.post('/', async (req, res, next) => {
        // Input normaliseres først, så valideringen arbejder med rene værdier.
        const ejendom = ejendomsValidering.normaliser(req.body);
        const valideringsFejl = ejendomsValidering.valider(ejendom);
        if (valideringsFejl) return res.status(400).json({ error: valideringsFejl });

        try {
            const kolonner = await hentEjendomKolonner(database);
            // Kun kolonner, der findes i databasen, bliver brugt i INSERT.
            const insert = bygValgfriEjendomInsert(kolonner);
            const rækker = await database.query(`
                INSERT INTO [dbo].[Ejendom] (
                    [vejnavn],[husnummer],[postnummer],[bynavn]${insert.kolonnerSql}
                )
                OUTPUT INSERTED.ejendom_id, ${kolonner.harOprettet ? 'INSERTED.oprettet' : 'NULL AS oprettet'}
                VALUES (
                    @vejnavn,@husnummer,@postnummer,@bynavn${insert.værdierSql}
                )
            `, [
                { name: 'vejnavn',        type: sql.NVarChar(100), value: ejendom.vejnavn },
                { name: 'husnummer',      type: sql.NVarChar(20),  value: ejendom.husnummer },
                { name: 'postnummer',     type: sql.NVarChar(10),  value: ejendom.postnummer },
                { name: 'bynavn',         type: sql.NVarChar(100), value: ejendom.bynavn },
                { name: 'bbrId',          type: sql.NVarChar(50),  value: ejendom.bbrId          || null },
                { name: 'ejendomstype',   type: sql.NVarChar(100), value: ejendom.ejendomstype   || null },
                { name: 'byggeaar',       type: sql.Int,           value: ejendom.byggeaar       || null },
                { name: 'boligareal',     type: sql.Decimal(10,2), value: ejendom.boligareal     || null },
                { name: 'antalVaerelser', type: sql.Int,           value: ejendom.antalVaerelser || null },
                { name: 'grundareal',     type: sql.Decimal(10,2), value: ejendom.grundareal     || null },
            ]);

            return res.status(201).json({
                message:   'Ejendommen blev gemt.',
                ejendomId: rækker[0].ejendom_id,
                createdAt: rækker[0].oprettet
            });
        } catch (error) {
            return next(error);
        }
    });

    // Opdaterer en eksisterende ejendom.
    api.put('/:id', async (req, res, next) => {
        // PUT bruges når en gemt ejendom skal have friske oplysninger.
        const ejendomId = parseEjendomId(req.params.id);
        const ejendom = ejendomsValidering.normaliser(req.body);
        const valideringsFejl = ejendomsValidering.valider(ejendom);
        if (!ejendomId) return res.status(400).json({ error: 'Ejendoms-id skal være et positivt heltal.' });
        if (valideringsFejl) return res.status(400).json({ error: valideringsFejl });

        try {
            const kolonner = await hentEjendomKolonner(database);
            // Kun kolonner, der findes i databasen, bliver opdateret.
            const valgfriOpdateringer = bygValgfriEjendomUpdate(kolonner);
            const sidstOpdateretSet = kolonner.harSidstOpdateret
                ? ',\n                    [sidst_opdateret] = SYSDATETIME()'
                : '';
            const sidstOpdateretOutput = kolonner.harSidstOpdateret
                ? 'INSERTED.sidst_opdateret AS sidstOpdateret'
                : 'NULL AS sidstOpdateret';
            const createdAtOutput = kolonner.harOprettet
                ? 'INSERTED.oprettet AS createdAt'
                : 'NULL AS createdAt';
            // Marker at ejendommen netop er blevet opdateret.
            const rækker = await database.query(`
                UPDATE [dbo].[Ejendom]
                SET
                    [vejnavn]         = @vejnavn,
                    [husnummer]       = @husnummer,
                    [postnummer]      = @postnummer,
                    [bynavn]          = @bynavn
                    ${valgfriOpdateringer}
                    ${sidstOpdateretSet}
                OUTPUT
                    INSERTED.ejendom_id      AS ejendomId,
                    ${createdAtOutput},
                    ${sidstOpdateretOutput}
                WHERE [ejendom_id] = @ejendomId
            `, [
                { name: 'ejendomId',      type: sql.Int,           value: ejendomId },
                { name: 'vejnavn',        type: sql.NVarChar(100), value: ejendom.vejnavn },
                { name: 'husnummer',      type: sql.NVarChar(20),  value: ejendom.husnummer },
                { name: 'postnummer',     type: sql.NVarChar(10),  value: ejendom.postnummer },
                { name: 'bynavn',         type: sql.NVarChar(100), value: ejendom.bynavn },
                { name: 'bbrId',          type: sql.NVarChar(50),  value: ejendom.bbrId          || null },
                { name: 'ejendomstype',   type: sql.NVarChar(100), value: ejendom.ejendomstype   || null },
                { name: 'byggeaar',       type: sql.Int,           value: ejendom.byggeaar       || null },
                { name: 'boligareal',     type: sql.Decimal(10,2), value: ejendom.boligareal     || null },
                { name: 'antalVaerelser', type: sql.Int,           value: ejendom.antalVaerelser || null },
                { name: 'grundareal',     type: sql.Decimal(10,2), value: ejendom.grundareal     || null },
            ]);

            if (rækker.length === 0) return res.status(404).json({ error: 'Ejendommen blev ikke fundet.' });
            return res.status(200).json({
                message:        'Ejendommen blev opdateret.',
                ejendomId:      rækker[0].ejendomId,
                createdAt:      rækker[0].createdAt,
                sidstOpdateret: rækker[0].sidstOpdateret
            });
        } catch (error) {
            return next(error);
        }
    });

    // Arkiverer eller gendanner en ejendom uden at slette gamle cases.
    api.put('/:id/arkiver', async (req, res, next) => {
        const ejendomId = parseEjendomId(req.params.id);
        if (!ejendomId) return res.status(400).json({ error: 'Ejendoms-id skal være et positivt heltal.' });

        const arkiveret = req.body.arkiveret === true || req.body.arkiveret === 'true';

        try {
            const kolonner = await hentEjendomKolonner(database);
            if (!kolonner.harArkiveret) {
                return res.status(400).json({ error: 'Arkivering kræver, at schema.sql er kørt på databasen.' });
            }

            const rækker = await database.query(`
                UPDATE [dbo].[Ejendom]
                SET [arkiveret] = @arkiveret
                OUTPUT INSERTED.ejendom_id AS ejendomId,
                       INSERTED.arkiveret  AS arkiveret
                WHERE [ejendom_id] = @ejendomId
            `, [
                { name: 'ejendomId', type: sql.Int, value: ejendomId },
                { name: 'arkiveret', type: sql.Bit, value: arkiveret ? 1 : 0 }
            ]);
            if (rækker.length === 0) return res.status(404).json({ error: 'Ejendommen blev ikke fundet.' });
            return res.status(200).json({
                message:   arkiveret ? 'Ejendommen blev arkiveret.' : 'Ejendommen blev gendannet.',
                ejendomId: rækker[0].ejendomId,
                arkiveret: rækker[0].arkiveret
            });
        } catch (error) {
            return next(error);
        }
    });

    // Sletter en ejendom, hvis den ikke bruges af cases.
    api.delete('/:id', async (req, res, next) => {
        const ejendomId = parseEjendomId(req.params.id);
        if (!ejendomId) return res.status(400).json({ error: 'Ejendoms-id skal være et positivt heltal.' });

        try {
            // Databasen afviser sletning, hvis andre tabeller stadig bruger ejendommen.
            const slettedeRækker = await database.query(`
                DELETE FROM [dbo].[Ejendom]
                OUTPUT DELETED.ejendom_id AS ejendomId
                WHERE [ejendom_id] = @ejendomId
            `, [{ name: 'ejendomId', type: sql.Int, value: ejendomId }]);

            if (slettedeRækker.length === 0) return res.status(404).json({ error: 'Ejendommen blev ikke fundet.' });
            return res.status(200).json({
                message:   'Ejendommen blev slettet.',
                ejendomId: slettedeRækker[0].ejendomId
            });
        } catch (error) {
            return next(error);
        }
    });

    return { page, api };
};
