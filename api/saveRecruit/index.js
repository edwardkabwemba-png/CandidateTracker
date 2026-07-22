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
        if (!req.body || !req.body.firstName || !req.body.surname || !req.body.email) {
            context.res = {
                status: 400,
                body: "Missing required profile fields (First Name, Surname, or Email)."
            };
            return;
        }

        // 2. Unpack keys passed directly by your index.html submitForm() logic
        const {
            recruiterId,
            dateSourced,
            firstName,
            surname,
            sourceId,
            noticePeriodId,
            expectedRate,
            countryId,
            phone, 
            email, 
            positionId,
            outcomeId,
            comments,
            files // This is the new multi-file array from the frontend
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
                
                // Create container as private by default if it doesn't exist
                await containerClient.createIfNotExists();

                // Virtual folder path name structure: "FirstName_Surname"
                const folderName = `${firstName.trim()}_${surname.trim()}`;

                // Loop through and process each file payload safely
                for (const file of files) {
                    if (file.base64) {
                        // Strip base64 data URL prefix if it accidentally leaked through from FileReader
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

        // Combine all successfully uploaded document links together separated by a comma
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

                const query = `
                    INSERT INTO [dbo].[Recruits] (
                        RecruiterID, DateSourced, FirstName, Surname, SourceID, 
                        NoticePeriodID, ExpectedRate, CountryID, PhoneCode, PhoneNumber, 
                        EmailAddress, PositionID, OutcomeID, Comments, cvUrl, CreatedAt
                    ) VALUES (
                        @RecruiterID, @DateSourced, @FirstName, @Surname, @SourceID, 
                        @NoticePeriodID, @ExpectedRate, @CountryID, @PhoneCode, @PhoneNumber, 
                        @EmailAddress, @PositionID, @OutcomeID, @Comments, @cvUrl, GETDATE()
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
                        context.log("Database row successfully written with multiple document link chains.");
                        context.res = {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                            body: { success: true, message: "Recruit safely committed to database." }
                        };
                    }
                    connection.close();
                    resolve();
                });

                // Parse phone layouts safely
                const derivedPhoneCode = phone ? phone.slice(0, 3) : '';
                const derivedPhoneNum = phone ? phone.slice(3) : '';

                // Parameter parameter logic bindings mapping exactly down to column schema structure
                request.addParameter('RecruiterID', TYPES.Int, parseInt(recruiterId) || 1);
                request.addParameter('DateSourced', TYPES.VarChar, dateSourced || '');
                request.addParameter('FirstName', TYPES.NVarChar, firstName);
                request.addParameter('Surname', TYPES.NVarChar, surname);
                request.addParameter('SourceID', TYPES.Int, parseInt(sourceId) || 1);
                request.addParameter('NoticePeriodID', TYPES.Int, parseInt(noticePeriodId) || 1);
                request.addParameter('ExpectedRate', TYPES.Decimal, parseFloat(expectedRate) || 0.00);
                request.addParameter('CountryID', TYPES.Int, parseInt(countryId) || 1);
                request.addParameter('PhoneCode', TYPES.NVarChar, derivedPhoneCode);
                request.addParameter('PhoneNumber', TYPES.NVarChar, derivedPhoneNum);
                request.addParameter('EmailAddress', TYPES.NVarChar, email);
                request.addParameter('PositionID', TYPES.Int, parseInt(positionId) || 1);
                request.addParameter('OutcomeID', TYPES.Int, outcomeId ? parseInt(outcomeId) : 1);
                request.addParameter('Comments', TYPES.NVarChar, comments || null);
                request.addParameter('cvUrl', TYPES.NVarChar, finalUrlString); // Commits the multi-link comma list here

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