const { Connection, Request, TYPES } = require('tedious');

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
  config.options.database = parts['initial catalog'] || parts['database'] || '';

  config.authentication = {
    type: 'default',
    options: {
      userName: parts['user id'] || parts['uid'] || '',
      password: parts['password'] || parts['pwd'] || ''
    }
  };

  return config;
}

module.exports = async function (context, req) {
  const sourceName = req.body && req.body.sourceName;

  if (!sourceName) {
    context.res = {
      status: 400,
      body: "Source name is required."
    };
    return;
  }

  const connectionString = process.env.SqlConnectionString;
  const config = parseConnectionString(connectionString);

  return new Promise((resolve) => {
    const connection = new Connection(config);

    connection.on('connect', (err) => {
      if (err) {
        context.log.error("DB Connection Error:", err);
        context.res = { status: 500, body: `DB Connection Error: ${err.message}` };
        resolve();
        return;
      }

      const query = `INSERT INTO [dbo].[Sources] (SourceName) VALUES (@SourceName);`;

      // Single callback handles BOTH error and success without race conditions
      const request = new Request(query, (requestErr, rowCount) => {
        connection.close(); // Always close connection when query completes

        if (requestErr) {
          context.log.error("SQL Execution Error:", requestErr);
          context.res = { 
            status: 500, 
            body: `SQL Error: ${requestErr.message}` 
          };
        } else {
          context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, rowsInserted: rowCount })
          };
        }
        resolve();
      });

      request.addParameter('SourceName', TYPES.NVarChar, sourceName);

      connection.execSql(request);
    });

    connection.connect();
  });
};