// ─── Imports ───
const express = require('express');
const path = require('path');
const { passwordConfig } = require('./Database/konfiguration');
const { createDatabaseConnection } = require('./Database/database');
const createEjendomRouter = require('./Routes/ejendom');
const createInvestmentCasesRouter = require('./Routes/investeringscases');
const simulationRoutes = require('./Simulations/simuleringRuter');
const bbrApiRouter = require('./Routes/BBR');
const dawaApiRouter = require('./Routes/dawa');
const createFinansieringRouter = require('./Routes/finansiering');
const createKoebsomkostningRouter = require('./Routes/koebsomkostning');
const createRenoveringRouter = require('./Routes/renovering');
const createDriftsudgiftRouter = require('./Routes/driftsudgift');
const createUdlejningRouter = require('./Routes/udlejning');

// ─── Express setup ───
const app = express();
const PORT = process.env.PORT || 3000;
let server;
let keepAliveTimer;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// ─── Database-forbindelse ───
let db;

function createUnavailableDatabase() {
    const error = new Error('Databaseforbindelsen er ikke oprettet.');
    error.status = 503;
    error.publicMessage = 'Databasen er ikke tilgængelig. Tjek SQL Server-forbindelsen i DataGrip.';

    return {
        async query() {
            throw error;
        },
        async execute() {
            throw error;
        }
    };
}

async function startServer() {
    let databaseError = null;

    try {
        db = await createDatabaseConnection(passwordConfig);
    } catch (error) {
        databaseError = error;
        db = createUnavailableDatabase();
        console.error('Kunne ikke forbinde til databasen. Serveren starter uden database:', error.message);
    }

    const ejendomRoutes = createEjendomRouter(db);
    const investmentCasesRoutes = createInvestmentCasesRouter(db);

    // ─── Ruter ───
    app.get('/', (req, res) => {
        res.render('forside', { title: 'Ejendomsinvesteringssystem' });
    });

    app.use('/properties', ejendomRoutes.page);
    app.use('/api/ejendom', ejendomRoutes.api);
    app.use('/investment-cases', investmentCasesRoutes.page);
    app.use('/api/investment-cases', investmentCasesRoutes.api);
    app.use('/api/simulation', simulationRoutes);
    app.use('/api/bbr', bbrApiRouter);
    app.use('/api/dawa', dawaApiRouter);
    app.use('/api/finansiering', createFinansieringRouter(db).api);
    app.use('/api/koebsomkostning', createKoebsomkostningRouter(db).api);
    app.use('/api/renovering', createRenoveringRouter(db).api);
    app.use('/api/driftsudgift', createDriftsudgiftRouter(db).api);
    app.use('/api/udlejning', createUdlejningRouter(db).api);

    // ─── Global error-middleware ───
    // Centraliseret fejlhåndtering: alle async route-handlers kalder
    // next(err) i deres catch-block, og denne middleware står for logging
    // og response. Routes kan tagge fejl med err.status (HTTP-kode, default
    // 500) og err.publicMessage (brugervenlig besked, default generisk).
    // Pensum: F18 (Express middleware) + F19 (fejlhåndtering).
    app.use((err, req, res, next) => {
        const status = err.status || 500;
        const message = err.publicMessage || 'Der opstod en serverfejl.';
        const timestamp = new Date().toISOString();
        console.error(
            `[${timestamp}] ${req.method} ${req.originalUrl} → ${status}\n${err.stack || err.message || err}`
        );
        res.status(status).json({ error: message });
    });

    server = app.listen(PORT, () => {
        console.log(`Server kører på http://localhost:${PORT}`);
        if (databaseError) {
            console.log('Bemærk: Databasen er ikke forbundet, så databasefunktioner virker først når SQL Server kører.');
        }
    });

    keepAliveTimer = setInterval(() => {}, 60 * 60 * 1000);
}

startServer();
