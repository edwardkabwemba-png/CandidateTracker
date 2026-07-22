const { Connection, Request, TYPES } = require('tedious');
const crypto = require('crypto'); // Built-in Node.js module

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
    context.log('Processing secure system user registration request...');

    try {
        const connectionString = process.env.SqlConnectionString;

        // Guard check for connection string environment variable
        if (!connectionString) {
            context.log("Missing SqlConnectionString environment variable!");
            context.res = {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Server configuration missing database connection string." })
            };
            return;
        }

        // 1. Safe JSON Body Check
        let body = req.body;
        if (typeof body === 'string') {
            try { 
                body = JSON.parse(body); 
            } catch (e) {
                context.res = { 
                    status: 400, 
                    headers: { 'Content-Type': 'application/json' },
                    body: { message: "Malformed JSON payload format structure." } 
                };
                return;
            }
        }

        // 2. Exact Field Presence Validation
        if (!body || !body.name || !body.email || !body.password) {
            context.res = { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' },
                body: { message: "Full Name, Email Address, and Password inputs are all required fields." } 
            };
            return;
        }

        // 3. Clean Helper: Turn "Edward" or "Sarah Jones" into initials "EK" or "SJ"
        const nameParts = body.name.trim().split(/\s+/);
        let initials = "U";
        if (nameParts.length > 1) {
            initials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
        } else if (nameParts.length === 1 && nameParts[0].length > 0) {
            initials = nameParts[0].slice(0, 2).toUpperCase();
        }

        // 4. Securely Hash the Incoming Plaintext Password with SHA-256
        const securePasswordHash = crypto.createHash('sha256').update(body.password).digest('hex');

        // 5. Execute Database Write Operation using SqlConnectionString
        await saveUserToDatabase(connectionString, body.email.trim(), securePasswordHash, body.name.trim(), initials, context);

        // 6. Return Clean Success Payload Response
        context.res = { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' }, 
            body: { success: true, message: "System User logged cleanly to the database repository." } 
        };

    } catch (error) {
        context.log.error("Fatal exception intercepted during user registration pipeline:", error.message);
        context.res = { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' },
            body: { message: "Internal user registration processing error.", details: error.message } 
        };
    }
};

/**
 * Isolated Helper function to handle the database write loop sequentially.
 */
function saveUserToDatabase(connectionString, email, passwordHash, fullName, initials, context) {
    return new Promise((resolve, reject) => {
        const config = parseConnectionString(connectionString);
        const connection = new Connection(config);

        connection.on('connect', (err) => {
            if (err) { 
                return reject(new Error(`Database connection channel failure: ${err.message}`));
            }

            const query = `
                INSERT INTO [dbo].[Users] (Email, PasswordHash, FullName, AvatarInitials) 
                VALUES (@Email, @PasswordHash, @FullName, @AvatarInitials)
            `;
            
            const request = new Request(query, (requestErr) => {
                // Ensure connection sockets are cleared immediately when execution finishes
                connection.close(); 

                if (requestErr) {
                    return reject(new Error(`SQL execution write error: ${requestErr.message}`));
                }

                context.log("User record safely committed to [dbo].[Users]");
                resolve();
            });

            // Map standard database parameters safely protecting types
            request.addParameter('Email', TYPES.VarChar, email);
            request.addParameter('PasswordHash', TYPES.VarChar, passwordHash); 
            request.addParameter('FullName', TYPES.NVarChar, fullName);
            request.addParameter('AvatarInitials', TYPES.VarChar, initials);

            connection.execSql(request);
        });

        connection.connect();
    });
}