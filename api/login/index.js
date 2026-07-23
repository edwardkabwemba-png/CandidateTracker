const { Connection, Request, TYPES } = require('tedious');
const crypto = require('crypto'); // Built-in Node.js module (highly stable, zero-dependency)

// Helper to parse ADO.NET connection string into Tedious config
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

module.exports = async function (context, req) {
    context.log('Processing secure application login request...');
    
    try {
                const connectionString = process.env.SqlConnectionString;

        // Guard check for environment variable
        if (!connectionString) {
            context.log("Missing SqlConnectionString environment variable!");
            context.res = {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Server configuration missing database connection string." })
            };
            return;
        }

        // Force parse body if stringified
        let body = req.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {
                context.res = { status: 400, body: "Malformed JSON payload." };
                return;
            }
        }

        const { email, password } = body || {};

        if (!email || !password) {
            context.res = { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' },
                body: { message: "Missing login credentials payload fields." } 
            };
            return;
        }

         // 1. Fetch user data using connection string
        const matchedUser = await getUserFromDatabase(connectionString, email.trim(), context);

        if (!matchedUser) {
            context.log.warn(`User target matching identifier not found: ${email}`);
            context.res = { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' },
                body: { message: "Invalid login credentials." } 
            };
            return;
        }

        // 2. Safely grab the password hash string from the database column
        const dbHash = matchedUser.PasswordHash ? String(matchedUser.PasswordHash).trim() : '';

        if (!dbHash) {
            context.log.error(`Security record issue: Password hash for user ID ${matchedUser.UserID} is null or blank.`);
            context.res = { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' },
                body: { message: "Authentication database integrity check failed." } 
            };
            return;
        }

        // 3. Hash the incoming password using SHA-256 to compare against the DB
        const incomingHash = crypto.createHash('sha256').update(password).digest('hex');

        // Note: 'password === dbHash' acts as a temporary fallback for your existing plaintext test accounts
        if (incomingHash === dbHash || password === dbHash) {
            context.log('Credential verification confirmed.');
            context.res = {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: {
                    id: matchedUser.UserID,
                    name: matchedUser.FullName,
                    avatar: matchedUser.AvatarInitials
                }
            };
        } else {
            context.log.warn('Password verification rejected.');
            context.res = { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' },
                body: { message: "Invalid login credentials." } 
            };
        }

    } catch (error) {
        context.log.error("Fatal exception intercepted during worker execution pipeline:", error.message);
        context.res = { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' },
            body: { message: "Internal application processing error.", details: error.message } 
        };
    }
};

/**
 * Helper function to handle tedious lifecycle operations sequentially using Promises.
 */
function getUserFromDatabase(connectionString, email, context) {
    return new Promise((resolve, reject) => {
        const config = parseConnectionString(connectionString);

        connection.on('connect', (err) => {
            if (err) {
                return reject(new Error(`Failed to establish database connection channel: ${err.message}`));
            }

            const query = `
                SELECT UserID, Email, PasswordHash, FullName, AvatarInitials 
                FROM [dbo].[Users] 
                WHERE LOWER(Email) = LOWER(@Email)
            `;

            const request = new Request(query, (requestErr) => {
                // Explicitly clean up database connection resources when the statement finishes
                connection.close();

                if (requestErr) {
                    return reject(new Error(`SQL query execution engine exception: ${requestErr.message}`));
                }

                resolve(userResult);
            });

            // Map standard parameter types safely
            request.addParameter('Email', TYPES.VarChar, email);

            // Row emission tracker mapping column properties out cleanly
            request.on('row', (columns) => {
                let userObj = {};
                columns.forEach((col) => {
                    userObj[col.metadata.colName] = col.value;
                });
                userResult = userObj;
            });

            connection.execSql(request);
        });

        // Initialize connection state explicitly
        connection.connect();
    });
}