const { Connection, Request } = require('tedious');

// Utility helper to extract values from an ADO.NET connection string
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

    // Extract Server/Data Source (removes 'tcp:' prefix and ',1433' port suffix if present)
    const rawServer = parts['server'] || parts['data source'] || '';
    config.server = rawServer.replace(/^tcp:/i, '').split(',')[0];

    // Extract Authentication
    config.authentication = {
        type: 'default',
        options: {
            userName: parts['user id'] || parts['uid'] || '',
            password: parts['password'] || parts['pwd'] || ''
        }
    };

    // Extract Database / Catalog
    config.options.database = parts['initial catalog'] || parts['database'] || '';

    return config;
}

module.exports = async function (context, req) {
    const connectionString = process.env.SqlConnectionString;

    // Guard check for connection string existence
    if (!connectionString) {
        context.log.error("Missing SqlConnectionString environment variable!");
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
                context.log.error("Database connection failure in getRecruits:", err);
                context.res = {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: "Failed to connect to the database.", details: err.message })
                };
                resolve();
                return;
            }

            const query = `
                SELECT 
                    RecruitID,
                    (Name + ' ' + Surname) AS FullName,
                    Role as PositionTitle,
                    Source as SourceName,
                    Date as DateSourced,
                    Expected_Rate as ExpectedRate,
                    Outcome as OutcomeName
                FROM [dbo].[Candidates_data]
                ORDER BY Date Desc
            `;

            const request = new Request(query, (requestErr) => {
                if (requestErr) {
                    context.log.error("Query compilation failure:", requestErr);
                    context.res = {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ error: "Failed to execute query." })
                    };
                    connection.close();
                    resolve();
                }
            });

            let recruitsDataset = [];

            request.on('row', (columns) => {
                let rowData = {};
                columns.forEach(col => {
                    rowData[col.metadata.colName] = col.value;
                });
                
                recruitsDataset.push({
                    id: rowData.RecruitID,
                    name: rowData.FullName,
                    position: rowData.PositionTitle,
                    source: rowData.SourceName,
                    date: rowData.DateSourced,
                    rate: rowData.ExpectedRate,
                    outcome: rowData.OutcomeName
                });
            });

            request.on('requestCompleted', () => {
                connection.close();
                context.res = {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: recruitsDataset
                };
                resolve();
            });

            connection.execSql(request);
        });

        connection.connect();
    });
};