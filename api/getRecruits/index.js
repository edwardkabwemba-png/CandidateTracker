const { Connection, Request } = require('tedious');

module.exports = async function (context, req) {
    // Quick guard check: inspect if env variables are actually loaded
    if (!process.env.DB_SERVER || !process.env.DB_USER) {
        context.log.error("Missing Environment Variables on server!");
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: "Server configuration missing database credentials." })
        };
        return;
    }

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
            trustServerCertificate: false,
            connectTimeout: 15000 // 15 sec timeout prevents silent hanging
        }
    };

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