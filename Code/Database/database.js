const sql = require('mssql');

class Database {
    // Constructor: gemmer config og sætter starttilstand
    constructor(config) {
        this.config = config;
        this.poolconnection = null;   // connection pool - starter som null
        this.connected = false;        // flag: er vi forbundet?
    }

    // Opretter forbindelse til SQL Server
    async connect() {
        try {
            this.poolconnection = await sql.connect(this.config);
            this.connected = true;
            console.log('Database forbundet.');
            return this.poolconnection;
        } catch (error) {
            console.error('Fejl ved forbindelse til database:', error);
            this.connected = false;
            throw error;
        }
    }


    // Lukker forbindelsen
    async disconnect() {
        try {
            if (this.connected) {
                await this.poolconnection.close();
                this.connected = false;
                console.log('Database forbindelse lukket.');
            }
        } catch (error) {
            console.error('Fejl ved lukning af database:', error);
        }
    }

    // Kører en parametriseret query og returnerer rækkerne fra recordset.
    // Bruges både til SELECT og til INSERT/UPDATE/DELETE med OUTPUT-klausul,
    // hvor SQL Server returnerer den indsatte/opdaterede/slettede række.
    // params er et array af { name, type, value } objekter.
    async query(query, params = []) {
        if (!this.poolconnection) {
            throw new Error('Databaseforbindelsen er ikke oprettet.');
        }

        const request = this.poolconnection.request();
        params.forEach(p => request.input(p.name, p.type, p.value));
        const result = await request.query(query);
        return result.recordset;
    }

    // Kører INSERT/UPDATE/DELETE og returnerer antal påvirkede rækker
    async execute(query, params = []) {
        const request = this.poolconnection.request();
        params.forEach(p => request.input(p.name, p.type, p.value));
        const result = await request.query(query);
        return result.rowsAffected[0];
    }
}

// Factory-funktion: opretter Database-instans og forbinder
const createDatabaseConnection = async (config) => {
    const database = new Database(config);
    await database.connect();
    return database;
};

module.exports = { Database, createDatabaseConnection, sql };