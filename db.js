const mongoose = require('mongoose');

// Cached connection variable
let isConnected = false;

const connectToDatabase = async () => {
  if (isConnected) {
    console.log('=> Using existing database connection');
    return;
  }

  console.log('=> Creating new database connection');
  try {
    await mongoose.connect(process.env.MONGO_URI);
    isConnected = true;
    console.log('=> Database connected successfully');
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
};

module.exports = connectToDatabase;
