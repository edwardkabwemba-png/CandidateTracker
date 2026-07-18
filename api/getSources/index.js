const { Connection, Request } = require('tedious');

const config = {
    server: process.env.DB_SERVER,
    authentication: { type: 'default', options: { userName: process.env.DB_USER, password: process.env.DB_PASSWORD } },
    options: { database: process.env.DB_NAME, encrypt: true, trustServerCertificate: false }
};

module.exports = async function (context, req) {
    return new Promise((resolve) => {
        const connection = new Connection(config);
        connection.on('connect', (err) => {
            if (err) { context.res = { status: 500, body: err.message }; resolve(); return; }

            const query = `SELECT SourceID, SourceName FROM [dbo].[Sources] ORDER BY SourceName ASC`;
            const request = new Request(query, (requestErr) => {
                if (requestErr) context.res = { status: 500, body: requestErr.message };
                connection.close(); resolve();
            });

            let list = [];
            request.on('row', (columns) => {
                let item = {};
                columns.forEach(col => { item[col.metadata.colName] = col.value; });
                list.push({ id: item.SourceID, title: item.SourceName });
            });

            request.on('requestCompleted', () => {
                context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: list };
            });
            connection.execSql(request);
        });
        connection.connect();
    });
};