-- ============================================================================
--  Ejendomsinvesterings-app — Databaseskema (T-SQL / SQL Server)
--  CBS HA(IT) — Programmering og udvikling af små systemer, F2026
--
--  Kør dette script én gang mod en tom database for at oprette alle tabeller.
--  Hver investeringscase hører til én ejendom.
--  Linjer som omkostninger, renoveringer og drift hører til en case
--  og slettes automatisk sammen med den.
--
--  Læs ER-diagrammet i appendiks i rapporten for visualiseret oversigt.
-- ============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

-- ─── 1. Ejendom ─────────────────────────────────────────────────────────────
-- Én ejendom kan have flere investeringscases (1:N).
-- BBR-felterne må være tomme, hvis BBR-data ikke er hentet endnu.

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
-- Tilføjer manglende kolonner, hvis en ældre database bruges.
-- Scriptet kan derfor køres flere gange.

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

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_NAME = 'Ejendom' AND COLUMN_NAME = N'antal_værelser')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_NAME = 'Ejendom' AND COLUMN_NAME = 'antal_vaerelser')
BEGIN
    EXEC sp_rename N'dbo.Ejendom.antal_værelser', 'antal_vaerelser', 'COLUMN';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_NAME = 'Ejendom' AND COLUMN_NAME = N'byggeår')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_NAME = 'Ejendom' AND COLUMN_NAME = 'byggeaar')
BEGIN
    EXEC sp_rename N'dbo.Ejendom.byggeår', 'byggeaar', 'COLUMN';
END
GO

-- ─── 2. InvesteringsCase ────────────────────────────────────────────────────
-- En case er ét scenarie for en ejendom.
-- Samme ejendom må ikke have to cases med samme navn.

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
-- En case kan højst have én finansiering.

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

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Finansiering' AND COLUMN_NAME = N'lånebeløb')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Finansiering' AND COLUMN_NAME = 'laanebeloeb')
BEGIN
    EXEC sp_rename N'dbo.Finansiering.lånebeløb', 'laanebeloeb', 'COLUMN';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Finansiering' AND COLUMN_NAME = N'løbetid_år')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Finansiering' AND COLUMN_NAME = 'loebetid_aar')
BEGIN
    EXEC sp_rename N'dbo.Finansiering.løbetid_år', 'loebetid_aar', 'COLUMN';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Finansiering' AND COLUMN_NAME = 'afdragsfri_aar')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Finansiering' AND COLUMN_NAME = N'afdragsfri_aar')
BEGIN
    EXEC sp_rename 'dbo.Finansiering.afdragsfri_aar', N'afdragsfri_aar', 'COLUMN';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Finansiering' AND COLUMN_NAME = N'lånetype')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Finansiering' AND COLUMN_NAME = 'laanetype')
BEGIN
    EXEC sp_rename N'dbo.Finansiering.lånetype', 'laanetype', 'COLUMN';
END
GO

-- ─── 4. Koebsomkostning ─────────────────────────────────────────────────────
-- Variabelt antal omkostningslinjer pr. case (ejendomspris, tinglysning,
-- advokat, købsrådgivning m.v.).

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = N'Købsomkostning')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Koebsomkostning')
BEGIN
    EXEC sp_rename N'dbo.Købsomkostning', 'Koebsomkostning';
END
GO

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

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Koebsomkostning' AND COLUMN_NAME = N'købsomkostning_id')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Koebsomkostning' AND COLUMN_NAME = 'koebsomkostning_id')
BEGIN
    EXEC sp_rename N'dbo.Koebsomkostning.købsomkostning_id', 'koebsomkostning_id', 'COLUMN';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Koebsomkostning' AND COLUMN_NAME = N'beløb')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Koebsomkostning' AND COLUMN_NAME = 'beloeb')
BEGIN
    EXEC sp_rename N'dbo.Koebsomkostning.beløb', 'beloeb', 'COLUMN';
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

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Renovering' AND COLUMN_NAME = N'beløb')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Renovering' AND COLUMN_NAME = 'beloeb')
BEGIN
    EXEC sp_rename N'dbo.Renovering.beløb', 'beloeb', 'COLUMN';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Renovering' AND COLUMN_NAME = N'år')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Renovering' AND COLUMN_NAME = 'aar')
BEGIN
    EXEC sp_rename N'dbo.Renovering.år', 'aar', 'COLUMN';
END
GO

-- ─── 6. Driftsudgift ────────────────────────────────────────────────────────
-- Variabelt antal maanedlige driftsposter (forsikring, ejendomsskat, fællesudg.).

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

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Driftsudgift' AND COLUMN_NAME = N'beløb_måned')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Driftsudgift' AND COLUMN_NAME = 'beloeb_maaned')
BEGIN
    EXEC sp_rename N'dbo.Driftsudgift.beløb_måned', 'beloeb_maaned', 'COLUMN';
END
GO

-- ─── 7. Udlejning ───────────────────────────────────────────────────────────
-- En case kan højst have én udlejningsrække.

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

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Udlejning' AND COLUMN_NAME = N'månedlig_leje')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Udlejning' AND COLUMN_NAME = 'maanedlig_leje')
BEGIN
    EXEC sp_rename N'dbo.Udlejning.månedlig_leje', 'maanedlig_leje', 'COLUMN';
END
GO

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Udlejning' AND COLUMN_NAME = N'månedlig_udgift')
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Udlejning' AND COLUMN_NAME = 'maanedlig_udgift')
BEGIN
    EXEC sp_rename N'dbo.Udlejning.månedlig_udgift', 'maanedlig_udgift', 'COLUMN';
END
GO

PRINT 'Skema oprettet.';
