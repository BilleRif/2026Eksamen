INSTALLATION OG KØRSEL

Kør kommandoerne fra projektets rodmappe:

1. npm i
2. npm start

Appen kan derefter åbnes på:

http://localhost:3000/

DATABASE

Databasefunktionerne kræver, at SQL Server kører, og at `.env` er udfyldt med de korrekte databaseoplysninger.

Databaseskemaet findes i:

sql/schema.sql

Skemaet skal køres på databasen, før appens CRUD-funktioner virker korrekt.

TEST

Projektet bruger Node.js' indbyggede test-runner.

Tests køres med:

npm test

Testene dækker centrale beregnings- og valideringsfunktioner:

- finansieringsBeregner
- simuleringBeregner
- ejendomsValidering

Såfremt .env filen ikke allerede findes.
Så skal den oprettes i roden.
Så har vi de credentials vi bruger herunder: 

DB_SERVER=cbs-prog-eksamen-2026.database.windows.net
DB_PORT=1433
DB_NAME=eksamen2026-database
DB_USER=hhkm2026
DB_PASSWORD=CBSprog2026
