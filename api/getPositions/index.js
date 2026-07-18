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
                context.res = { 
                    status: 500, 
                    body: `Database connection error: ${err.message}` 
                };
                resolve();
                return;
            }

            // Pulls comprehensive candidate info while joining lookup IDs to plain strings
            const query = `
                SELECT 
                    r.RecruitID,
                    r.DateSourced,
                    r.FirstName,
                    r.Surname,
                    r.Email,
                    r.MainCountryCode,
                    r.MainBaseNumber,
                    r.AlternateCountryCode,
                    r.AlternateBaseNumber,
                    r.CurrentRate,
                    r.ExpectedRate,
                    r.YearsOfExperience,
                    r.NoticePeriod,
                    r.Nationality,
                    r.CurrentLocation,
                    r.Comments,
                    p.PositionTitle AS PositionName,
                    s.SourceName AS SourceName,
                    u.UserName AS RecruiterName,
                    r.OutcomeID
                FROM [dbo].[Recruits] r
                LEFT JOIN [dbo].[Positions] p ON r.PositionID = p.PositionID
                LEFT JOIN [dbo].[Sources] s ON r.SourceID = s.SourceID
                LEFT JOIN [dbo].[Users] u ON r.RecruiterUserID = u.UserID
                ORDER BY r.DateSourced DESC, r.RecruitID DESC
            `;

            const request = new Request(query, (requestErr) => {
                if (requestErr) {
                    context.log("SQL query execution failure in GetRecruits:", requestErr);
                    context.res = { 
                        status: 500, 
                        body: `SQL Query Execution Failure: ${requestErr.message}` 
                    };
                    connection.close();
                    resolve();
                }
            });

            let recruitsList = [];

            request.on('row', (columns) => {
                let rowData = {};
                columns.forEach((column) => {
                    rowData[column.metadata.colName] = column.value;
                });
                
                // Construct a structured object that matches your frontend dashboard expectations
                recruitsList.push({
                    id: rowData.RecruitID,
                    date: rowData.DateSourced,
                    firstName: rowData.FirstName,
                    surname: rowData.Surname,
                    fullName: `${rowData.FirstName} ${rowData.Surname}`,
                    email: rowData.Email,
                    position: rowData.PositionName || 'Unassigned',
                    source: rowData.SourceName || 'Unknown',
                    recruiter: rowData.RecruiterName || 'System',
                    currentRate: rowData.CurrentRate,
                    expectedRate: rowData.ExpectedRate || 0, // Fallback for table sorting
                    yearsOfExperience: rowData.YearsOfExperience,
                    noticePeriod: rowData.NoticePeriod,
                    nationality: rowData.Nationality,
                    location: rowData.CurrentLocation,
                    outcome: mapOutcomeText(rowData.OutcomeID), // Convert ID back to string text for UI
                    comments: rowData.Comments,
                    phone: rowData.MainBaseNumber ? `${rowData.MainCountryCode || ''}${rowData.MainBaseNumber}` : null,
                    altPhone: rowData.AlternateBaseNumber ? `${rowData.AlternateCountryCode || ''}${rowData.AlternateBaseNumber}` : null
                });
            });

            request.on('requestCompleted', () => {
                connection.close();
                context.res = {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: recruitsList
                };
                resolve();
            });

            connection.execSql(request);
        });

        connection.connect();
    });
};

// Helper function to resolve Outcome UI strings consistently
function mapOutcomeText(id) {
    const outcomes = {
        1: 'In Progress',
        2: 'Placed',
        3: 'Declined Offer',
        4: 'Not Suitable',
        5: 'On Hold',
        6: 'Interviewing',
        7: 'Offered'
    };
    return outcomes[id] || 'In Progress';
}