const { Connection, Request, TYPES } = require('tedious');
const { BlobServiceClient } = require('@azure/storage-blob');

// Helper to parse Azure SQL connection string into Tedious configuration
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

// Helper to safely parse YYYYMMDD, YYYY-MM-DD, or ISO date strings
function parseDateInput(rawDate) {
    if (!rawDate) return new Date();
    const str = String(rawDate).trim();
    
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
        // 1. Fail early if mandatory payload fields are missing
        if (!req.body || !req.body.name || !req.body.surname || !req.body.email) {
            context.res = {
                status: 400,
                body: "Missing required profile fields (Name, Surname, or Email)."
            };
            return;
        }

        // 2. Unpack parameters from request body
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
            outcome,
            comments,
            files
        } = req.body;

        let uploadedUrls = [];

  // 3. --- AZURE BLOB STORAGE FILE UPLOAD LOGIC ---
        if (files && Array.isArray(files) && files.length > 0) {
            try {
                // Check both common connection string variable names
                const blobConnStr = process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
                
                if (!blobConnStr) {
                    context.log("ERROR: AZURE_STORAGE_CONNECTION_STRING is missing!");
                    // Output error directly so it's visible in devtools network tab
                    context.res = { status: 500, body: "Error: Missing AZURE_STORAGE_CONNECTION_STRING setting in Azure." };
                    return;
                }

                const blobServiceClient = BlobServiceClient.fromConnectionString(blobConnStr);
                const containerClient = blobServiceClient.getContainerClient('cv-uploads');
                
                // Ensure container exists
                await containerClient.createIfNotExists();

                const folderName = `${(name || 'candidate').trim()}_${(surname || 'file').trim()}`.replace(/[^a-zA-Z0-9_-]/g, '_');

                for (const file of files) {
                    const rawBase64 = file.base64 || file.data || file.content;
                    const fileName = file.fileName || file.name || `document_${Date.now()}.pdf`;

                    if (rawBase64) {
                        // EXPLICIT CLEANUP: Split on comma to get pure Base64 string
                        let pureBase64 = rawBase64;
                        if (pureBase64.includes(',')) {
                            pureBase64 = pureBase64.split(',')[1];
                        }

                        // Remove any whitespace/newlines
                        pureBase64 = pureBase64.trim().replace(/[\r\n\s]/g, '');

                        const fileBuffer = Buffer.from(pureBase64, 'base64');
                        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
                        const uniqueBlobPath = `${folderName}/${Date.now()}-${sanitizedFileName}`;
                        
                        const blockBlobClient = containerClient.getBlockBlobClient(uniqueBlobPath);
                        
                        // Use uploadData which natively handles Node Buffers reliably
                        await blockBlobClient.uploadData(fileBuffer);
                        
                        uploadedUrls.push(blockBlobClient.url);
                    }
                }
            } catch (storageErr) {
                context.log("CRITICAL BLOB STORAGE UPLOAD ERROR:", storageErr.stack || storageErr.message);
                context.res = { 
                    status: 500, 
                    body: `Blob Storage Upload Failed: ${storageErr.message}` 
                };
                return;
            }
        }

        // Final URL string stored in the database
        const finalUrlString = uploadedUrls.length > 0 
            ? uploadedUrls.join(', ') 
            : 'No Supporting documents';

        // 4. --- SQL SERVER DATABASE TRANSACTION ---
        const sqlConnStr = process.env.SqlConnectionString;
        if (!sqlConnStr) {
            context.res = { status: 500, body: "Error: Missing SqlConnectionString environment variable." };
            return;
        }

        const dbConfig = parseConnectionString(sqlConnStr);

        return new Promise((resolve) => {
            const connection = new Connection(dbConfig);

            connection.on('connect', (err) => {
                if (err) {
                    context.log("Database connection failure:", err);
                    context.res = { status: 500, body: `Database Connection Error: ${err.message}` };
                    resolve();
                    return;
                }

                const query = `
                    INSERT INTO [dbo].[Candidates_data] (
                        [Date], [Recruiter], [Name], [Surname], [Role], 
                        [Main_Country_Code], [Main_Base_Number], [Alternate_Country_Code], [Alternate_Base_Number], 
                        [Email], [Notice_Period], [Current_Location], [Nationality], 
                        [Current_Rate], [Expected_Rate], [Source], [Years_Of_Experience], 
                        [Outcome], [Comments], [cvUrl], [CreatedAt]
                    ) VALUES (
                        @Date, @Recruiter, @Name, @Surname, @Role, 
                        @MainCountryCode, @MainBaseNumber, @AlternateCountryCode, @AlternateBaseNumber, 
                        @Email, @NoticePeriod, @CurrentLocation, @Nationality, 
                        @CurrentRate, @ExpectedRate, @Source, @YearsOfExperience, 
                        @Outcome, @Comments, @cvUrl, GETDATE()
                    )
                `;

                const request = new Request(query, (requestErr) => {
                    if (requestErr) {
                        context.log("SQL execution error:", requestErr);
                        context.res = {
                            status: 500,
                            body: `SQL Write Failure: ${requestErr.message}`
                        };
                    } else {
                        context.log("Database write completed successfully.");
                        context.res = {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                success: true, 
                                message: "Recruit saved successfully.",
                                cvUrl: finalUrlString 
                            })
                        };
                    }
                    connection.close();
                    resolve();
                });

                // Helper for safe float parsing
                const parseNum = (val) => (val !== null && val !== undefined && val !== '') ? parseFloat(val) : null;

                // Parameter bindings
                request.addParameter('Date', TYPES.Date, parseDateInput(date));
                request.addParameter('Recruiter', TYPES.NVarChar, recruiter || null);
                request.addParameter('Name', TYPES.NVarChar, name.trim());
                request.addParameter('Surname', TYPES.NVarChar, surname.trim());
                request.addParameter('Role', TYPES.NVarChar, role || null);
                request.addParameter('MainCountryCode', TYPES.NVarChar, mainCountryCode || null);
                request.addParameter('MainBaseNumber', TYPES.NVarChar, mainBaseNumber || null);
                request.addParameter('AlternateCountryCode', TYPES.NVarChar, alternateCountryCode || null);
                request.addParameter('AlternateBaseNumber', TYPES.NVarChar, alternateBaseNumber || null);
                request.addParameter('Email', TYPES.NVarChar, email.trim());
                request.addParameter('NoticePeriod', TYPES.NVarChar, noticePeriod || null);
                request.addParameter('CurrentLocation', TYPES.NVarChar, currentLocation || null);
                request.addParameter('Nationality', TYPES.NVarChar, nationality || null);

                // Numeric bindings with precisions
                request.addParameter('CurrentRate', TYPES.Decimal, parseNum(currentRate), { precision: 18, scale: 2 });
                request.addParameter('ExpectedRate', TYPES.Decimal, parseNum(expectedRate), { precision: 18, scale: 2 });
                request.addParameter('Source', TYPES.NVarChar, source || null);
                request.addParameter('YearsOfExperience', TYPES.Decimal, parseNum(yearsOfExperience), { precision: 5, scale: 1 });

                // String and document bindings
                request.addParameter('Outcome', TYPES.NVarChar, outcome || null);
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