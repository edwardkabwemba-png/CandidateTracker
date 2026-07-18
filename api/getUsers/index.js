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
                context.log("Database connection error in getUsers:", err);
                context.res = { status: 500, body: `Database connection error: ${err.message}` }; 
                resolve(); 
                return; 
            }

            // Verify table and column casing exactly matches your SQL schema
            const query = `SELECT UserID, Email, FullName, AvatarInitials FROM [dbo].[Users] ORDER BY FullName ASC`;
            
            const request = new Request(query, (requestErr) => {
                if (requestErr) {
                    context.log("SQL Query Error in getUsers:", requestErr);
                    context.res = { status: 500, body: `SQL Error: ${requestErr.message}` };
                    connection.close();
                    resolve();
                }
            });

            let usersList = [];

            // This fires for EVERY row found
            request.on('row', (columns) => {
                let item = {};
                columns.forEach(col => { 
                    item[col.metadata.colName] = col.value; 
                });
                usersList.push({ 
                    id: item.UserID, 
                    email: item.Email, 
                    name: item.FullName,
                    avatar: item.AvatarInitials || 'U'
                });
            });

            // CRITICAL: This fires ONLY when the stream is completely done processing rows
            request.on('requestCompleted', () => {
                connection.close();
                context.res = { 
                    status: 200, 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: usersList 
                };
                resolve(); // Keeps the thread alive until data is dispatched
            });

            connection.execSql(request);
        });

        connection.connect();
    });
};