const { Connection, Request, TYPES } = require('tedious');

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

    // Force parse the body if passed as a stringified text block
    let body = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            context.res = { status: 400, body: "Malformed JSON payload." };
            return;
        }
    }

    if (!body || !body.title) {
        context.res = { status: 400, body: "Title parameter is required." };
        return;
    }

    const config = parseConnectionString(connectionString);

    return new Promise((resolve) => {
        const connection = new Connection(config);

        connection.on('connect', (err) => {
            if (err) { 
                context.res = { status: 500, body: `DB Connection Error: ${err.message}` }; 
                resolve(); 
                return; 
            }

            const query = `
                INSERT INTO [dbo].[Positions] (PositionTitle) 
                OUTPUT INSERTED.PositionID 
                VALUES (@Title)
            `;
            
            let insertedId = null;
            
            const request = new Request(query, (requestErr) => {
                if (requestErr) {
                    context.log("SQL Write error in savePositions:", requestErr);
                    context.res = { status: 500, body: `SQL Error: ${requestErr.message}` };
                } else {
                    context.res = { 
                        status: 200, 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: { success: true, id: insertedId, title: body.title }  
                    };
                }
                connection.close(); 
                resolve();
            });

                        // Capture the generated ID output from the INSERT query
            request.on('row', (columns) => {
                if (columns.length > 0) {
                    insertedId = columns[0].value;
                }
            });

            request.addParameter('Title', TYPES.NVarChar, body.title);
            connection.execSql(request);
        });

        connection.connect();
    });
};