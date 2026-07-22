const { Connection, Request } = require('tedious');

// Helper to parse ADO.NET connection string into Tedious config
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

    const rawServer = parts['server'] || parts['data source'] || '';
    config.server = rawServer.replace(/^tcp:/i, '').split(',')[0];

    config.authentication = {
        type: 'default',
        options: {
            userName: parts['user id'] || parts['uid'] || '',
            password: parts['password'] || parts['pwd'] || ''
        }
    };

    config.options.database = parts['initial catalog'] || parts['database'] || '';
    return config;
}

module.exports = async function (context, req) {
    const connectionString = process.env.SqlConnectionString;

    // Guard check to ensure environment variable exists
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
                context.log("Database connection error in getUsers:", err);
                context.res = { status: 500, body: `Database connection error: ${err.message}` }; 
                resolve(); 
                return; 
            }

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

            request.on('requestCompleted', () => {
                connection.close();
                context.res = { 
                    status: 200, 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: usersList 
                };
                resolve();
            });

            connection.execSql(request);
        });

        connection.connect();
    });
};