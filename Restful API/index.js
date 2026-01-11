// REQUIRES
const express = require('express');
require('dotenv').config(); //put the variables in .env file into process.env
const cors = require('cors');
const { connect } = require("./db");
const { ObjectId } = require('mongodb');
const { ai, generateSearchParams, generateRecipe } = require('./gemini');
const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const { verifyToken } = require("./middlewares")

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

    // Query String Parameter
    // name - the name of the recipe to search by
    // tags - the tag that to search for using comma delimited strings
    //        example: popular,spicy
    // ingredients - the ingredients to for using comma delimited strings
    //        example: pasta,chicken
    app.get('/recipes', async function (req, res) {

        const name = req.query.name;
        const tags = req.query.tags;
        const ingredients = req.query.ingredients;
        const critera = {};
        if (name) {
            // search by string patterns using regular expression
            critera['name'] = {
                $regex: name,
                $options: 'i' // case insensitive
            }
        }

        if (tags) {
            critera["tags.name"] = {
                $in: tags.split(",")
            }

        }
        // simple search must be exact match & case sensitive
        if (ingredients) {
            critera["ingredients.name"] = {
                $all: ingredients.split(",")
            }
        }
        // advanced search: use $all with regular expressions
        if (ingredients) {
            // traditional way of using for...loop
            const ingedientsArray = ingredients.split(",");
            const regularExpressionArray = [];
            for (let i of ingedientsArray) {
                regularExpressionArray.push(new RegExp(i, 'i')); // case insensitive
            }
            critera["ingredients.name"] = {
                $all: regularExpressionArray
            }
        }
        // modern way: use .map
        //     const regularExpressions = ingredients.split(",").map(ingredient => {
        //         return new RegExp(ingredient, 'i'); // case insensitive
        //     });
        //     critera["ingredients"] = {
        //         $all: regularExpressions
        //     }
        // }
        console.log(critera);
        const recipes = await db.collection('recipes').find(critera).project({
            name: 1, prepTime: 1, instructions: 1, ingredients: 1, tags: 1
        }).toArray();
        res.json({
            "recipes": recipes
        })
    });
    app.post('/recipes', async (req, res) => {
        try {
            const { name, cuisine, prepTime, cookTime, servings, ingredients, instructions, tags } = req.body;

            // Basic validation
            if (!name || !cuisine || !ingredients || !instructions || !tags) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Fetch the cuisine document
            const cuisineDoc = await db.collection('cuisines').findOne({ name: cuisine });
            if (!cuisineDoc) {
                return res.status(400).json({ error: 'Invalid cuisine' });
            }

            // Fetch the tag documents
            const tagDocs = await db.collection('tags').find({ name: { $in: tags } }).toArray();
            if (tagDocs.length !== tags.length) {
                return res.status(400).json({ error: 'One or more invalid tags' });
            }

            // Create the new recipe object
            const newRecipe = {
                _id: new ObjectId(),
                name,
                cuisine: {
                    _id: cuisineDoc._id,
                    name: cuisineDoc.name
                },
                prepTime,
                cookTime,
                servings,
                ingredients,
                instructions,
                tags: tagDocs.map(tag => ({
                    _id: tag._id,
                    name: tag.name
                }))
            };

            // Insert the new recipe into the database
            const result = await db.collection('recipes').insertOne(newRecipe);
            res.status(201).json({ message: 'Recipe created successfully', recipeId: result.insertedId });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.put('/recipes/:id', async (req, res) => {
        try {
            const recipeId = req.params.id;
            const { name, cuisine, prepTime, cookTime, servings, ingredients, instructions, tags } = req.body;

            // Basic validation
            if (!name || !cuisine || !ingredients || !instructions || !tags) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Fetch the cuisine document
            const cuisineDoc = await db.collection('cuisines').findOne({ name: cuisine });
            if (!cuisineDoc) {
                return res.status(400).json({ error: 'Invalid cuisine' });
            }

            // Fetch the tag documents
            const tagDocs = await db.collection('tags').find({ name: { $in: tags } }).toArray();
            if (tagDocs.length !== tags.length) {
                return res.status(400).json({ error: 'One or more invalid tags' });
            }

            // Create the updated recipe object
            const updatedRecipe = {
                name,
                cuisine: {
                    _id: cuisineDoc._id,
                    name: cuisineDoc.name
                },
                prepTime,
                cookTime,
                servings,
                ingredients,
                instructions,
                tags: tagDocs.map(tag => ({
                    _id: tag._id,
                    name: tag.name
                }))
            };

            // Update the recipe in the database
            const result = await db.collection('recipes').updateOne(
                { _id: new ObjectId(recipeId) },
                { $set: updatedRecipe }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Recipe not found' });
            }

            // Send back the success response
            res.json({
                message: 'Recipe updated successfully'
            });
        } catch (error) {
            console.error('Error updating recipe:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    app.delete('/recipes/:id', async function (req, res) {
        try {
            const recipeId = req.params.id;

            // Attempt to delete the recipe
            await db.collection('recipes').deleteOne({ _id: new ObjectId(recipeId) });
            res.json({ message: 'Recipe deleted successfully' });
        } catch (error) {
            console.error('Error deleting recipe:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    //AI
    app.get('/ai/recipes', async function (req, res) {
        const query = req.query.q;

        const allCuisines = await db.collection('cuisines').distinct('name');
        const allTags = await db.collection('tags').distinct('name');
        const allIngredients = await db.collection('recipes').distinct('ingredients.name');

        const searchParams = await generateSearchParams(query, allTags, allCuisines, allIngredients);
        console.log(searchParams);
        const critera = {};

        if (searchParams.cuisines && searchParams.cuisines.length > 0) {
            critera["cuisine.name"] = {
                $in: searchParams.cuisines
            }
        }
        if (searchParams.tags && searchParams.tags.length > 0) {
            critera["tags.name"] = {
                $in: searchParams.tags
            }
        }
        if (searchParams.ingredients && searchParams.ingredients.length > 0) {
            critera["ingredients.name"] = {
                $all: searchParams.ingredients
            }
        }
        console.log(critera);

        const recipes = await db.collection('recipes').find(critera).toArray();
        res.json({
            recipes
        })

    })
    app.post('/ai/recipes', async function (req, res) {
        const recipeText = req.body.recipeText;
        const allCuisines = await db.collection('cuisines').distinct('name');
        const allTags = await db.collection('tags').distinct('name');
        const newRecipe = await generateRecipe(recipeText, allCuisines, allTags);
        console.log(newRecipe);

        // get the cuisine document
        const cuisineDoc = await db.collection('cuisines').findOne({
            "name": newRecipe.cuisine
        });

        if (cuisineDoc) {
            newRecipe.cuisine = cuisineDoc;
        } else {
            return res.status(404).json({
                "error": "AI tried to use a cuisine that doesn't exist"
            })
        }

        // get all the tags that corresponds 
        const tagDocs = await db.collection('tags').find({
            'name': {
                $in: newRecipe.tags
            }
        }).toArray();
        newRecipe.tags = tagDocs;

        // insert into the database
        const result = await db.collection('recipes').insertOne(newRecipe);
        res.json({
            recipeId: result.insertedId
        })
    })
    //Register route
    //sample request body
    //{
    //    "email":"tanahkow@gemail.com",
    //    "password": "rotiprata123"
    //}
    app.post('/users', async function (req, res) {
        const result = await db.collection("users")
            .insertOne({
                email: req.body.email,
                password: await bcrypt.hash(req.body.password, 12)
            });
            
        res.json({
            "message": "User created successfully",
            "userId": result.insertedId
        })

    })
    // START SERVER
    app.listen(3000, function () {
        console.log("Server has started");
    });
}

main();