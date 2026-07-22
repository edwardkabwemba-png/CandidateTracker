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

    // Guard check to ensure connection string exists
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
                context.res = { status: 500, body: err.message }; 
                resolve(); 
                return; 
            }

            const query = `SELECT SourceID, SourceName FROM [dbo].[Sources] ORDER BY SourceName ASC`;
            
            const request = new Request(query, (requestErr) => {
                if (requestErr) context.res = { status: 500, body: requestErr.message };
                connection.close(); 
                resolve();
            });

            let list = [];
            
            request.on('row', (columns) => {
                let item = {};
                columns.forEach(col => { 
                    item[col.metadata.colName] = col.value; 
                });
                list.push({ id: item.SourceID, title: item.SourceName });
            });

            request.on('requestCompleted', () => {
                context.res = { 
                    status: 200, 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: list 
                };
            });

            connection.execSql(request);
        });

        connection.connect();
    });
};