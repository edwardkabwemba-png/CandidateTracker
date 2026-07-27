const { Connection, Request } = require('tedious');

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

module.exports = async function (context, req) {
    const sourceName = req.body && req.body.sourceName;

    if (!sourceName) {
        context.res = {
            status: 400,
            body: "Source name is required."
        };
        return;
    }

    return new Promise((resolve) => {
        const connection = new Connection(config);

        connection.on('connect', (err) => {
            if (err) {
                context.log.error("Database connection failure in AddSource:", err);
                context.res = { status: 500, body: `Database Connection Error: ${err.message}` };
                resolve();
                return;
            }

            // Insert into your new Sources table structure
            const query = `
                INSERT INTO [dbo].[Sources] (SourceName) 
                VALUES (@SourceName);
            `;

            const request = new Request(query, (requestErr) => {
                if (requestErr) {
                    context.log.error("SQL query execution failure in AddSource:", requestErr);
                    context.res = { status: 500, body: `SQL Execution Error: ${requestErr.message}` };
                    connection.close();
                    resolve();
                }
            });

            // Bind parameters safely to avoid SQL injection
            request.addParameter('SourceName', TYPES.NVarChar, sourceName);

            request.on('requestCompleted', () => {
                connection.close();
                context.res = {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true, message: "Source added successfully." })
                };
                resolve();
            });

            connection.execSql(request);
        });

        connection.connect();
    });
};