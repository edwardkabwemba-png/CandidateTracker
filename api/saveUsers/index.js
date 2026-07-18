const { Connection, Request, TYPES } = require('tedious');
const crypto = require('crypto'); // Built-in Node.js module (completely stable, zero-dependency)

// Configuration pulling securely from Azure App Settings environment variables
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
    context.log('Processing secure system user registration request...');

    try {
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

        // 5. Execute Database Write Operation
        await saveUserToDatabase(body.email.trim(), securePasswordHash, body.name.trim(), initials, context);

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
function saveUserToDatabase(email, passwordHash, fullName, initials, context) {
    return new Promise((resolve, reject) => {
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