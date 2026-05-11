const express = require('express');
const { sql } = require('../Database/database');
const { PropertyValidator } = require('../Models/ejendomsValidering');

// Én delt validator kan genbruges til alle requests.
const propertyValidator = new PropertyValidator();

const bracket = (name) => `[${String(name).replace(/]/g, ']]')}]`;

let ejendomColumnsCache = null;

// Finder de faktiske kolonnenavne i databasen.
// Det gør routen robust, hvis databasen stadig har en ældre navngivning.
async function getEjendomColumns(database) {
    if (ejendomColumnsCache) {
        return ejendomColumnsCache;
    }

    const rows = await database.query(`
        SELECT COLUMN_NAME AS columnName
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Ejendom'
          AND TABLE_SCHEMA = 'dbo'
    `);
    const names = new Set(rows.map(row => row.columnName));

    ejendomColumnsCache = {
        bbrId: names.has('bbr_id') ? 'bbr_id' : null,
        ejendomstype: names.has('ejendomstype') ? 'ejendomstype' : null,
        byggeaar: names.has('byggeår') ? 'byggeår' : (names.has('byggeaar') ? 'byggeaar' : null),
        boligareal: names.has('boligareal_m2') ? 'boligareal_m2' : null,
        antalVaerelser: names.has('antal_værelser') ? 'antal_værelser' : (names.has('antal_vaerelser') ? 'antal_vaerelser' : null),
        grundareal: names.has('grundareal_m2') ? 'grundareal_m2' : null,
        hasOprettet: names.has('oprettet'),
        hasSidstOpdateret: names.has('sidst_opdateret'),
        hasArkiveret: names.has('arkiveret')
    };
    return ejendomColumnsCache;
}

function selectColumn(columns, key, alias) {
    return columns[key]
        ? `e.${bracket(columns[key])} AS ${alias}`
        : `NULL AS ${alias}`;
}

// Bygger SELECT-listen ud fra de kolonnenavne, databasen faktisk har.
function buildEjendomSelectColumns(columns) {
    // Henter også antal cases, så frontend kan vise det direkte.
    return `
    e.[ejendom_id]      AS ejendomId,
    e.[vejnavn],
    e.[husnummer],
    e.[postnummer],
    e.[bynavn],
    ${selectColumn(columns, 'bbrId', 'bbrId')},
    ${selectColumn(columns, 'ejendomstype', 'ejendomstype')},
    ${selectColumn(columns, 'byggeaar', 'byggeaar')},
    ${selectColumn(columns, 'boligareal', 'boligareal')},
    ${selectColumn(columns, 'antalVaerelser', 'antalVaerelser')},
    ${selectColumn(columns, 'grundareal', 'grundareal')},
    ${columns.hasOprettet ? 'e.[oprettet]' : 'NULL'} AS createdAt,
    ${columns.hasSidstOpdateret ? 'e.[sidst_opdateret]' : 'NULL'} AS sidstOpdateret,
    ${columns.hasArkiveret ? 'e.[arkiveret]' : 'CAST(0 AS bit)'} AS arkiveret,
    COALESCE((SELECT COUNT(*) FROM [dbo].[InvesteringsCase] c
              WHERE c.[ejendom_id] = e.[ejendom_id]), 0) AS antalCases
`;
}

function buildOptionalEjendomInsert(columns) {
    const options = [
        { column: columns.bbrId, parameter: '@bbrId' },
        { column: columns.ejendomstype, parameter: '@ejendomstype' },
        { column: columns.byggeaar, parameter: '@byggeaar' },
        { column: columns.boligareal, parameter: '@boligareal' },
        { column: columns.antalVaerelser, parameter: '@antalVaerelser' },
        { column: columns.grundareal, parameter: '@grundareal' }
    ].filter(option => option.column);

    return {
        columnsSql: options.map(option => `,${bracket(option.column)}`).join(''),
        valuesSql: options.map(option => `,${option.parameter}`).join('')
    };
}

function buildOptionalEjendomUpdate(columns) {
    const options = [
        { column: columns.bbrId, parameter: '@bbrId' },
        { column: columns.ejendomstype, parameter: '@ejendomstype' },
        { column: columns.byggeaar, parameter: '@byggeaar' },
        { column: columns.boligareal, parameter: '@boligareal' },
        { column: columns.antalVaerelser, parameter: '@antalVaerelser' },
        { column: columns.grundareal, parameter: '@grundareal' }
    ].filter(option => option.column);

    return options.map(option => `,
                    ${bracket(option.column)} = ${option.parameter}`).join('');
}

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

    // Henter ejendomme. Arkiverede ejendomme kan skjules efter behov.
    api.get('/', async (req, res, next) => {
        const includeArkiveret = req.query.includeArkiveret !== 'false';
        try {
            const columns = await getEjendomColumns(database);
            const ejendomSelectColumns = buildEjendomSelectColumns(columns);
            // Ældre databaser har ikke arkiveret-kolonnen, så filteret bruges kun når kolonnen findes.
            const where = includeArkiveret || !columns.hasArkiveret ? '' : 'WHERE e.[arkiveret] = 0';
            const orderBy = columns.hasArkiveret
                ? 'ORDER BY e.[arkiveret] ASC, e.[ejendom_id] DESC'
                : 'ORDER BY e.[ejendom_id] DESC';
            const ejendomme = await database.query(`
                SELECT ${ejendomSelectColumns}
                FROM [dbo].[Ejendom] e
                ${where}
                ${orderBy}
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
            const columns = await getEjendomColumns(database);
            const ejendomSelectColumns = buildEjendomSelectColumns(columns);
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

    // Opretter en ny ejendom.
    api.post('/', async (req, res, next) => {
        const property = propertyValidator.normalize(req.body);
        const validationError = propertyValidator.validate(property);
        if (validationError) return res.status(400).json({ error: validationError });

        try {
            const columns = await getEjendomColumns(database);
            // Kun kolonner, der findes i databasen, bliver brugt i INSERT.
            const insert = buildOptionalEjendomInsert(columns);
            const rows = await database.query(`
                INSERT INTO [dbo].[Ejendom] (
                    [vejnavn],[husnummer],[postnummer],[bynavn]${insert.columnsSql}
                )
                OUTPUT INSERTED.ejendom_id, ${columns.hasOprettet ? 'INSERTED.oprettet' : 'NULL AS oprettet'}
                VALUES (
                    @vejnavn,@husnummer,@postnummer,@bynavn${insert.valuesSql}
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

    // Opdaterer en eksisterende ejendom.
    api.put('/:id', async (req, res, next) => {
        const ejendomId = parseEjendomId(req.params.id);
        const property = propertyValidator.normalize(req.body);
        const validationError = propertyValidator.validate(property);
        if (!ejendomId) return res.status(400).json({ error: 'Ejendoms-id skal være et positivt heltal.' });
        if (validationError) return res.status(400).json({ error: validationError });

        try {
            const columns = await getEjendomColumns(database);
            // Kun kolonner, der findes i databasen, bliver opdateret.
            const optionalUpdates = buildOptionalEjendomUpdate(columns);
            const sidstOpdateretSet = columns.hasSidstOpdateret
                ? ',\n                    [sidst_opdateret] = SYSDATETIME()'
                : '';
            const sidstOpdateretOutput = columns.hasSidstOpdateret
                ? 'INSERTED.sidst_opdateret AS sidstOpdateret'
                : 'NULL AS sidstOpdateret';
            const createdAtOutput = columns.hasOprettet
                ? 'INSERTED.oprettet AS createdAt'
                : 'NULL AS createdAt';
            // Marker at ejendommen netop er blevet opdateret.
            const rows = await database.query(`
                UPDATE [dbo].[Ejendom]
                SET
                    [vejnavn]         = @vejnavn,
                    [husnummer]       = @husnummer,
                    [postnummer]      = @postnummer,
                    [bynavn]          = @bynavn
                    ${optionalUpdates}
                    ${sidstOpdateretSet}
                OUTPUT
                    INSERTED.ejendom_id      AS ejendomId,
                    ${createdAtOutput},
                    ${sidstOpdateretOutput}
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

    // Arkiverer eller gendanner en ejendom uden at slette gamle cases.
    api.put('/:id/arkiver', async (req, res, next) => {
        const ejendomId = parseEjendomId(req.params.id);
        if (!ejendomId) return res.status(400).json({ error: 'Ejendoms-id skal være et positivt heltal.' });

        const arkiveret = req.body.arkiveret === true || req.body.arkiveret === 'true';

        try {
            const columns = await getEjendomColumns(database);
            if (!columns.hasArkiveret) {
                return res.status(400).json({ error: 'Arkivering kræver, at schema.sql er kørt på databasen.' });
            }

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

    // Sletter en ejendom, hvis den ikke bruges af cases.
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
