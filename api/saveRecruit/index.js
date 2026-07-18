const { Connection, Request, TYPES } = require('tedious');
const { BlobServiceClient } = require('@azure/storage-blob');

const config = {
    server: process.env.DB_SERVER,
    authentication: {
        type: 'default',
        options: {
            userName: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        }
    },
    options: {
        database: process.env.DB_NAME,
        encrypt: true,
        trustServerCertificate: false
    }
};

module.exports = async function (context, req) {
    try {
        // 1. Fail immediately if required data fields are completely missing from the frontend request
        if (!req.body || !req.body.name || !req.body.surname || !req.body.email) {
            context.res = {
                status: 400,
                body: "Missing required profile fields (Name, Surname, or Email)."
            };
            return;
        }

        // 2. Unpack keys matching your new schema format from the frontend request
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
            files // Multi-file array from frontend
        } = req.body;

        let uploadedUrls = [];

        // 3. --- AZURE BLOB STORAGE UPLOAD INTEGRATION (MULTIPLE FILES) ---
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

                // Virtual folder path name structure: "Name_Surname"
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
        } else {
            context.res = { status: 400, body: "Missing required supporting file attachment arrays." };
            return;
        }

        const finalUrlString = uploadedUrls.join(', ');

        // 4. --- SQL SERVER DATABASE TRANSACTION ---
        return new Promise((resolve) => {
            const connection = new Connection(config);

            connection.on('connect', (err) => {
                if (err) {
                    context.log("Database connection failure in saveRecruit:", err);
                    context.res = { status: 500, body: `Database Connection Error: ${err.message}` };
                    resolve();
                    return;
                }

                // Query updated to match your exact new database column format
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
                        context.log("SQL execution statement failure in saveRecruit:", requestErr);
                        context.res = {
                            status: 500,
                            body: `SQL Write Failure: ${requestErr.message}`
                        };
                    } else {
                        context.log("Database row successfully written with new schema layout.");
                        context.res = {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                            body: { success: true, message: "Recruit safely committed to database." }
                        };
                    }
                    connection.close();
                    resolve();
                });

                // Parameter binding matching types accurately down to the database layout
                request.addParameter('Date', TYPES.Date, date ? new Date(date) : new Date());
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
                request.addParameter('CurrentRate', TYPES.Decimal, currentRate ? parseFloat(currentRate) : null);
                request.addParameter('ExpectedRate', TYPES.Decimal, expectedRate ? parseFloat(expectedRate) : null);
                request.addParameter('Source', TYPES.NVarChar, source || null);
                request.addParameter('YearsOfExperience', TYPES.Decimal, yearsOfExperience ? parseFloat(yearsOfExperience) : null);
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