const { Connection, Request } = require('tedious');

// Helper to parse the ADO.NET connection string into Tedious configuration
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

    // Extract Server/Data Source (cleans 'tcp:' prefix and port numbers)
    const rawServer = parts['server'] || parts['data source'] || '';
    config.server = rawServer.replace(/^tcp:/i, '').split(',')[0];

    // Extract Auth Credentials
    config.authentication = {
        type: 'default',
        options: {
            userName: parts['user id'] || parts['uid'] || '',
            password: parts['password'] || parts['pwd'] || ''
        }
    };

    // Extract Database / Catalog name
    config.options.database = parts['initial catalog'] || parts['database'] || '';

    return config;
}

module.exports = async function (context, req) {
    const connectionString = process.env.SqlConnectionString;

    // Guard check to make sure environment variable exists
    if (!connectionString) {
        context.log("Missing SqlConnectionString environment variable!");
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: "Server configuration missing database connection string." })
        };
        return;
    }

    const config = parseConnectionString(connectionString);

    return new Promise((resolve) => {
        const connection = new Connection(config);

        connection.on('connect', (err) => {
            if (err) {
                context.log("Database connection failure in getPositions:", err);
                context.res = { 
                    status: 500, 
                    body: `Database connection error: ${err.message}` 
                };
                resolve();
                return;
            }

            const query = `
                SELECT PositionID, PositionTitle 
                FROM [dbo].[Positions] 
                ORDER BY PositionTitle ASC
            `;

            const request = new Request(query, (requestErr) => {
                if (requestErr) {
                    context.log("SQL query execution failure in getPositions:", requestErr);
                    context.res = { 
                        status: 500, 
                        body: `SQL Query Execution Failure: ${requestErr.message}` 
                    };
                    connection.close();
                    resolve();
                }
            });

            let positionsList = [];

            request.on('row', (columns) => {
                let item = {};
                columns.forEach((column) => {
                    item[column.metadata.colName] = column.value;
                });
                
                positionsList.push({
                    id: item.PositionID,
                    title: item.PositionTitle || 'Unnamed Position'
                });
            });

            request.on('requestCompleted', () => {
                connection.close();
                context.res = {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: positionsList
                };
                resolve();
            });

            connection.execSql(request);
        });

        connection.connect();
    });
};