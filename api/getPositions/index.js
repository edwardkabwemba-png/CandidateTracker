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
                context.log("Database connection failure in getPositions:", err);
                context.res = { 
                    status: 500, 
                    body: `Database connection error: ${err.message}` 
                };
                resolve();
                return;
            }

            // Clean query pulling straight from your Positions database columns
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
                
                // Maps property fields to match frontend expectation (id, title)
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