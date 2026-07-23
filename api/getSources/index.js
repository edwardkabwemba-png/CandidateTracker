const { Connection, Request } = require('tedious');

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

  if (!connectionString) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: "Missing SqlConnectionString environment variable." })
    };
    return;
  }

  const config = parseConnectionString(connectionString);

  return new Promise((resolve) => {
    const connection = new Connection(config);
    const sources = [];

    connection.on('connect', (err) => {
      if (err) {
        context.res = { 
          status: 500, 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `DB Connection Error: ${err.message}` }) 
        };
        resolve();
        return;
      }

      // Query sources table (Adjust column/table names if your schema uses different names)
      const query = `SELECT SourceID, SourceName FROM [dbo].[Sources] ORDER BY SourceName ASC`;
      
      const request = new Request(query, (requestErr) => {
        connection.close();
        
        if (requestErr) {
          context.res = { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: `SQL Error: ${requestErr.message}` }) 
          };
        } else {
          context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sources)
          };
        }
        resolve();
      });

      request.on('row', (columns) => {
        const row = {};
        columns.forEach((col) => {
          row[col.metadata.colName] = col.value;
        });
        sources.push(row);
      });

      connection.execSql(request);
    });

    connection.connect();
  });
};