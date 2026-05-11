-- ============================================================================
--  Ejendomsinvesterings-app — Databaseskema (T-SQL / SQL Server)
--  CBS HA(IT) — Programmering og udvikling af små systemer, F2026
--
--  Kør dette script én gang mod en tom database for at oprette alle tabeller.
--  Skemaet er normaliseret til 3NF: hver investeringscase er knyttet til én
--  ejendom, og alle linje-poster (omkostninger, renoveringer, driftsudgifter)
--  refererer til en case via fremmednøgle med ON DELETE CASCADE, så sletning
--  af en case automatisk rydder op i de tilknyttede rækker.
--
--  Læs ER-diagrammet i appendiks i rapporten for visualiseret oversigt.
-- ============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

-- ─── 1. Ejendom ─────────────────────────────────────────────────────────────
-- Én ejendom kan have flere investeringscases (1:N).
-- BBR-felterne er nullable, fordi en bruger kan oprette en ejendom alene
-- ud fra DAWA-validering før BBR-data er hentet.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Ejendom')
BEGIN
    CREATE TABLE [dbo].[Ejendom] (
        [ejendom_id]       INT             IDENTITY(1,1) NOT NULL,
        [vejnavn]          NVARCHAR(100)   NOT NULL,
        [husnummer]        NVARCHAR(20)    NOT NULL,
        [postnummer]       NVARCHAR(10)    NOT NULL,
        [bynavn]           NVARCHAR(100)   NOT NULL,
        [bbr_id]           NVARCHAR(50)    NULL,
        [ejendomstype]     NVARCHAR(100)   NULL,
        [byggeaar]         INT             NULL,
        [boligareal_m2]    DECIMAL(10,2)   NULL,
        [antal_vaerelser]  INT             NULL,
        [grundareal_m2]    DECIMAL(10,2)   NULL,
        [oprettet]         DATETIME2       NOT NULL CONSTRAINT DF_Ejendom_oprettet        DEFAULT SYSDATETIME(),
        [sidst_opdateret]  DATETIME2       NOT NULL CONSTRAINT DF_Ejendom_sidst_opdateret DEFAULT SYSDATETIME(),
        [arkiveret]        BIT             NOT NULL CONSTRAINT DF_Ejendom_arkiveret       DEFAULT 0,
        CONSTRAINT PK_Ejendom PRIMARY KEY CLUSTERED ([ejendom_id])
    );
END
GO

-- ─── 1a. Ejendom: kolonne-migrationer ──────────────────────────────────────
-- Idempotent migration for gruppemedlemmer der har en ældre version af
-- Ejendom-tabellen uden sidst_opdateret/arkiveret. Kører kun ALTER TABLE
-- hvis kolonnen mangler, så scriptet kan køres flere gange uden fejl.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME = 'Ejendom' AND COLUMN_NAME = 'sidst_opdateret')
BEGIN
    ALTER TABLE [dbo].[Ejendom]
        ADD [sidst_opdateret] DATETIME2 NOT NULL
            CONSTRAINT DF_Ejendom_sidst_opdateret_migration DEFAULT SYSDATETIME();
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME = 'Ejendom' AND COLUMN_NAME = 'arkiveret')
BEGIN
    ALTER TABLE [dbo].[Ejendom]
        ADD [arkiveret] BIT NOT NULL
            CONSTRAINT DF_Ejendom_arkiveret_migration DEFAULT 0;
END
GO

-- ─── 2. InvesteringsCase ────────────────────────────────────────────────────
-- En case repræsenterer ét scenarie for en ejendom (fx "Plan A — udlejning").
-- Unik (ejendom_id, navn) sikrer, at samme case-navn ikke gentages pr. ejendom.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'InvesteringsCase')
BEGIN
    CREATE TABLE [dbo].[InvesteringsCase] (
        [case_id]      INT             IDENTITY(1,1) NOT NULL,
        [ejendom_id]   INT             NOT NULL,
        [navn]         NVARCHAR(100)   NOT NULL,
        [beskrivelse]  NVARCHAR(500)   NULL,
        [oprettet]     DATETIME2       NOT NULL CONSTRAINT DF_InvesteringsCase_oprettet DEFAULT SYSDATETIME(),
        CONSTRAINT PK_InvesteringsCase PRIMARY KEY CLUSTERED ([case_id]),
        CONSTRAINT FK_InvesteringsCase_Ejendom
            FOREIGN KEY ([ejendom_id]) REFERENCES [dbo].[Ejendom]([ejendom_id])
            ON DELETE CASCADE,
        CONSTRAINT UQ_InvesteringsCase_ejendom_navn UNIQUE ([ejendom_id], [navn])
    );
    CREATE INDEX IX_InvesteringsCase_ejendom_id
        ON [dbo].[InvesteringsCase]([ejendom_id]);
END
GO

-- ─── 3. Finansiering ────────────────────────────────────────────────────────
-- Én case har 0..1 finansieringsrækker. Vi håndhæver 1:1 via UNIQUE(case_id),
-- så et POST mod en case der allerede har finansiering, fejler kontrolleret.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Finansiering')
BEGIN
    CREATE TABLE [dbo].[Finansiering] (
        [finansiering_id]  INT            IDENTITY(1,1) NOT NULL,
        [case_id]          INT            NOT NULL,
        [laanebeloeb]      DECIMAL(18,2)  NOT NULL,
        [rente_pct]        DECIMAL(5,3)   NOT NULL,
        [loebetid_aar]     INT            NOT NULL,
        [afdragsfri_aar]   INT            NOT NULL CONSTRAINT DF_Finansiering_afdragsfri DEFAULT 0,
        [laanetype]        NVARCHAR(50)   NULL,
        CONSTRAINT PK_Finansiering PRIMARY KEY CLUSTERED ([finansiering_id]),
        CONSTRAINT FK_Finansiering_Case
            FOREIGN KEY ([case_id]) REFERENCES [dbo].[InvesteringsCase]([case_id])
            ON DELETE CASCADE,
        CONSTRAINT UQ_Finansiering_case_id UNIQUE ([case_id]),
        CONSTRAINT CK_Finansiering_loebetid       CHECK ([loebetid_aar] > 0),
        CONSTRAINT CK_Finansiering_afdragsfri     CHECK ([afdragsfri_aar] >= 0 AND [afdragsfri_aar] <= [loebetid_aar]),
        CONSTRAINT CK_Finansiering_laanebeloeb    CHECK ([laanebeloeb] >= 0)
    );
END
GO

-- ─── 4. Koebsomkostning ─────────────────────────────────────────────────────
-- Variabelt antal omkostningslinjer pr. case (ejendomspris, tinglysning,
-- advokat, købsrådgivning m.v.).

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Koebsomkostning')
BEGIN
    CREATE TABLE [dbo].[Koebsomkostning] (
        [koebsomkostning_id]  INT            IDENTITY(1,1) NOT NULL,
        [case_id]             INT            NOT NULL,
        [beskrivelse]         NVARCHAR(100)  NOT NULL,
        [beloeb]              DECIMAL(18,2)  NOT NULL,
        CONSTRAINT PK_Koebsomkostning PRIMARY KEY CLUSTERED ([koebsomkostning_id]),
        CONSTRAINT FK_Koebsomkostning_Case
            FOREIGN KEY ([case_id]) REFERENCES [dbo].[InvesteringsCase]([case_id])
            ON DELETE CASCADE,
        CONSTRAINT CK_Koebsomkostning_beloeb CHECK ([beloeb] >= 0)
    );
    CREATE INDEX IX_Koebsomkostning_case_id ON [dbo].[Koebsomkostning]([case_id]);
END
GO

-- ─── 5. Renovering ──────────────────────────────────────────────────────────
-- Variabelt antal renoveringer pr. case, hver med et planlagt år.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Renovering')
BEGIN
    CREATE TABLE [dbo].[Renovering] (
        [renovering_id]  INT            IDENTITY(1,1) NOT NULL,
        [case_id]        INT            NOT NULL,
        [beskrivelse]    NVARCHAR(100)  NOT NULL,
        [beloeb]         DECIMAL(18,2)  NOT NULL,
        [aar]            INT            NOT NULL,
        CONSTRAINT PK_Renovering PRIMARY KEY CLUSTERED ([renovering_id]),
        CONSTRAINT FK_Renovering_Case
            FOREIGN KEY ([case_id]) REFERENCES [dbo].[InvesteringsCase]([case_id])
            ON DELETE CASCADE,
        CONSTRAINT CK_Renovering_beloeb CHECK ([beloeb] >= 0),
        CONSTRAINT CK_Renovering_aar    CHECK ([aar] > 0)
    );
    CREATE INDEX IX_Renovering_case_id ON [dbo].[Renovering]([case_id]);
END
GO

-- ─── 6. Driftsudgift ────────────────────────────────────────────────────────
-- Variabelt antal månedlige driftsposter (forsikring, ejendomsskat, fællesudg.).

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Driftsudgift')
BEGIN
    CREATE TABLE [dbo].[Driftsudgift] (
        [driftsudgift_id]  INT            IDENTITY(1,1) NOT NULL,
        [case_id]          INT            NOT NULL,
        [navn]             NVARCHAR(100)  NOT NULL,
        [beloeb_maaned]    DECIMAL(18,2)  NOT NULL,
        CONSTRAINT PK_Driftsudgift PRIMARY KEY CLUSTERED ([driftsudgift_id]),
        CONSTRAINT FK_Driftsudgift_Case
            FOREIGN KEY ([case_id]) REFERENCES [dbo].[InvesteringsCase]([case_id])
            ON DELETE CASCADE,
        CONSTRAINT CK_Driftsudgift_beloeb CHECK ([beloeb_maaned] >= 0)
    );
    CREATE INDEX IX_Driftsudgift_case_id ON [dbo].[Driftsudgift]([case_id]);
END
GO

-- ─── 7. Udlejning ───────────────────────────────────────────────────────────
-- Én case har 0..1 udlejningsrækker (sat hvis brugeren markerer "udlej").
-- UNIQUE(case_id) håndhæver 1:1.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Udlejning')
BEGIN
    CREATE TABLE [dbo].[Udlejning] (
        [udlejning_id]      INT            IDENTITY(1,1) NOT NULL,
        [case_id]           INT            NOT NULL,
        [maanedlig_leje]    DECIMAL(18,2)  NOT NULL,
        [maanedlig_udgift]  DECIMAL(18,2)  NOT NULL CONSTRAINT DF_Udlejning_udgift DEFAULT 0,
        CONSTRAINT PK_Udlejning PRIMARY KEY CLUSTERED ([udlejning_id]),
        CONSTRAINT FK_Udlejning_Case
            FOREIGN KEY ([case_id]) REFERENCES [dbo].[InvesteringsCase]([case_id])
            ON DELETE CASCADE,
        CONSTRAINT UQ_Udlejning_case_id UNIQUE ([case_id]),
        CONSTRAINT CK_Udlejning_leje    CHECK ([maanedlig_leje] >= 0),
        CONSTRAINT CK_Udlejning_udgift  CHECK ([maanedlig_udgift] >= 0)
    );
END
GO

PRINT 'Skema oprettet.';
