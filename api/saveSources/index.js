const { Connection, Request, TYPES } = require('tedious');

const config = {
    server: process.env.DB_SERVER,
    authentication: { type: 'default', options: { userName: process.env.DB_USER, password: process.env.DB_PASSWORD } },
    options: { database: process.env.DB_NAME, encrypt: true, trustServerCertificate: false }
};

module.exports = async function (context, req) {
    if (!req.body || !req.body.title) {
        context.res = { status: 400, body: "Source title parameter is required." };
        return;
    }

    return new Promise((resolve) => {
        const connection = new Connection(config);
        connection.on('connect', (err) => {
            if (err) { 
                context.res = { status: 500, body: `DB Connection Error: ${err.message}` }; 
                resolve(); return; 
            }

            const query = `INSERT INTO [dbo].[Sources] (SourceName, CreatedAt) VALUES (@Title, GETDATE())`;
            
            const request = new Request(query, (requestErr) => {
                if (requestErr) {
                    context.log("SQL Write error in saveSources:", requestErr);
                    context.res = { status: 500, body: `SQL Error: ${requestErr.message}` };
                } else {
                    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { success: true } };
                }
                connection.close(); 
                resolve();
            });

            request.addParameter('Title', TYPES.NVarChar, req.body.title);
            connection.execSql(request);
        });
        connection.connect();
    });
};