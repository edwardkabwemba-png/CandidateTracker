const { Connection, Request, TYPES } = require('tedious');

const config = {
    server: process.env.DB_SERVER,
    authentication: { type: 'default', options: { userName: process.env.DB_USER, password: process.env.DB_PASSWORD } },
    options: { database: process.env.DB_NAME, encrypt: true, trustServerCertificate: false }
};

module.exports = async function (context, req) {
    // CRITICAL FIX: Force parse the body if Azure passes it as a stringified text block
    let body = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            context.res = { status: 400, body: "Malformed JSON payload." };
            return;
        }
    }

    // Use our parsed body variable instead of req.body directly
    if (!body || !body.title) {
        context.res = { status: 400, body: "Title parameter is required." };
        return;
    }

    return new Promise((resolve) => {
        const connection = new Connection(config);
        connection.on('connect', (err) => {
            if (err) { 
                context.res = { status: 500, body: `DB Connection Error: ${err.message}` }; 
                resolve(); return; 
            }

            // Target exact table and column schema mapping 
            const query = `INSERT INTO [dbo].[Positions] (PositionTitle, CreatedAt) VALUES (@Title, GETDATE())`;
            
            const request = new Request(query, (requestErr) => {
                if (requestErr) {
                    context.log("SQL Write error in savePositions:", requestErr);
                    context.res = { status: 500, body: `SQL Error: ${requestErr.message}` };
                } else {
                    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { success: true } };
                }
                connection.close(); 
                resolve();
            });

            // Make sure we pass body.title here
            request.addParameter('Title', TYPES.NVarChar, body.title);
            connection.execSql(request);
        });
        connection.connect();
    });
};