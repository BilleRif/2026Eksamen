const sql = require('mssql');

class Database {
    // Gemmer config og starttilstand
    constructor(config) {
        this.config = config;
        this.poolconnection = null;   // databaseforbindelse
        this.connected = false;        // viser om vi er forbundet
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

    // Kører en query med parametre og returnerer rækkerne.
    async query(query, params = []) {
        if (!this.poolconnection) {
            throw new Error('Databaseforbindelsen er ikke oprettet.');
        }

        const request = this.poolconnection.request();
        params.forEach(p => request.input(p.name, p.type, p.value));
        const result = await request.query(query);
        return result.recordset;
    }

    // Kører INSERT/UPDATE/DELETE og returnerer antal ændrede rækker
    async execute(query, params = []) {
        const request = this.poolconnection.request();
        params.forEach(p => request.input(p.name, p.type, p.value));
        const result = await request.query(query);
        return result.rowsAffected[0];
    }
}

// Opretter databaseobjektet og forbinder til databasen.
const createDatabaseConnection = async (config) => {
    const database = new Database(config);
    await database.connect();
    return database;
};

module.exports = { Database, createDatabaseConnection, sql };
