const { Connection, Request, TYPES } = require('tedious');
const { BlobServiceClient } = require('@azure/storage-blob');

// Parse Azure SQL connection string (consistent with getUsers/getPositions)
function parseConnectionString(connectionString) {
    const config = { options: { encrypt: true, trustServerCertificate: false, connectTimeout: 15000 } };
    if (!connectionString) return config;

    const parts = connectionString.split(';').reduce((acc, current) => {
        const [key, ...value] = current.split('=');
        if (key && value.length) {
            acc[key.trim().toLowerCase()] = value.join('=').trim();
        }
        return acc;
    }, {});

    const rawServer = parts['server'] || parts['data source'] || '';
    config.server = rawServer.replace(/^tcp:/i, '').split(',')[0];

    config.authentication = {
        type: 'default',
        options: {
            userName: parts['user id'] || parts['uid'] || '',
            password: parts['password'] || parts['pwd'] || ''
        }
    };

    config.options.database = parts['initial catalog'] || parts['database'] || '';
    return config;
}

// Helper to safely parse YYYYMMDD, YYYY-MM-DD, or ISO strings into a valid Date object
function parseDateInput(rawDate) {
    if (!rawDate) return new Date();
    const str = String(rawDate).trim();
    
    // Handle YYYYMMDD format (e.g., "20260723")
    if (/^\d{8}$/.test(str)) {
        const y = parseInt(str.substring(0, 4), 10);
        const m = parseInt(str.substring(4, 6), 10) - 1;
        const d = parseInt(str.substring(6, 8), 10);
        return new Date(y, m, d);
    }
    
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
}

module.exports = async function (context, req) {
    try {
        // 1. Fail immediately if required data fields are missing
        if (!req.body || !req.body.name || !req.body.surname || !req.body.email) {
            context.res = {
                status: 400,
                body: "Missing required profile fields (Name, Surname, or Email)."
            };
            return;
        }

        // 2. Unpack keys from frontend request
        const {
            date,
            recruiter,
            name,
            surname,
            role,
            mainCountryCode,
            mainBaseNumber,
            alternateCountryCode,
            alternateBaseNumber,
            email,
            noticePeriod,
            currentLocation,
            nationality,
            currentRate,
            expectedRate,
            source,
            yearsOfExperience,
            comments,
            files
        } = req.body;

        let uploadedUrls = [];

        // 3. --- AZURE BLOB STORAGE UPLOAD INTEGRATION ---
        if (files && Array.isArray(files) && files.length > 0) {
            try {
                const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
                if (!connectionString) {
                    context.res = { status: 500, body: "Error: Missing AZURE_STORAGE_CONNECTION_STRING setting." };
                    return;
                }

                const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
                const containerClient = blobServiceClient.getContainerClient('cv-uploads');
                await containerClient.createIfNotExists();

                const folderName = `${name.trim()}_${surname.trim()}`;

                for (const file of files) {
                    if (file.base64) {
                        const cleanBase64 = file.base64.includes(',') ? file.base64.split(',')[1] : file.base64;
                        const fileBuffer = Buffer.from(cleanBase64, 'base64');
                        
                        const uniqueFileName = `${folderName}/${Date.now()}-${file.fileName}`;
                        const blockBlobClient = containerClient.getBlockBlobClient(uniqueFileName);
                        
                        await blockBlobClient.upload(fileBuffer, fileBuffer.length);
                        uploadedUrls.push(blockBlobClient.url);
                    }
                }
            } catch (storageErr) {
                context.log("Blob Storage upload fatal error:", storageErr.message);
                context.res = { status: 500, body: `Blob Storage Error: ${storageErr.message}` };
                return;
            }
        }

        const finalUrlString = uploadedUrls.length > 0 ? uploadedUrls.join(', ') : null;

        // 4. --- SQL SERVER DATABASE TRANSACTION ---
        const connectionString = process.env.SqlConnectionString;
        if (!connectionString) {
            context.res = { status: 500, body: "Error: Missing SqlConnectionString environment variable." };
            return;
        }

        const dbConfig = parseConnectionString(connectionString);

        return new Promise((resolve) => {
            const connection = new Connection(dbConfig);

            connection.on('connect', (err) => {
                if (err) {
                    context.log("Database connection failure in saveRecruit:", err);
                    context.res = { status: 500, body: `Database Connection Error: ${err.message}` };
                    resolve();
                    return;
                }

                const query = `
                    INSERT INTO [dbo].[Recruits] (
                        [Date], [Recruiter], [Name], [Surname], [Role], 
                        [MainCountryCode], [MainBaseNumber], [AlternateCountryCode], [AlternateBaseNumber], 
                        [Email], [NoticePeriod], [CurrentLocation], [Nationality], 
                        [CurrentRate], [ExpectedRate], [Source], [YearsOfExperience], 
                        [Comments], [cvUrl], [CreatedAt]
                    ) VALUES (
                        @Date, @Recruiter, @Name, @Surname, @Role, 
                        @MainCountryCode, @MainBaseNumber, @AlternateCountryCode, @AlternateBaseNumber, 
                        @Email, @NoticePeriod, @CurrentLocation, @Nationality, 
                        @CurrentRate, @ExpectedRate, @Source, @YearsOfExperience, 
                        @Comments, @cvUrl, GETDATE()
                    )
                `;

                const request = new Request(query, (requestErr) => {
                    if (requestErr) {
                        context.log("SQL execution failure in saveRecruit:", requestErr);
                        context.res = {
                            status: 500,
                            body: `SQL Write Failure: ${requestErr.message}`
                        };
                    } else {
                        context.log("Database row successfully written.");
                        context.res = {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                            body: { success: true, message: "Recruit safely committed to database." }
                        };
                    }
                    connection.close();
                    resolve();
                });

                // Parameter binding matching database types safely
                request.addParameter('Date', TYPES.Date, parseDateInput(date));
                request.addParameter('Recruiter', TYPES.NVarChar, recruiter || null);
                request.addParameter('Name', TYPES.NVarChar, name);
                request.addParameter('Surname', TYPES.NVarChar, surname);
                request.addParameter('Role', TYPES.NVarChar, role || null);
                request.addParameter('MainCountryCode', TYPES.NVarChar, mainCountryCode || null);
                request.addParameter('MainBaseNumber', TYPES.NVarChar, mainBaseNumber || null);
                request.addParameter('AlternateCountryCode', TYPES.NVarChar, alternateCountryCode || null);
                request.addParameter('AlternateBaseNumber', TYPES.NVarChar, alternateBaseNumber || null);
                request.addParameter('Email', TYPES.NVarChar, email);
                request.addParameter('NoticePeriod', TYPES.NVarChar, noticePeriod || null);
                request.addParameter('CurrentLocation', TYPES.NVarChar, currentLocation || null);
                request.addParameter('Nationality', TYPES.NVarChar, nationality || null);
                request.addParameter('CurrentRate', TYPES.Decimal, (currentRate !== null && currentRate !== undefined && currentRate !== '') ? parseFloat(currentRate) : null);
                request.addParameter('ExpectedRate', TYPES.Decimal, (expectedRate !== null && expectedRate !== undefined && expectedRate !== '') ? parseFloat(expectedRate) : null);
                request.addParameter('Source', TYPES.NVarChar, source || null);
                request.addParameter('YearsOfExperience', TYPES.Decimal, (yearsOfExperience !== null && yearsOfExperience !== undefined && yearsOfExperience !== '') ? parseFloat(yearsOfExperience) : null);
                request.addParameter('Comments', TYPES.NVarChar, comments || null);
                request.addParameter('cvUrl', TYPES.NVarChar, finalUrlString); 

                connection.execSql(request);
            });

            connection.connect();
        });

    } catch (globalFatalError) {
        context.log("Global Fatal Execution Error:", globalFatalError.message);
        context.res = {
            status: 500,
            body: `Fatal Script Error: ${globalFatalError.message}`
        };
    }
};