// Henter de moduler serveren bruger.
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
const createKøbsomkostningRouter = require('./Routes/købsomkostning');
const createRenoveringRouter = require('./Routes/renovering');
const createDriftsudgiftRouter = require('./Routes/driftsudgift');
const createUdlejningRouter = require('./Routes/udlejning');

// Sætter Express-serveren op.
const app = express();
const PORT = process.env.PORT || 3000;
let server;
let keepAliveTimer;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Public-mappen indeholder frontend-filer som CSS og browser-JavaScript.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Gør det muligt at læse JSON-body fra fetch-kald i frontend.
app.use(express.json());

// Opretter forbindelse til databasen.
let db;

function createUnavailableDatabase() {
    // Bruges hvis serveren starter uden databaseforbindelse.
    // Så får brugeren en pæn fejl i stedet for at appen crasher ved start.
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
        // Først prøver serveren at forbinde til SQL Server.
        db = await createDatabaseConnection(passwordConfig);
    } catch (error) {
        // Hvis databasen ikke svarer, kan sider uden database stadig åbnes.
        databaseError = error;
        db = createUnavailableDatabase();
        console.error('Kunne ikke forbinde til databasen. Serveren starter uden database:', error.message);
    }

    // Routes oprettes først efter db er sat, så alle får samme databaseobjekt.
    const ejendomRoutes = createEjendomRouter(db);
    const investmentCasesRoutes = createInvestmentCasesRouter(db);

    // Kobler sider og API'er på serveren.
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
    app.use('/api/koebsomkostning', createKøbsomkostningRouter(db).api);
    app.use('/api/renovering', createRenoveringRouter(db).api);
    app.use('/api/driftsudgift', createDriftsudgiftRouter(db).api);
    app.use('/api/udlejning', createUdlejningRouter(db).api);

    // Samlet fejlhåndtering.
    // Samler fejl fra routes og sender en brugervenlig besked tilbage.
    app.use((err, req, res, next) => {
        const status = err.status || 500;
        const message = err.publicMessage || 'Der opstod en serverfejl.';
        const timestamp = new Date().toISOString();
        // Den tekniske fejl logges i terminalen, mens brugeren får en kort besked.
        console.error(
            `[${timestamp}] ${req.method} ${req.originalUrl} → ${status}\n${err.stack || err.message || err}`
        );
        res.status(status).json({ error: message });
    });

    server = app.listen(PORT, () => {
        console.log(`Server kører på http://localhost:${PORT}`);
        if (databaseError) {
            console.log('Bemærk: Databasen er ikke forbundet, så databasefunktioner virker først naar SQL Server kører.');
        }
    });

    // Holder processen i live i miljøer, hvor åbne forbindelser ellers kan lukke ned.
    keepAliveTimer = setInterval(() => {}, 60 * 60 * 1000);
}

startServer();
