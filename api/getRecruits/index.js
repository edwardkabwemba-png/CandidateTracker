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
                context.log("Database connection failure in GetRecruits:", err);
                context.res = { status: 500, body: "Database configuration layout error." };
                resolve();
                return;
            }

            // JOINs pull string names instead of raw foreign IDs
            const query = `
                SELECT 
                    c.RecruitID,
                    (c.Name + ' ' + c.Surname) AS FullName,
                    c.Role AS PositionTitle,
                    c.Source AS SourceName,
                    c.Date as DateSourced,
                    c.Expected_Rate as ExpectedRate,
                    c.Outcome as OutcomeName
                FROM [dbo].[Candidates_data] c
                ORDER BY c.Date DESC
            `;

            const request = new Request(query, (requestErr) => {
                if (requestErr) {
                    context.log("Query compilation breakdown error:", requestErr);
                    context.res = { status: 500, body: "Query error execution trace." };
                    connection.close();
                    resolve();
                }
            });

            // Inside api/getRecruits/index.js
            let recruitsDataset = [];

            request.on('row', (columns) => {
                let rowData = {};
                columns.forEach(col => {
                    rowData[col.metadata.colName] = col.value;
                });
                
                // Aligns database column aliases explicitly with frontend keys
                recruitsDataset.push({
                    id: rowData.RecruitID,
                    name: rowData.FullName,
                    position: rowData.PositionTitle, // Frontend looks for .position to render and filter
                    source: rowData.SourceName,     // Frontend looks for .source
                    date: rowData.DateSourced,       // Frontend looks for .date
                    rate: rowData.ExpectedRate,      // Frontend looks for .rate
                    outcome: rowData.OutcomeName     // Frontend looks for .outcome
                });
            });

            // CRITICAL: Resolve only fires here once all records have fully streamed out
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