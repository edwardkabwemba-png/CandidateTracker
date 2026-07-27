const { Connection, Request } = require('tedious');

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
    return new Promise((resolve) => {
        const connection = new Connection(config);

        connection.on('connect', (err) => {
            if (err) {
                context.log.error("Database connection failure in GetSources:", err);
                context.res = { status: 500, body: `Database connection error: ${err.message}` };
                resolve();
                return;
            }

            // Pull unique non-null sources directly from candidates_data
            const query = `
                SELECT DISTINCT Source 
                FROM [dbo].[candidates_data] 
                WHERE Source IS NOT NULL AND Source <> '' 
                ORDER BY Source ASC
            `;

            const request = new Request(query, (requestErr) => {
                if (requestErr) {
                    context.log.error("SQL query execution failure in GetSources:", requestErr);
                    context.res = { status: 500, body: `SQL Query Failure: ${requestErr.message}` };
                    connection.close();
                    resolve();
                }
            });

            let sourcesList = [];

            request.on('row', (columns) => {
                const sourceVal = columns[0].value;
                if (sourceVal) {
                    sourcesList.push({ id: sourceVal, name: sourceVal });
                }
            });

            request.on('requestCompleted', () => {
                connection.close();
                context.res = {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: sourcesList
                };
                resolve();
            });

            connection.execSql(request);
        });

        connection.connect();
    });
};