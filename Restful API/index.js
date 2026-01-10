// REQUIRES
const express = require('express');
require('dotenv').config(); //put the variables in .env file into process.env
const cors = require('cors');
const { connect } = require("./db");

// SETUP EXPRESS
const app = express();
app.use(cors()); // enable cors for API
app.use(express.json()); // tells Express that we are sending & receiving JSON

// SETUP DATABASE
const mongoUri = process.env.MONGO_URI;
const dbName = "recipe_book";

async function main() {
    const db = await connect(mongoUri, dbName);

    // ROUTES
    app.get('/test', function (req, res) {
        res.json({
            "message": "Hello world"
        })
    });
    app.get('/recipes', async function (req, res) {
        const recipes = await db.collection('recipes').find().project({ 
            name: 1, prepTime: 1, instructions: 1, 
        }).toArray();
        res.json({
            "recipes": recipes
        })
    })
}
main();

// START SERVER
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, function () {
    console.log(`Server has started on ${HOST}:${PORT}`)
})