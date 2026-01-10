const { MongoClient, ServerApiVersion } = require('mongodb');

// make it  Global
let client = null; // store a client to the database

async function connect(uri, dbname) {
    // singleton pattern
    // we want to ensure that the client is only created once
    if (client) {
        return client;
    }
    client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1
        }
    });

// connect to the cluster using client
await client.connect(); 
console.log("Successfully connected to Mongo")
// return a connection to a database
return client.db(dbname);

}
// make the connect function available 
// for other JavaScript files
module.exports = {
    connect
}